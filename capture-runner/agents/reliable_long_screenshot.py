#!/usr/bin/env python3
"""
Reliable Android / Pixel emulator long screenshot stitcher with adaptive page profiling.

Quality goals:
- Vertical-only stitching. No warping, no homography, no perspective correction.
- Auto-profiles persistent top/bottom chrome per page.
- Auto-detects bottom-nav presence for _withnav / _nonav naming.
- Auto-detects common blue floating action buttons with stricter shape validation and restores them as final overlays.
- Masks floating action button zones and unstable dynamic regions.
- Uses global alignment confidence, local seam quality, duplicate/gap prevention,
  and strict ACCEPT / REJECT behavior.
- Runs an alignment-based page-profile search so bad auto crops/FAB false positives can self-correct before stitching.
- Restores fixed floating overlays once at final render time, with exact FAB-only overlay restoration and no layout-changing bottom gutter by default.
- Optionally scrolls the device back to the top after capture so the emulator is reset for the next run.
- Supports a seam-local rescue path for cases where a video/ad/animation changes
  elsewhere in the overlap but the chosen seam neighborhood is excellent.
- Handles changing sticky tab/header chrome more robustly by trimming overlap
  edges from the row-profile score and allowing a very strict sticky-chrome
  rescue when the seam-local evidence is near-perfect.

Typical run:
    python reliable_long_screenshot.py \
      --device emulator-5554 \
      --scrolls 5 \
      --out ./graet_longshot_test

More conservative small-scroll test:
    python reliable_long_screenshot.py \
      --device emulator-5554 \
      --scrolls 5 \
      --out ./graet_longshot_test_v3 \
      --swipe-start-ratio 0.64 \
      --swipe-end-ratio 0.54 \
      --swipe-duration-ms 420 \
      --settle-after-scroll 1.6 \
      --pair-delay 0.30 \
      --min-overlap-px 900 \
      --max-scroll-ratio 0.48

Stitch existing screenshots instead of using ADB:
    python reliable_long_screenshot.py --input-dir ./screens --out ./longshot_from_files

Dependencies:
    pip install opencv-python numpy
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np


# -----------------------------
# Data models
# -----------------------------

@dataclass
class Frame:
    idx: int
    content: np.ndarray
    match_valid: np.ndarray
    comp_valid: np.ndarray
    raw_shape: tuple[int, int, int]
    top_crop: int
    bottom_crop: int
    raw_image: np.ndarray


@dataclass
class Candidate:
    delta: int
    overlap: int
    score: float
    gray_score: float
    edge_score: float
    row_score: float
    valid_ratio: float

    def as_dict(self) -> dict:
        return {
            "delta": int(self.delta),
            "overlap": int(self.overlap),
            "score": float(self.score),
            "gray_score": float(self.gray_score),
            "edge_score": float(self.edge_score),
            "row_score": float(self.row_score),
            "valid_ratio": float(self.valid_ratio),
        }


@dataclass
class StitchDecision:
    pair: str
    accepted: bool
    reasons: list[str]

    delta: Optional[int] = None
    overlap: Optional[int] = None
    seam: Optional[int] = None
    seam_global_in_next_frame: Optional[int] = None

    best_score: Optional[float] = None
    second_best_score: Optional[float] = None
    score_margin: Optional[float] = None

    gray_best_delta: Optional[int] = None
    edge_best_delta: Optional[int] = None
    row_best_delta: Optional[int] = None
    method_spread_px: Optional[int] = None

    gray_score: Optional[float] = None
    edge_score: Optional[float] = None
    row_score: Optional[float] = None
    valid_ratio: Optional[float] = None

    seam_error: Optional[float] = None
    seam_valid_ratio: Optional[float] = None

    # Seam-local rescue diagnostics.
    seam_local_score: Optional[float] = None
    seam_local_mae: Optional[float] = None
    seam_local_gray_ncc: Optional[float] = None
    seam_local_edge_ncc: Optional[float] = None
    seam_edge_density: Optional[float] = None
    seam_local_valid_ratio: Optional[float] = None
    rescued_by_local_seam: bool = False
    rescued_by_sticky_chrome: bool = False
    sticky_rescue_reason: Optional[str] = None

    def as_dict(self) -> dict:
        return self.__dict__.copy()


# -----------------------------
# ADB capture / scroll
# -----------------------------

def adb_cmd(device: Optional[str], args: list[str], timeout: int = 30) -> bytes:
    cmd = ["adb"]
    if device:
        cmd += ["-s", device]
    cmd += args

    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            f"ADB command failed:\n{' '.join(cmd)}\n\n"
            f"STDERR:\n{proc.stderr.decode(errors='replace')}"
        )

    return proc.stdout


def adb_screenshot(device: Optional[str]) -> np.ndarray:
    try:
        png = adb_cmd(device, ["exec-out", "screencap", "-p"], timeout=20)
    except Exception:
        png = adb_cmd(device, ["shell", "screencap", "-p"], timeout=20)
        png = png.replace(b"\r\n", b"\n")

    arr = np.frombuffer(png, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        raise RuntimeError("Could not decode screenshot from ADB.")

    return img


def adb_swipe(device: Optional[str], width: int, height: int, args) -> None:
    x = int(width * args.swipe_x_ratio)
    y1 = int(height * args.swipe_start_ratio)
    y2 = int(height * args.swipe_end_ratio)

    adb_cmd(
        device,
        [
            "shell",
            "input",
            "swipe",
            str(x),
            str(y1),
            str(x),
            str(y2),
            str(args.swipe_duration_ms),
        ],
        timeout=10,
    )


def adb_reverse_swipe_to_top_step(device: Optional[str], width: int, height: int, args) -> None:
    """
    One upward-content scroll step: the finger moves down, so the page moves
    toward the top. This is the inverse of the capture swipe.
    """
    x_ratio = args.return_to_top_x_ratio
    if x_ratio is None:
        x_ratio = args.swipe_x_ratio

    start_ratio = args.return_to_top_start_ratio
    if start_ratio is None:
        start_ratio = args.swipe_end_ratio

    end_ratio = args.return_to_top_end_ratio
    if end_ratio is None:
        end_ratio = args.swipe_start_ratio

    duration = args.return_to_top_duration_ms
    if duration is None:
        duration = args.swipe_duration_ms

    x = int(width * float(x_ratio))
    y1 = int(height * float(start_ratio))
    y2 = int(height * float(end_ratio))

    adb_cmd(
        device,
        [
            "shell",
            "input",
            "swipe",
            str(x),
            str(y1),
            str(x),
            str(y2),
            str(int(duration)),
        ],
        timeout=10,
    )


def _ncc_score(a: np.ndarray, b: np.ndarray) -> float:
    av = a.astype(np.float32).reshape(-1)
    bv = b.astype(np.float32).reshape(-1)
    av -= float(av.mean())
    bv -= float(bv.mean())
    denom = math.sqrt(float((av * av).sum()) * float((bv * bv).sum()))
    if denom < 1e-8:
        return -1.0
    return float((av * bv).sum() / denom)


def screenshot_similarity_to_reference(current: np.ndarray, reference: np.ndarray, args) -> dict:
    """
    Lightweight check used only for returning the device to the top.

    We compare the central scrollable area rather than the whole screenshot,
    because status bars and bottom navs may stay identical even when the page
    is not back at the top yet.
    """
    if current.shape != reference.shape:
        return {"ncc": -1.0, "mae": 999.0, "matched": False, "reason": "shape mismatch"}

    h, w = current.shape[:2]
    y0 = int(round(h * args.return_to_top_compare_y0_ratio))
    y1 = int(round(h * args.return_to_top_compare_y1_ratio))
    x0 = int(round(w * args.return_to_top_compare_x0_ratio))
    x1 = int(round(w * args.return_to_top_compare_x1_ratio))

    y0 = max(0, min(y0, h - 2))
    y1 = max(y0 + 2, min(y1, h))
    x0 = max(0, min(x0, w - 2))
    x1 = max(x0 + 2, min(x1, w))

    cg = cv2.cvtColor(current[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    rg = cv2.cvtColor(reference[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)

    # Resize for speed and to soften tiny dynamic text/time differences.
    target_w = min(240, cg.shape[1])
    scale = target_w / max(1, cg.shape[1])
    target_h = max(2, int(round(cg.shape[0] * scale)))
    cg = cv2.resize(cg, (target_w, target_h), interpolation=cv2.INTER_AREA)
    rg = cv2.resize(rg, (target_w, target_h), interpolation=cv2.INTER_AREA)

    ncc = _ncc_score(cg, rg)
    mae = float(np.mean(np.abs(cg.astype(np.float32) - rg.astype(np.float32))))

    ce = cv2.Canny(cg, 50, 150).astype(np.float32) / 255.0
    re = cv2.Canny(rg, 50, 150).astype(np.float32) / 255.0
    edge_ncc = _ncc_score(ce, re)

    # IMPORTANT: this is deliberately AND, not OR.
    #
    # Repeated card/list layouts can produce a deceptively high NCC at the wrong
    # vertical position. A true return to the captured viewport should agree in
    # luminance, absolute error, and edge structure.
    matched = bool(
        ncc >= float(args.return_to_top_match_ncc)
        and mae <= float(args.return_to_top_match_mae)
        and edge_ncc >= float(args.return_to_top_match_edge_ncc)
    )

    return {
        "ncc": float(ncc),
        "mae": float(mae),
        "edge_ncc": float(edge_ncc),
        "matched": matched,
        "reason": "matched reference" if matched else "not yet at reference viewport",
        "compare_box": [int(x0), int(y0), int(x1), int(y1)],
    }


def screenshot_no_scroll_similarity(
    previous: np.ndarray,
    current: np.ndarray,
    args,
    previous_peer: Optional[np.ndarray] = None,
    current_peer: Optional[np.ndarray] = None,
) -> dict:
    """
    Detect whether a requested downward scroll failed to move the viewport.

    This compares only the stable scrollable content area, not the full screen.
    It excludes top chrome, bottom nav/gesture area, right-side FAB zone, and
    dynamic pixels detected from same-position duplicate screenshots.
    """
    if previous is None or current is None or previous.shape != current.shape:
        return {
            "at_bottom": False,
            "ncc": -1.0,
            "mae": 999.0,
            "edge_mae": 999.0,
            "valid_ratio": 0.0,
            "reason": "shape mismatch or missing image",
        }

    h, w = current.shape[:2]

    # Prefer effective crop values if already available, otherwise use safe ratios.
    effective_top = getattr(args, "_effective_top_crop", None)
    effective_bottom = getattr(args, "_effective_bottom_crop", None)

    y0_ratio = int(round(h * float(args.auto_bottom_compare_y0_ratio)))
    y1_ratio = int(round(h * float(args.auto_bottom_compare_y1_ratio)))

    if effective_top is not None:
        y0 = max(y0_ratio, int(effective_top) + int(args.auto_bottom_crop_padding_px))
    else:
        y0 = y0_ratio

    if effective_bottom is not None:
        y1 = min(y1_ratio, h - int(effective_bottom) - int(args.auto_bottom_crop_padding_px))
    else:
        y1 = y1_ratio

    x0 = int(round(w * float(args.auto_bottom_compare_x0_ratio)))
    x1 = int(round(w * float(args.auto_bottom_compare_x1_ratio)))

    y0 = max(0, min(y0, h - 2))
    y1 = max(y0 + 2, min(y1, h))
    x0 = max(0, min(x0, w - 2))
    x1 = max(x0 + 2, min(x1, w))

    prev_crop = previous[y0:y1, x0:x1]
    curr_crop = current[y0:y1, x0:x1]

    pg = cv2.cvtColor(prev_crop, cv2.COLOR_BGR2GRAY)
    cg = cv2.cvtColor(curr_crop, cv2.COLOR_BGR2GRAY)

    valid = np.ones(pg.shape, dtype=bool)

    # Exclude dynamic pixels at the previous and current scroll positions.
    # This helps ignore videos, animations, loading shimmer, live counters, etc.
    if previous_peer is not None and previous_peer.shape == previous.shape:
        pp_crop = previous_peer[y0:y1, x0:x1]
        ppg = cv2.cvtColor(pp_crop, cv2.COLOR_BGR2GRAY)
        dyn_prev = cv2.absdiff(pg, ppg) > int(args.auto_bottom_dynamic_threshold)
        valid &= ~dyn_prev

    if current_peer is not None and current_peer.shape == current.shape:
        cp_crop = current_peer[y0:y1, x0:x1]
        cpg = cv2.cvtColor(cp_crop, cv2.COLOR_BGR2GRAY)
        dyn_curr = cv2.absdiff(cg, cpg) > int(args.auto_bottom_dynamic_threshold)
        valid &= ~dyn_curr

    if int(args.auto_bottom_dynamic_dilate_px) > 0:
        k = int(args.auto_bottom_dynamic_dilate_px)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        invalid = cv2.dilate((~valid).astype(np.uint8), kernel, iterations=1).astype(bool)
        valid = ~invalid

    # Exclude the likely FAB/overlay zone from bottom detection.
    # Even if no FAB exists, this is a safe tradeoff because the central content
    # still carries enough signal.
    if bool(args.auto_bottom_exclude_fab_zone):
        rh, rw = valid.shape[:2]
        fx0 = int(round(rw * float(args.auto_bottom_fab_x0_ratio)))
        fy0 = int(round(rh * float(args.auto_bottom_fab_y0_ratio)))
        fx0 = max(0, min(fx0, rw))
        fy0 = max(0, min(fy0, rh))
        valid[fy0:rh, fx0:rw] = False

    target_w = min(int(args.auto_bottom_compare_width_px), pg.shape[1])
    scale = target_w / max(1, pg.shape[1])
    target_h = max(2, int(round(pg.shape[0] * scale)))

    pg = cv2.resize(pg, (target_w, target_h), interpolation=cv2.INTER_AREA)
    cg = cv2.resize(cg, (target_w, target_h), interpolation=cv2.INTER_AREA)
    valid = cv2.resize(
        valid.astype(np.uint8),
        (target_w, target_h),
        interpolation=cv2.INTER_NEAREST,
    ).astype(bool)

    valid_ratio = float(valid.mean())
    if valid_ratio < float(args.auto_bottom_min_valid_ratio):
        return {
            "at_bottom": False,
            "ncc": -1.0,
            "mae": 999.0,
            "edge_mae": 999.0,
            "valid_ratio": valid_ratio,
            "compare_box": [int(x0), int(y0), int(x1), int(y1)],
            "reason": "not enough stable pixels for bottom detection",
        }

    pv = pg[valid].astype(np.float32)
    cv = cg[valid].astype(np.float32)

    pv_centered = pv - float(pv.mean())
    cv_centered = cv - float(cv.mean())

    denom = math.sqrt(float((pv_centered * pv_centered).sum()) * float((cv_centered * cv_centered).sum()))
    if denom < 1e-8:
        ncc = -1.0
    else:
        ncc = float((pv_centered * cv_centered).sum() / denom)

    mae = float(np.mean(np.abs(pv - cv)))

    pe = cv2.Canny(pg, 50, 150)
    ce = cv2.Canny(cg, 50, 150)
    edge_mae = float(np.mean(np.abs(pe[valid].astype(np.float32) - ce[valid].astype(np.float32))))

    strict_same = (
        ncc >= float(args.auto_bottom_match_ncc)
        and mae <= float(args.auto_bottom_match_mae)
    )

    structural_same = (
        ncc >= float(args.auto_bottom_structural_ncc)
        and mae <= float(args.auto_bottom_structural_mae)
        and edge_mae <= float(args.auto_bottom_edge_mae)
    )

    at_bottom = bool(strict_same or structural_same)

    return {
        "at_bottom": at_bottom,
        "ncc": float(ncc),
        "mae": float(mae),
        "edge_mae": float(edge_mae),
        "valid_ratio": valid_ratio,
        "strict_same": bool(strict_same),
        "structural_same": bool(structural_same),
        "compare_box": [int(x0), int(y0), int(x1), int(y1)],
        "reason": "stable scrollable content unchanged after scroll" if at_bottom else "stable scrollable content changed after scroll",
    }


def return_device_to_top(reference_img: Optional[np.ndarray], args, out_dir: Optional[Path] = None) -> dict:
    """
    Restore the device to the FIRST CAPTURED VIEWPORT.

    Critical invariant:
      never accept a visual "match" before replaying the expected number of
      reverse scroll gestures.

    Why:
      repeated mobile cards/tabs can look similar at many scroll positions.
      The old routine could see NCC/MAE similarity after ONE reverse swipe and
      incorrectly declare success even after 10+ forward capture swipes.

    Restoration now has two stages:
      1. deterministically replay one inverse gesture for every captured scroll
         step; no early-stop is allowed here.
      2. only after that replay, use strict image+edge verification. A bounded
         number of extra reverse swipes is allowed only if verification still
         says the first viewport has not been restored.
    """
    report = {
        "enabled": bool(args.return_to_top),
        "attempted": False,
        "swipes": 0,
        "expected_reverse_swipes": 0,
        "matched_reference": False,
        "final_similarity": None,
        "reason": "disabled",
        "early_match_ignored": 0,
    }

    if not args.return_to_top:
        return report

    if reference_img is None:
        report["reason"] = "no reference image available"
        return report

    h, w = reference_img.shape[:2]
    captured_steps = int(getattr(args, "_captured_scroll_steps", args.scrolls))
    captured_steps = max(0, captured_steps)

    report["attempted"] = True
    report["expected_reverse_swipes"] = captured_steps

    # No scroll occurred: verify the current viewport directly.
    if captured_steps == 0:
        current = adb_screenshot(args.device)
        sim = screenshot_similarity_to_reference(current, reference_img, args)
        report["final_similarity"] = sim
        report["matched_reference"] = bool(sim.get("matched"))
        report["reason"] = (
            "no captured scroll steps; current viewport matches reference"
            if report["matched_reference"]
            else "no captured scroll steps but current viewport differs from reference"
        )
        return report

    replay_target = min(captured_steps, int(args.return_to_top_max_swipes))
    extra_budget = max(0, int(args.return_to_top_extra_swipes))
    max_swipes = min(
        replay_target + extra_budget,
        int(args.return_to_top_max_swipes),
    )
    report["max_swipes"] = int(max_swipes)

    last_similarity = None

    for i in range(max_swipes):
        adb_reverse_swipe_to_top_step(args.device, w, h, args)
        time.sleep(float(args.return_to_top_settle))

        current = adb_screenshot(args.device)
        sim = screenshot_similarity_to_reference(current, reference_img, args)
        last_similarity = sim

        report["swipes"] = i + 1
        report["final_similarity"] = sim

        if out_dir is not None and args.return_to_top_debug:
            debug_dir = out_dir / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(debug_dir / f"return_to_top_{i + 1:02d}.png"), current)

        replay_complete = (i + 1) >= replay_target

        # A visual match before replay completion is NOT trusted. This is the
        # false-positive mode seen on repeated OfferToday job cards.
        if bool(sim.get("matched")) and not replay_complete:
            report["early_match_ignored"] += 1
            continue

        if bool(sim.get("matched")) and replay_complete:
            report["matched_reference"] = True
            report["reason"] = (
                f"strictly matched first viewport after {i + 1} reverse swipes "
                f"(expected replay={replay_target})"
            )
            break
    else:
        report["reason"] = (
            "reverse replay completed but strict first-viewport verification "
            "did not match"
        )

    if out_dir is not None:
        try:
            debug_dir = out_dir / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            final_img = adb_screenshot(args.device)
            cv2.imwrite(str(debug_dir / "return_to_top_final.png"), final_img)
            report["final_similarity"] = screenshot_similarity_to_reference(
                final_img,
                reference_img,
                args,
            )
            if report["final_similarity"].get("matched"):
                report["matched_reference"] = True
                if "strictly matched" not in report["reason"]:
                    report["reason"] = (
                        f"final strict verification matched after "
                        f"{report['swipes']} reverse swipes"
                    )
        except Exception as exc:
            report["debug_capture_error"] = str(exc)

    sim = report.get("final_similarity") or {}
    print(
        "Return-to-start: "
        f"swipes={report['swipes']}/"
        f"{report['expected_reverse_swipes']} "
        f"matched={report['matched_reference']} "
        f"early_matches_ignored={report['early_match_ignored']} "
        f"ncc={sim.get('ncc')} "
        f"mae={sim.get('mae')} "
        f"edge_ncc={sim.get('edge_ncc')} "
        f"reason={report['reason']}"
    )

    return report


# -----------------------------
# Frame preparation / masks
# -----------------------------

def read_image(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"Could not read image: {path}")
    return img


def resolve_crops(img: np.ndarray, args) -> tuple[int, int]:
    h = img.shape[0]

    # Auto chrome detection can set these after the raw screenshots are captured.
    # Explicit --top-crop / --bottom-crop still wins.
    top = args.top_crop
    bottom = args.bottom_crop

    if top is None:
        top = getattr(args, "_effective_top_crop", None)
    if bottom is None:
        bottom = getattr(args, "_effective_bottom_crop", None)

    if top is None:
        top = int(round(h * args.top_crop_ratio))
    if bottom is None:
        bottom = int(round(h * args.bottom_crop_ratio))

    top = max(0, min(int(top), h - 10))
    bottom = max(0, min(int(bottom), h - top - 10))

    return top, bottom


def detect_dynamic_mask(img1: np.ndarray, img2: np.ndarray, args) -> np.ndarray:
    """
    Detect pixels changing while the scroll position is the same.

    This catches videos, animations, spinners, shimmer loaders, live counters,
    and other unstable regions. These pixels are excluded from matching/seaming.
    """
    if img1.shape != img2.shape:
        return np.zeros(img1.shape[:2], dtype=bool)

    g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

    diff = cv2.absdiff(g1, g2)
    mask = diff > args.dynamic_threshold

    if args.dynamic_dilate_px > 0:
        k = int(args.dynamic_dilate_px)
        if k % 2 == 0:
            k += 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        mask = cv2.dilate(mask.astype(np.uint8), kernel, iterations=1).astype(bool)

    return mask


def static_invalid_masks(content_h: int, width: int, args) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns two static masks inside the already-cropped content image:

    1. match_invalid: aggressive. Used only for alignment/seam math.
       This can mask a large right-side rectangle around the FAB so the
       persistent overlay cannot influence registration.

    2. comp_invalid: precise. Used for the final composite.
       This should only mask pixels we truly do not want in the output.
       A huge rectangular FAB mask creates unnecessary holes; a circular
       output mask is much safer.
    """
    match_invalid = np.zeros((content_h, width), dtype=bool)
    comp_invalid = np.zeros((content_h, width), dtype=bool)

    b = args.mask_border_px
    if b > 0:
        for invalid in (match_invalid, comp_invalid):
            invalid[:b, :] = True
            invalid[-b:, :] = True
            invalid[:, :b] = True
            invalid[:, -b:] = True

    # Aggressive rectangular FAB mask for matching only.
    # This prevents the fixed blue button from producing false correlations.
    if args.fab_mask:
        x0 = int(round(width * args.fab_x0_ratio))
        y0 = int(round(content_h * args.fab_y0_ratio))
        y1 = int(round(content_h * args.fab_y1_ratio))

        x0 = max(0, min(x0, width))
        y0 = max(0, min(y0, content_h))
        y1 = max(y0, min(y1, content_h))

        match_invalid[y0:y1, x0:width] = True

    # Precise output FAB mask.
    # Default is a circle around the bottom-right floating action button.
    # This removes the button from the final image without blanking the whole
    # right side of the feed.
    if args.mask_fab_in_output:
        cx = int(round(width * args.fab_output_cx_ratio))
        cy = int(round(content_h * args.fab_output_cy_ratio))
        r = int(round(min(width, content_h) * args.fab_output_radius_ratio))
        r = max(args.fab_output_min_radius_px, r)

        yy, xx = np.ogrid[:content_h, :width]
        circle = (xx - cx) ** 2 + (yy - cy) ** 2 <= r ** 2
        comp_invalid |= circle

    return match_invalid, comp_invalid



def estimate_persistent_bottom_height(raw_images: list[np.ndarray], args) -> dict:
    """
    Estimate how many pixels at the bottom stay fixed while the page scrolls.

    This is the signal we use to distinguish:
      - bottom nav present: large persistent bottom band
      - no bottom nav: only a small system gesture area is persistent

    It is intentionally conservative. The result is used for crop/output naming,
    not for geometric warping.
    """
    if len(raw_images) < 2:
        return {
            "persistent_bottom_height_px": 0,
            "row_diff_threshold": float(args.bottom_nav_stable_threshold),
            "used_pairs": 0,
            "bottom_nav_present": False,
            "reason": "not enough frames for detection",
        }

    h, w = raw_images[0].shape[:2]
    max_search = int(round(h * args.bottom_nav_max_search_ratio))
    max_search = max(40, min(max_search, h))

    diffs = []
    for a, b in zip(raw_images[:-1], raw_images[1:]):
        if a.shape != b.shape:
            continue
        ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
        d = np.abs(ga[-max_search:] - gb[-max_search:]).mean(axis=1)
        diffs.append(d)

    if not diffs:
        return {
            "persistent_bottom_height_px": 0,
            "row_diff_threshold": float(args.bottom_nav_stable_threshold),
            "used_pairs": 0,
            "bottom_nav_present": False,
            "reason": "no comparable frame pairs",
        }

    # Median across adjacent scroll pairs is robust to one dynamic frame.
    row_diff = np.median(np.stack(diffs, axis=0), axis=0)

    # Smooth slightly so single noisy rows do not break the contiguous band.
    k = max(3, int(args.bottom_nav_smooth_rows))
    if k % 2 == 0:
        k += 1
    kernel = np.ones(k, dtype=np.float32) / float(k)
    row_diff_s = np.convolve(row_diff, kernel, mode="same")

    stable = row_diff_s <= float(args.bottom_nav_stable_threshold)

    # Count stable rows upward from the very bottom, allowing a few unstable rows
    # so anti-aliased gesture bars / emulator artifacts do not break detection.
    allowed_breaks = int(args.bottom_nav_allowed_unstable_rows)
    breaks = 0
    persistent = 0
    for i in range(max_search - 1, -1, -1):
        if stable[i]:
            persistent += 1
        else:
            breaks += 1
            if breaks > allowed_breaks:
                break
            persistent += 1

    # If the bottom-most rows are not stable at all, do not report a band.
    bottom_probe = stable[max(0, max_search - 12):].mean()
    if bottom_probe < 0.5:
        persistent = 0

    nav_present = persistent >= int(args.bottom_nav_min_height_px)

    return {
        "persistent_bottom_height_px": int(persistent),
        "row_diff_threshold": float(args.bottom_nav_stable_threshold),
        "used_pairs": int(len(diffs)),
        "bottom_nav_present": bool(nav_present),
        "bottom_probe_stable_ratio": float(bottom_probe),
        "reason": "persistent bottom band >= threshold" if nav_present else "persistent bottom band below threshold",
    }


def estimate_persistent_top_height(raw_images: list[np.ndarray], args) -> dict:
    """
    Estimate how many pixels at the top stay fixed while the page scrolls.

    This detects Android status bar + app header + sticky tabs. It is based on
    the same core production rule as the stitcher: scrollable content moves;
    chrome stays at the same screen coordinates.
    """
    if len(raw_images) < 2:
        return {
            "persistent_top_height_px": 0,
            "row_diff_threshold": float(args.top_chrome_stable_threshold),
            "used_pairs": 0,
            "reason": "not enough frames for detection",
        }

    h, _w = raw_images[0].shape[:2]
    max_search = int(round(h * args.top_chrome_max_search_ratio))
    max_search = max(40, min(max_search, h))

    diffs = []
    for a, b in zip(raw_images[:-1], raw_images[1:]):
        if a.shape != b.shape:
            continue
        ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)

        # Blend luminance row difference with edge row difference. Edge changes
        # stop the top crop at sticky tab dividers much better than raw pixels
        # alone on mostly-white pages.
        lum = np.abs(ga[:max_search] - gb[:max_search]).mean(axis=1)
        ea = cv2.Canny(ga.astype(np.uint8), 50, 150).astype(np.float32)
        eb = cv2.Canny(gb.astype(np.uint8), 50, 150).astype(np.float32)
        edge = np.abs(ea[:max_search] - eb[:max_search]).mean(axis=1)
        d = 0.75 * lum + 0.25 * edge
        diffs.append(d)

    if not diffs:
        return {
            "persistent_top_height_px": 0,
            "row_diff_threshold": float(args.top_chrome_stable_threshold),
            "used_pairs": 0,
            "reason": "no comparable frame pairs",
        }

    row_diff = np.median(np.stack(diffs, axis=0), axis=0)

    k = max(3, int(args.top_chrome_smooth_rows))
    if k % 2 == 0:
        k += 1
    kernel = np.ones(k, dtype=np.float32) / float(k)
    row_diff_s = np.convolve(row_diff, kernel, mode="same")

    stable = row_diff_s <= float(args.top_chrome_stable_threshold)

    allowed_breaks = int(args.top_chrome_allowed_unstable_rows)
    breaks = 0
    persistent = 0
    for i in range(0, max_search):
        if stable[i]:
            persistent += 1
        else:
            breaks += 1
            if breaks > allowed_breaks:
                break
            persistent += 1

    top_probe = stable[: min(12, len(stable))].mean() if len(stable) else 0.0
    if top_probe < 0.5:
        persistent = 0

    # Do not let a mostly-blank first post accidentally become "chrome".
    # Once detected height exceeds the plausible maximum, clamp it.
    persistent = min(persistent, int(round(h * args.top_chrome_max_output_ratio)))

    return {
        "persistent_top_height_px": int(persistent),
        "row_diff_threshold": float(args.top_chrome_stable_threshold),
        "used_pairs": int(len(diffs)),
        "top_probe_stable_ratio": float(top_probe),
        "reason": "persistent top band detected" if persistent >= int(args.top_chrome_min_height_px) else "persistent top band below threshold",
    }


def detect_blue_fab_raw(raw_images: list[np.ndarray], top_crop: int, bottom_crop: int, args) -> dict:
    """
    Detect a common blue floating action button in raw screenshot coordinates.

    This intentionally focuses on the lower-right content area. If your app uses
    a different-colored or differently-located overlay, use --fab-mode force and
    the existing ratio controls as an override.
    """
    base = raw_images[-1] if raw_images else None
    if base is None or base.size == 0:
        return {"detected": False, "reason": "no raw images"}

    h, w = base.shape[:2]
    y_min = max(top_crop, int(round(h * args.fab_auto_search_y0_ratio)))
    y_max = min(h - bottom_crop, int(round(h * args.fab_auto_search_y1_ratio)))
    x_min = max(0, int(round(w * args.fab_auto_search_x0_ratio)))
    x_max = min(w, int(round(w * args.fab_auto_search_x1_ratio)))

    if y_max <= y_min or x_max <= x_min:
        return {"detected": False, "reason": "invalid FAB search region"}

    crop = base[y_min:y_max, x_min:x_max]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    lo = int(args.fab_restore_blue_hue_low)
    hi = int(args.fab_restore_blue_hue_high)
    if lo <= hi:
        hue_ok = (hue >= lo) & (hue <= hi)
    else:
        hue_ok = (hue >= lo) | (hue <= hi)

    blue = hue_ok & (sat >= int(args.fab_restore_min_saturation)) & (val >= int(args.fab_restore_min_value))

    k = max(3, int(args.fab_auto_close_px))
    if k % 2 == 0:
        k += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blue_closed = cv2.morphologyEx(blue.astype(np.uint8), cv2.MORPH_CLOSE, kernel)

    n, labels, stats, centroids = cv2.connectedComponentsWithStats(blue_closed, 8)
    if n <= 1:
        return {
            "detected": False,
            "reason": "no blue connected component in FAB search region",
            "search_rect_raw": [int(x_min), int(y_min), int(x_max), int(y_max)],
        }

    components = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        x = int(stats[i, cv2.CC_STAT_LEFT]) + x_min
        y = int(stats[i, cv2.CC_STAT_TOP]) + y_min
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        cx = float(centroids[i][0] + x_min)
        cy = float(centroids[i][1] + y_min)
        aspect = bw / max(1, bh)
        components.append({
            "area": area,
            "x0": x,
            "y0": y,
            "x1": x + bw,
            "y1": y + bh,
            "w": bw,
            "h": bh,
            "cx": cx,
            "cy": cy,
            "aspect": aspect,
        })

    # Prefer a sufficiently large compact/circular blue component near the lower
    # right. This stricter shape validation is important: large blue/purple
    # content cards, carousels, and promos must never be mistaken for a FAB.
    candidates = []
    max_component_w = min(
        int(args.fab_auto_max_size_px),
        int(round(w * float(args.fab_auto_max_width_ratio))),
    )
    max_component_h = min(
        int(args.fab_auto_max_size_px),
        int(round(h * float(args.fab_auto_max_height_ratio))),
    )
    max_area = int(round(w * h * float(args.fab_auto_max_area_ratio)))

    for c in components:
        bbox_area = max(1, int(c["w"] * c["h"]))
        fill_ratio = float(c["area"] / bbox_area)
        c["fill_ratio"] = fill_ratio
        c["center_x_ratio"] = float(c["cx"] / max(1, w))
        c["center_y_ratio"] = float(c["cy"] / max(1, h))

        if c["area"] < int(args.fab_auto_min_area_px):
            continue
        if c["area"] > max_area:
            continue
        if c["w"] < int(args.fab_auto_min_size_px) or c["h"] < int(args.fab_auto_min_size_px):
            continue
        if c["w"] > max_component_w or c["h"] > max_component_h:
            continue
        if not (float(args.fab_auto_min_aspect) <= c["aspect"] <= float(args.fab_auto_max_aspect)):
            continue
        if not (float(args.fab_auto_min_fill_ratio) <= fill_ratio <= float(args.fab_auto_max_fill_ratio)):
            continue
        if c["center_x_ratio"] < float(args.fab_auto_min_center_x_ratio):
            continue
        if c["center_y_ratio"] < float(args.fab_auto_min_center_y_ratio):
            continue

        lower_right_bonus = c["center_x_ratio"] + c["center_y_ratio"]
        compact_bonus = 1.0 - min(1.0, abs(c["aspect"] - 1.0))
        c["score"] = float(c["area"] * (1.0 + 0.25 * lower_right_bonus + 0.20 * compact_bonus))
        candidates.append(c)

    if not candidates:
        return {
            "detected": False,
            "reason": "blue components found but none looked like a FAB",
            "components": components[:8],
            "search_rect_raw": [int(x_min), int(y_min), int(x_max), int(y_max)],
        }

    best = max(candidates, key=lambda c: c["score"])

    # Expand beyond the blue disk to include plus glyph, shadow, and antialiasing.
    pad = int(round(max(best["w"], best["h"]) * args.fab_auto_rect_pad_ratio))
    x0 = max(0, int(best["x0"] - pad))
    y0 = max(0, int(best["y0"] - pad))
    x1 = min(w, int(best["x1"] + pad))
    y1 = min(h, int(best["y1"] + pad))

    radius = max(best["w"], best["h"]) / 2.0

    return {
        "detected": True,
        "reason": "blue floating action button detected",
        "search_rect_raw": [int(x_min), int(y_min), int(x_max), int(y_max)],
        "raw_rect": [int(x0), int(y0), int(x1), int(y1)],
        "blue_component_rect_raw": [int(best["x0"]), int(best["y0"]), int(best["x1"]), int(best["y1"])],
        "center_raw": [float(best["cx"]), float(best["cy"])],
        "estimated_radius_px": float(radius),
        "area_px": int(best["area"]),
        "score": float(best["score"]),
    }


def apply_fab_profile(fab: dict, raw_shape: tuple[int, int, int], top_crop: int, bottom_crop: int, args) -> dict:
    """
    Convert raw-coordinate FAB detection into the ratios used by masks/restorer.
    """
    h, w = raw_shape[:2]
    content_h = max(1, h - top_crop - bottom_crop)
    mode = str(args.fab_mode)

    if mode == "none":
        args.fab_mask = False
        args.mask_fab_in_output = False
        args.restore_fab_overlay = "never"
        return {**fab, "mode": mode, "applied": False, "reason": "disabled by --fab-mode none"}

    if mode == "force":
        return {**fab, "mode": mode, "applied": True, "reason": "using manually supplied FAB ratios"}

    # auto mode
    if not fab.get("detected", False):
        args.fab_mask = False
        args.mask_fab_in_output = False
        if args.restore_fab_overlay == "auto":
            # leave as auto, but it will not be attempted/detected; this explicit
            # flag avoids output holes from a non-existent FAB.
            pass
        return {**fab, "mode": mode, "applied": False, "reason": fab.get("reason", "no FAB detected")}

    x0, y0, x1, y1 = [int(v) for v in fab["raw_rect"]]
    cx, cy = fab["center_raw"]
    r = float(fab["estimated_radius_px"])

    # Matching mask: rectangular and intentionally larger.
    match_pad = int(round(r * args.fab_auto_match_pad_ratio))
    args.fab_x0_ratio = max(0.0, min(1.0, (x0 - match_pad) / max(1, w)))
    args.fab_y0_ratio = max(0.0, min(1.0, (y0 - top_crop - match_pad) / content_h))
    args.fab_y1_ratio = max(0.0, min(1.0, (y1 - top_crop + match_pad) / content_h))
    args.fab_mask = True

    # Output mask / restore: center + radius in content coordinates.
    args.fab_output_cx_ratio = max(0.0, min(1.0, float(cx) / max(1, w)))
    args.fab_output_cy_ratio = max(0.0, min(1.0, (float(cy) - top_crop) / content_h))
    args.fab_output_radius_ratio = max(0.001, min(0.25, float(r) * args.fab_auto_output_radius_scale / max(1, min(w, content_h))))
    args.fab_output_min_radius_px = max(int(args.fab_output_min_radius_px), int(round(r * args.fab_auto_output_radius_scale)))
    args.mask_fab_in_output = True

    return {
        **fab,
        "mode": mode,
        "applied": True,
        "effective_fab_x0_ratio": float(args.fab_x0_ratio),
        "effective_fab_y0_ratio": float(args.fab_y0_ratio),
        "effective_fab_y1_ratio": float(args.fab_y1_ratio),
        "effective_fab_output_cx_ratio": float(args.fab_output_cx_ratio),
        "effective_fab_output_cy_ratio": float(args.fab_output_cy_ratio),
        "effective_fab_output_radius_ratio": float(args.fab_output_radius_ratio),
    }


def configure_auto_chrome(raw_images: list[np.ndarray], args) -> dict:
    """
    Build the page profile before frames are prepared.

    This upgrades the previous bottom-nav-only detector into a layout profiler:
      - persistent top chrome / sticky tabs
      - bottom nav present/absent and output suffix
      - common blue floating action button detection/restoration

    Explicit CLI overrides still win. Auto-profile only fills in the blanks.
    """
    if not raw_images:
        raise RuntimeError("No raw images available for chrome detection.")

    h = raw_images[0].shape[0]
    default_top = args.top_crop if args.top_crop is not None else int(round(h * args.top_crop_ratio))
    default_bottom = args.bottom_crop if args.bottom_crop is not None else int(round(h * args.bottom_crop_ratio))

    # --- Top chrome / sticky header ---
    top_detection = estimate_persistent_top_height(raw_images, args)
    if args.top_crop is not None:
        effective_top = int(args.top_crop)
        top_reason = "forced by --top-crop"
    elif args.top_chrome_mode == "fixed" or not args.auto_profile:
        effective_top = int(default_top)
        top_reason = "fixed crop ratio"
    else:
        detected_top = int(top_detection.get("persistent_top_height_px", 0))
        if detected_top >= int(args.top_chrome_min_height_px):
            effective_top = detected_top + int(args.top_chrome_extra_pad_px)
            top_reason = "auto detected persistent top chrome"
        else:
            effective_top = max(int(args.top_chrome_fallback_px), int(default_top))
            top_reason = "fallback top crop"

    effective_top = int(max(0, min(effective_top, h - 10)))

    # --- Bottom nav / suffix ---
    bottom_detection = estimate_persistent_bottom_height(raw_images, args)
    mode = args.bottom_nav_mode
    if mode == "withnav":
        nav_present = True
        bottom_detection["reason"] = "forced withnav by --bottom-nav-mode"
    elif mode == "nonav":
        nav_present = False
        bottom_detection["reason"] = "forced nonav by --bottom-nav-mode"
    else:
        nav_present = bool(bottom_detection["bottom_nav_present"])

    if nav_present:
        if args.bottom_crop is not None:
            effective_bottom = int(args.bottom_crop)
        else:
            effective_bottom = max(
                int(bottom_detection.get("persistent_bottom_height_px", 0)),
                int(round(h * args.bottom_crop_ratio)),
            )
            effective_bottom = min(effective_bottom, int(round(h * args.bottom_nav_max_search_ratio)))
    else:
        if args.bottom_crop is not None:
            effective_bottom = int(args.bottom_crop)
        else:
            effective_bottom = int(args.nonav_bottom_crop_px)

    effective_bottom = int(max(0, min(effective_bottom, h - effective_top - 10)))

    args._bottom_nav_present = bool(nav_present)
    args._output_suffix = "withnav" if nav_present else "nonav"
    args._effective_top_crop = int(effective_top)
    args._effective_bottom_crop = int(effective_bottom)

    # --- Floating action button / fixed overlay ---
    fab_detection = detect_blue_fab_raw(raw_images, effective_top, effective_bottom, args) if args.auto_profile else {"detected": False, "reason": "auto profile disabled"}
    fab_profile = apply_fab_profile(fab_detection, raw_images[-1].shape, effective_top, effective_bottom, args)

    page_profile = {
        "auto_profile_enabled": bool(args.auto_profile),
        "top_chrome": {
            **top_detection,
            "top_chrome_mode": str(args.top_chrome_mode),
            "effective_top_crop_px": int(effective_top),
            "default_top_crop_px": int(default_top),
            "reason_effective": top_reason,
        },
        "bottom_chrome": {
            **bottom_detection,
            "bottom_nav_mode": mode,
            "output_suffix": args._output_suffix,
            "effective_bottom_crop_px": int(effective_bottom),
            "default_bottom_crop_px": int(default_bottom),
            "nav_present": bool(nav_present),
        },
        "floating_overlay": fab_profile,
        "summary": {
            "top_crop_px": int(effective_top),
            "bottom_crop_px": int(effective_bottom),
            "bottom_nav_present": bool(nav_present),
            "output_suffix": args._output_suffix,
            "fab_present": bool(fab_profile.get("applied", False)),
        },
    }

    # Alignment-based profile search: if the first guessed profile is too deep
    # or has a false FAB, search safer crop/FAB variants before frames are built.
    if bool(getattr(args, "profile_search", True)) and args.auto_profile:
        page_profile = refine_page_profile_by_alignment(raw_images, args, page_profile)

    # Backward-compatible name used by older report readers.
    args._chrome_detection = {
        **page_profile["bottom_chrome"],
        "effective_top_crop_px": int(args._effective_top_crop),
        "floating_overlay": page_profile.get("floating_overlay", {}),
    }
    args._page_profile = page_profile

    return args._chrome_detection

def make_frame(idx: int, img1: np.ndarray, img2: Optional[np.ndarray], args) -> Frame:
    top, bottom = resolve_crops(img1, args)
    h, _w = img1.shape[:2]

    content = img1[top : h - bottom].copy()

    if img2 is not None:
        dyn_full = detect_dynamic_mask(img1, img2, args)
        dyn = dyn_full[top : h - bottom]
    else:
        dyn = np.zeros(content.shape[:2], dtype=bool)

    match_invalid, comp_invalid = static_invalid_masks(content.shape[0], content.shape[1], args)

    comp_valid = ~comp_invalid
    match_valid = ~(match_invalid | dyn)

    if args.valid_erode_px > 0:
        k = int(args.valid_erode_px)
        if k % 2 == 0:
            k += 1
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
        match_valid = cv2.erode(match_valid.astype(np.uint8), kernel, iterations=1).astype(bool)

    return Frame(
        idx=idx,
        content=content,
        match_valid=match_valid,
        comp_valid=comp_valid,
        raw_shape=img1.shape,
        top_crop=top,
        bottom_crop=bottom,
        raw_image=img1.copy(),
    )


def capture_frames(args, out_dir: Path) -> list[Frame]:
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    raw_pairs: list[tuple[np.ndarray, np.ndarray]] = []
    raw_primary: list[np.ndarray] = []

    args._auto_bottom_report = {
        "enabled": bool(args.auto_stop_at_bottom),
        "attempted": not bool(args.input_dir),
        "stopped_early": False,
        "requested_scrolls": int(args.scrolls),
        "captured_frames": 0,
        "captured_scroll_steps": 0,
        "checks": [],
        "reason": "not run yet",
    }

    if args.pre_capture_wait > 0:
        time.sleep(args.pre_capture_wait)

    for i in range(args.scrolls + 1):
        img1 = adb_screenshot(args.device)
        time.sleep(args.pair_delay)
        img2 = adb_screenshot(args.device)

        cv2.imwrite(str(raw_dir / f"raw_{i:03d}_a.png"), img1)
        cv2.imwrite(str(raw_dir / f"raw_{i:03d}_b.png"), img2)

        raw_pairs.append((img1, img2))
        raw_primary.append(img1)

        # If this frame was captured after a scroll attempt and the viewport did
        # not move, we reached the bottom (or a non-scrollable page). Drop the
        # duplicate terminal frame so the stitcher only receives real movement.
        if args.auto_stop_at_bottom and i > 0:
            sim = screenshot_no_scroll_similarity(
                raw_pairs[-2][0],
                raw_pairs[-1][0],
                args,
                previous_peer=raw_pairs[-2][1],
                current_peer=raw_pairs[-1][1],
            )
            check = {"after_scroll_attempt": int(i), **sim}
            args._auto_bottom_report["checks"].append(check)

            can_stop = (i - 1) >= int(args.auto_bottom_min_completed_scrolls)
            if bool(sim.get("at_bottom")) and can_stop:
                raw_pairs.pop()
                raw_primary.pop()
                args._auto_bottom_report.update({
                    "stopped_early": True,
                    "stop_after_scroll_attempt": int(i),
                    "reason": "scroll produced no new viewport; duplicate terminal frame removed",
                    "last_similarity": sim,
                })
                print(
                    "Auto-bottom: stopped after "
                    f"{i} scroll attempt(s); viewport did not move "
                    f"(ncc={sim.get('ncc'):.4f}, mae={sim.get('mae'):.2f}, edge_mae={sim.get('edge_mae'):.2f})"
                )
                break

        if i < args.scrolls:
            h, w = img1.shape[:2]
            adb_swipe(args.device, w, h, args)
            time.sleep(args.settle_after_scroll)

    args._captured_scroll_steps = max(0, len(raw_primary) - 1)
    args._auto_bottom_report["captured_frames"] = int(len(raw_primary))
    args._auto_bottom_report["captured_scroll_steps"] = int(args._captured_scroll_steps)
    if not args._auto_bottom_report.get("stopped_early"):
        args._auto_bottom_report["reason"] = "requested scroll count completed"

    # Reset the emulator/app back to the first captured viewport before the
    # offline stitch work begins. This keeps repeated test runs convenient and
    # avoids leaving the app stranded several scrolls down.
    if args.return_to_top and not args.input_dir:
        try:
            args._return_to_top_report = return_device_to_top(raw_primary[0] if raw_primary else None, args, out_dir)
        except Exception as exc:
            args._return_to_top_report = {
                "enabled": bool(args.return_to_top),
                "attempted": True,
                "failed": True,
                "reason": str(exc),
            }
            print(f"Return-to-top warning: {exc}")
    else:
        args._return_to_top_report = {
            "enabled": bool(args.return_to_top),
            "attempted": False,
            "reason": "input-dir mode or disabled",
        }

    chrome = configure_auto_chrome(raw_primary, args)
    profile = getattr(args, "_page_profile", {})
    summary = profile.get("summary", {})
    print(
        f"Profile: top_crop={summary.get('top_crop_px')}px "
        f"bottom_crop={summary.get('bottom_crop_px')}px "
        f"bottom_nav={summary.get('bottom_nav_present')} "
        f"suffix=_{summary.get('output_suffix')} "
        f"fab={summary.get('fab_present')}"
    )

    frames: list[Frame] = []
    for i, (img1, img2) in enumerate(raw_pairs):
        frames.append(make_frame(i, img1, img2, args))

    return frames

def load_frames_from_dir(args) -> list[Frame]:
    input_dir = Path(args.input_dir)
    paths = sorted(
        [
            p
            for p in input_dir.iterdir()
            if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ]
    )

    if len(paths) < 2:
        raise RuntimeError("Need at least two screenshots in --input-dir.")

    raw_images = [read_image(p) for p in paths]
    chrome = configure_auto_chrome(raw_images, args)
    profile = getattr(args, "_page_profile", {})
    summary = profile.get("summary", {})
    print(
        f"Profile: top_crop={summary.get('top_crop_px')}px "
        f"bottom_crop={summary.get('bottom_crop_px')}px "
        f"bottom_nav={summary.get('bottom_nav_present')} "
        f"suffix=_{summary.get('output_suffix')} "
        f"fab={summary.get('fab_present')}"
    )

    frames = []
    for idx, img in enumerate(raw_images):
        frames.append(make_frame(idx, img, None, args))

    return frames


# -----------------------------
# Features / scoring
# -----------------------------

def make_features(img: np.ndarray, valid: np.ndarray, scale: float) -> dict:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    if scale != 1.0:
        gray_s = cv2.resize(
            gray,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )
        valid_s = cv2.resize(
            valid.astype(np.uint8),
            (gray_s.shape[1], gray_s.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        ).astype(bool)
    else:
        gray_s = gray
        valid_s = valid

    gray_u8 = np.clip(gray_s * 255.0, 0, 255).astype(np.uint8)
    edge = cv2.Canny(gray_u8, 50, 150).astype(np.float32) / 255.0

    valid_count = valid_s.sum(axis=1).astype(np.float32)
    row_gray = np.zeros(gray_s.shape[0], dtype=np.float32)

    good = valid_count > 0
    if np.any(good):
        row_gray[good] = (gray_s * valid_s).sum(axis=1)[good] / valid_count[good]

    return {
        "gray": gray_s,
        "edge": edge,
        "valid": valid_s,
        "row_gray": row_gray,
    }


def masked_ncc(a: np.ndarray, b: np.ndarray, mask: np.ndarray, min_pixels: int = 1000) -> float:
    n = int(mask.sum())
    if n < min_pixels:
        return -1.0

    av = a[mask].astype(np.float32)
    bv = b[mask].astype(np.float32)

    av -= float(av.mean())
    bv -= float(bv.mean())

    denom = math.sqrt(float((av * av).sum()) * float((bv * bv).sum()))

    if denom < 1e-8:
        mae = float(np.mean(np.abs(a[mask] - b[mask])))
        return max(-1.0, 1.0 - mae * 4.0)

    return float((av * bv).sum() / denom)


def ncc_1d(x: np.ndarray, y: np.ndarray, valid: np.ndarray) -> float:
    if int(valid.sum()) < 20:
        return -1.0

    xv = x[valid].astype(np.float32)
    yv = y[valid].astype(np.float32)

    xv -= float(xv.mean())
    yv -= float(yv.mean())

    denom = math.sqrt(float((xv * xv).sum()) * float((yv * yv).sum()))

    if denom < 1e-8:
        mae = float(np.mean(np.abs(x[valid] - y[valid])))
        return max(-1.0, 1.0 - mae * 4.0)

    return float((xv * yv).sum() / denom)


def score_delta(fa: dict, fb: dict, delta: int, args) -> Candidate:
    h, w = fa["gray"].shape

    if delta <= 0 or delta >= h:
        return Candidate(delta, 0, -1.0, -1.0, -1.0, -1.0, 0.0)

    overlap = h - delta
    if overlap <= 0:
        return Candidate(delta, overlap, -1.0, -1.0, -1.0, -1.0, 0.0)

    va = fa["valid"][delta:h]
    vb = fb["valid"][:overlap]
    valid = va & vb

    valid_ratio = float(valid.mean())
    if valid_ratio < args.min_valid_ratio:
        return Candidate(delta, overlap, -1.0, -1.0, -1.0, -1.0, valid_ratio)

    gray_score = masked_ncc(
        fa["gray"][delta:h],
        fb["gray"][:overlap],
        valid,
        min_pixels=args.min_ncc_pixels,
    )

    edge_score = masked_ncc(
        fa["edge"][delta:h],
        fb["edge"][:overlap],
        valid,
        min_pixels=args.min_ncc_pixels,
    )

    row_valid = valid.sum(axis=1) > (w * args.row_min_valid_ratio)

    # Sticky headers/tabs often change labels or horizontal position while the
    # underlying vertical content is perfectly aligned. Those changes are
    # concentrated near the TOP/BOTTOM edges of the overlap and can destroy the
    # 1-D row profile score. Score the stable central overlap for row geometry,
    # while gray/edge NCC still inspect the full valid overlap.
    trim_ratio = max(
        0.0,
        min(0.30, float(getattr(args, "row_score_edge_trim_ratio", 0.0))),
    )
    trim_rows = int(round(overlap * trim_ratio))

    row_a = fa["row_gray"][delta:h]
    row_b = fb["row_gray"][:overlap]
    row_v = row_valid

    if trim_rows > 0 and overlap - (2 * trim_rows) >= 40:
        row_a = row_a[trim_rows:overlap - trim_rows]
        row_b = row_b[trim_rows:overlap - trim_rows]
        row_v = row_v[trim_rows:overlap - trim_rows]

    row_score = ncc_1d(
        row_a,
        row_b,
        row_v,
    )

    score = (
        args.gray_weight * gray_score
        + args.edge_weight * edge_score
        + args.row_weight * row_score
    )

    return Candidate(
        delta=delta,
        overlap=overlap,
        score=score,
        gray_score=gray_score,
        edge_score=edge_score,
        row_score=row_score,
        valid_ratio=valid_ratio,
    )


def delta_range(content_h: int, args) -> tuple[int, int]:
    min_d = int(round(content_h * args.min_scroll_ratio))
    max_d = int(round(content_h * args.max_scroll_ratio))

    if args.min_scroll_px is not None:
        min_d = max(min_d, args.min_scroll_px)

    if args.max_scroll_px is not None:
        max_d = min(max_d, args.max_scroll_px)

    if args.expected_scroll_px is not None:
        lo = int(round(args.expected_scroll_px * args.expected_low))
        hi = int(round(args.expected_scroll_px * args.expected_high))
        min_d = max(min_d, lo)
        max_d = min(max_d, hi)

    max_d = min(max_d, content_h - args.min_overlap_px)
    min_d = max(1, min_d)

    if max_d <= min_d:
        raise RuntimeError(
            f"Invalid delta range: min={min_d}, max={max_d}. "
            f"Reduce --min-overlap-px or adjust scroll ratios."
        )

    return min_d, max_d



# -----------------------------
# Alignment-based page-profile refinement
# -----------------------------

def _parse_int_csv(value: str) -> list[int]:
    out: list[int] = []
    if not value:
        return out
    for part in str(value).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            pass
    return out


def _dedupe_sorted_ints(values: list[int], lo: int, hi: int) -> list[int]:
    return sorted({int(v) for v in values if lo <= int(v) <= hi})


def _profile_candidate_top_crops(raw_images: list[np.ndarray], args, initial_top: int, bottom: int) -> list[int]:
    h = raw_images[0].shape[0]
    if args.top_crop is not None:
        return [int(args.top_crop)]

    default_top = int(round(h * float(args.top_crop_ratio)))
    ratio_candidates = [
        0.12, 0.14, 0.16, 0.18, 0.195, 0.205, 0.22, 0.24, 0.26, 0.28, 0.30,
    ]
    values = [int(initial_top), default_top, int(args.top_chrome_fallback_px)]
    values += [int(round(h * r)) for r in ratio_candidates]
    values += _parse_int_csv(str(getattr(args, "profile_search_extra_top_crops", "")))

    # Keep enough vertical content for meaningful overlap + some actual movement.
    min_content_h = int(args.min_overlap_px) + max(80, int(round(h * 0.06)))
    hi = max(0, h - int(bottom) - min_content_h)
    hi = min(hi, int(round(h * float(args.top_chrome_max_output_ratio))))
    lo = 0
    return _dedupe_sorted_ints(values, lo, hi)


def _clone_args_for_profile_candidate(raw_images: list[np.ndarray], args, top: int, bottom: int, nav_present: bool, fab_strategy: str):
    tmp = argparse.Namespace(**vars(args))

    # Explicit user crop flags should still win via resolve_crops, but the profile
    # search only supplies candidates when those flags are absent.
    tmp._effective_top_crop = int(top)
    tmp._effective_bottom_crop = int(bottom)
    tmp._bottom_nav_present = bool(nav_present)
    tmp._output_suffix = "withnav" if nav_present else "nonav"

    if fab_strategy == "none":
        tmp.fab_mode = "none"
        fab_detection = {"detected": False, "reason": "candidate disables FAB"}
    elif fab_strategy == "force":
        tmp.fab_mode = "force"
        fab_detection = {"detected": True, "reason": "candidate uses forced FAB ratios"}
    else:
        tmp.fab_mode = "auto"
        fab_detection = detect_blue_fab_raw(raw_images, int(top), int(bottom), tmp)

    fab_profile = apply_fab_profile(fab_detection, raw_images[-1].shape, int(top), int(bottom), tmp)
    tmp._candidate_fab_profile = fab_profile
    return tmp


def _quick_best_coarse_alignment(prev: Frame, cur: Frame, args) -> dict:
    if prev.content.shape[:2] != cur.content.shape[:2]:
        return {"valid": False, "reason": "content sizes differ"}

    h = prev.content.shape[0]
    try:
        min_d, max_d = delta_range(h, args)
    except Exception as exc:
        return {"valid": False, "reason": f"invalid delta range: {exc}"}

    scale = float(args.coarse_scale)
    fa = make_features(prev.content, prev.match_valid, scale)
    fb = make_features(cur.content, cur.match_valid, scale)

    min_dc = max(1, int(round(min_d * scale)))
    max_dc = max(min_dc + 1, int(round(max_d * scale)))
    max_dc = min(max_dc, fa["gray"].shape[0] - 1)
    if max_dc <= min_dc:
        return {"valid": False, "reason": "invalid coarse delta range"}

    candidates = [score_delta(fa, fb, dc, args) for dc in range(min_dc, max_dc + 1)]
    candidates = [c for c in candidates if c.score > -0.5]
    if not candidates:
        return {"valid": False, "reason": "no valid coarse alignment candidates"}

    best = max(candidates, key=lambda c: c.score)
    return {
        "valid": True,
        "score": float(best.score),
        "delta_full_estimate": int(round(best.delta / scale)),
        "valid_ratio": float(best.valid_ratio),
        "overlap_full_estimate": int(round(best.overlap / scale)),
        "gray_score": float(best.gray_score),
        "edge_score": float(best.edge_score),
        "row_score": float(best.row_score),
    }


def _score_profile_candidate(raw_images: list[np.ndarray], args, top: int, bottom: int, nav_present: bool, fab_strategy: str) -> dict:
    tmp = _clone_args_for_profile_candidate(raw_images, args, top, bottom, nav_present, fab_strategy)
    max_pairs = max(1, min(int(args.profile_search_pairs), len(raw_images) - 1))

    pair_scores = []
    pair_details = []
    for i in range(max_pairs):
        prev = make_frame(i, raw_images[i], None, tmp)
        cur = make_frame(i + 1, raw_images[i + 1], None, tmp)
        m = _quick_best_coarse_alignment(prev, cur, tmp)
        pair_details.append(m)
        if not m.get("valid", False):
            return {
                "valid": False,
                "reason": m.get("reason", "invalid pair"),
                "top_crop_px": int(top),
                "bottom_crop_px": int(bottom),
                "nav_present": bool(nav_present),
                "fab_strategy": str(fab_strategy),
                "fab_applied": bool(getattr(tmp, "_candidate_fab_profile", {}).get("applied", False)),
                "fab_profile": getattr(tmp, "_candidate_fab_profile", {}),
                "pair_details": pair_details,
            }
        pair_scores.append(float(m["score"]))

    avg_score = float(np.mean(pair_scores)) if pair_scores else -1.0
    min_score = float(np.min(pair_scores)) if pair_scores else -1.0

    # Use an adjusted score only for tie-breaking. The raw avg/min score remains
    # the main truth. This prevents unnecessarily deep top crops and false FABs
    # from winning when two profiles align similarly well.
    h = raw_images[0].shape[0]
    fab_applied = bool(getattr(tmp, "_candidate_fab_profile", {}).get("applied", False))
    top_penalty = float(args.profile_search_prefer_lower_top_weight) * (float(top) / max(1.0, float(h)))
    fab_penalty = 0.010 if fab_applied and str(args.fab_mode) == "auto" else 0.0
    adjusted_score = avg_score - top_penalty - fab_penalty

    return {
        "valid": True,
        "avg_score": avg_score,
        "min_score": min_score,
        "adjusted_score": float(adjusted_score),
        "top_crop_px": int(top),
        "bottom_crop_px": int(bottom),
        "nav_present": bool(nav_present),
        "fab_strategy": str(fab_strategy),
        "fab_applied": fab_applied,
        "fab_profile": getattr(tmp, "_candidate_fab_profile", {}),
        "pair_details": pair_details,
    }


def _apply_profile_candidate_to_args(raw_images: list[np.ndarray], args, candidate: dict) -> dict:
    top = int(candidate["top_crop_px"])
    bottom = int(candidate["bottom_crop_px"])
    nav_present = bool(candidate["nav_present"])
    fab_strategy = str(candidate.get("fab_strategy", "auto"))

    tmp = _clone_args_for_profile_candidate(raw_images, args, top, bottom, nav_present, fab_strategy)

    copy_names = [
        "_effective_top_crop", "_effective_bottom_crop", "_bottom_nav_present", "_output_suffix",
        "fab_mask", "mask_fab_in_output", "restore_fab_overlay",
        "fab_x0_ratio", "fab_y0_ratio", "fab_y1_ratio",
        "fab_output_cx_ratio", "fab_output_cy_ratio", "fab_output_radius_ratio", "fab_output_min_radius_px",
    ]
    for name in copy_names:
        if hasattr(tmp, name):
            setattr(args, name, getattr(tmp, name))

    return getattr(tmp, "_candidate_fab_profile", {})


def refine_page_profile_by_alignment(raw_images: list[np.ndarray], args, page_profile: dict) -> dict:
    """
    Production hardening for auto-profile mistakes.

    The first detector can occasionally over-crop the top or mistake a large blue
    content card for a FAB. This search tests several plausible top-crop/FAB
    profiles against actual alignment quality, then applies the safest profile
    before stitching begins.
    """
    if len(raw_images) < 2:
        page_profile["alignment_profile_search"] = {"enabled": False, "reason": "not enough images"}
        return page_profile

    if args.top_crop is not None and args.fab_mode != "auto":
        page_profile["alignment_profile_search"] = {"enabled": False, "reason": "explicit top crop and FAB mode supplied"}
        return page_profile

    h = raw_images[0].shape[0]
    initial_top = int(getattr(args, "_effective_top_crop", int(round(h * args.top_crop_ratio))))
    initial_bottom = int(getattr(args, "_effective_bottom_crop", int(round(h * args.bottom_crop_ratio))))
    nav_present = bool(getattr(args, "_bottom_nav_present", False))

    top_candidates = _profile_candidate_top_crops(raw_images, args, initial_top, initial_bottom)
    if not top_candidates:
        top_candidates = [initial_top]

    if args.fab_mode == "none":
        fab_strategies = ["none"]
    elif args.fab_mode == "force":
        fab_strategies = ["force"]
    else:
        fab_strategies = ["auto", "none"]

    candidates = []
    for top in top_candidates:
        for fab_strategy in fab_strategies:
            candidates.append(_score_profile_candidate(raw_images, args, int(top), initial_bottom, nav_present, fab_strategy))

    valid = [c for c in candidates if c.get("valid", False) and float(c.get("avg_score", -1.0)) >= float(args.profile_search_min_score)]

    search_report = {
        "enabled": True,
        "initial_top_crop_px": int(initial_top),
        "initial_bottom_crop_px": int(initial_bottom),
        "candidate_count": int(len(candidates)),
        "valid_candidate_count": int(len(valid)),
        "min_required_avg_score": float(args.profile_search_min_score),
        "candidates": candidates[:80],
    }

    if not valid:
        search_report["selected"] = None
        search_report["reason"] = "no valid profile-search candidate beat the minimum score; keeping initial profile"
        page_profile["alignment_profile_search"] = search_report
        return page_profile

    # Pick by adjusted score. If several are within the close-score margin, prefer
    # the one with lower top crop and no FAB, because those are less destructive.
    best_raw = max(valid, key=lambda c: float(c["avg_score"]))
    close = [c for c in valid if float(best_raw["avg_score"]) - float(c["avg_score"]) <= float(args.profile_search_close_score_margin)]
    selected = max(close, key=lambda c: (float(c["adjusted_score"]), -int(c["top_crop_px"]), 0 if c.get("fab_applied", False) else 1))

    fab_profile = _apply_profile_candidate_to_args(raw_images, args, selected)

    changed = (
        int(selected["top_crop_px"]) != int(initial_top)
        or bool(selected.get("fab_applied", False)) != bool(page_profile.get("summary", {}).get("fab_present", False))
        or str(selected.get("fab_strategy")) == "none"
    )

    search_report["selected"] = selected
    search_report["best_raw_avg_score"] = float(best_raw["avg_score"])
    search_report["changed_profile"] = bool(changed)
    search_report["reason"] = "selected safest alignment-tested profile"

    page_profile["alignment_profile_search"] = search_report
    page_profile["top_chrome"]["effective_top_crop_px"] = int(args._effective_top_crop)
    page_profile["top_chrome"]["reason_effective"] = "alignment-refined profile search" if changed else page_profile["top_chrome"].get("reason_effective", "auto")
    page_profile["bottom_chrome"]["effective_bottom_crop_px"] = int(args._effective_bottom_crop)
    page_profile["bottom_chrome"]["nav_present"] = bool(args._bottom_nav_present)
    page_profile["bottom_chrome"]["output_suffix"] = str(args._output_suffix)
    page_profile["floating_overlay"] = fab_profile
    page_profile["summary"] = {
        "top_crop_px": int(args._effective_top_crop),
        "bottom_crop_px": int(args._effective_bottom_crop),
        "bottom_nav_present": bool(args._bottom_nav_present),
        "output_suffix": str(args._output_suffix),
        "fab_present": bool(fab_profile.get("applied", False)),
    }
    return page_profile

def find_second_best(candidates: list[Candidate], best: Candidate, sep_px: int) -> Optional[Candidate]:
    far = [c for c in candidates if abs(c.delta - best.delta) >= sep_px and c.score > -0.5]
    if not far:
        return None
    return max(far, key=lambda c: c.score)


# -----------------------------
# Seam selection and seam-local rescue
# -----------------------------

def choose_seam(prev: Frame, cur: Frame, delta: int, args) -> tuple[Optional[int], float, float, list[str]]:
    """
    Choose the lowest-error horizontal cut line inside the overlap.

    The seam is local. It can be excellent even when the entire overlap is not,
    which is why we separately compute global alignment and seam-local rescue.
    """
    reasons: list[str] = []

    h, w = prev.content.shape[:2]
    overlap = h - delta

    if overlap <= args.seam_margin_px * 2:
        return None, 999.0, 0.0, ["overlap too small for seam search"]

    a = prev.content[delta:h].astype(np.float32) / 255.0
    b = cur.content[:overlap].astype(np.float32) / 255.0

    va = prev.match_valid[delta:h]
    vb = cur.match_valid[:overlap]
    valid = va & vb

    gray_a = cv2.cvtColor((a * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    gray_b = cv2.cvtColor((b * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    diff = np.abs(gray_a - gray_b)

    row_sum = (diff * valid).sum(axis=1)
    row_count = valid.sum(axis=1).astype(np.float32)

    band = max(3, int(args.seam_band_px))
    kernel = np.ones(band, dtype=np.float32)

    smooth_sum = np.convolve(row_sum, kernel, mode="same")
    smooth_count = np.convolve(row_count, kernel, mode="same")

    seam_error = np.full(overlap, 999.0, dtype=np.float32)
    good_count = smooth_count > 1
    seam_error[good_count] = smooth_sum[good_count] / smooth_count[good_count]

    seam_valid_ratio = smooth_count / float(band * w)

    lo = max(args.seam_margin_px, int(round(overlap * args.seam_inner_min_ratio)))
    hi = min(overlap - args.seam_margin_px, int(round(overlap * args.seam_inner_max_ratio)))

    if hi <= lo:
        return None, 999.0, 0.0, ["invalid seam search interval"]

    candidates = np.arange(lo, hi, dtype=np.int32)
    candidates = candidates[seam_valid_ratio[candidates] >= args.min_seam_valid_ratio]

    if len(candidates) == 0:
        return None, 999.0, 0.0, ["no seam row has enough valid stable pixels"]

    # Very tiny bias toward the middle of the overlap so we don't hug edges unless
    # the visual error truly says to.
    center_penalty = np.abs((candidates / float(overlap)) - 0.5) * args.seam_center_penalty
    scores = seam_error[candidates] + center_penalty.astype(np.float32)

    best_idx = int(np.argmin(scores))
    seam = int(candidates[best_idx])
    err = float(seam_error[seam])
    valid_ratio = float(seam_valid_ratio[seam])

    if err > args.max_seam_error:
        reasons.append(f"seam error too high: {err:.5f} > {args.max_seam_error:.5f}")

    if valid_ratio < args.min_seam_valid_ratio:
        reasons.append(
            f"seam valid ratio too low: {valid_ratio:.3f} < {args.min_seam_valid_ratio:.3f}"
        )

    return seam, err, valid_ratio, reasons


def seam_local_quality(prev: Frame, cur: Frame, delta: int, seam: Optional[int], args) -> dict:
    """
    Score only the local neighborhood around the chosen seam.

    This is the important correction for your observed case:
    - The overlap may contain a dynamic video/ad above the seam.
    - The seam itself may be right and visually clean.
    - Global overlap can fail while seam-local quality is excellent.

    We allow local rescue only when the seam neighborhood is very strong and all
    non-rescuable sanity checks still pass.
    """
    h, _w = prev.content.shape[:2]
    overlap = h - delta

    if seam is None or overlap <= 0:
        return {
            "local_score": -1.0,
            "local_mae": 999.0,
            "gray_ncc": -1.0,
            "edge_ncc": -1.0,
            "edge_density": 999.0,
            "valid_ratio": 0.0,
        }

    half = max(30, int(args.seam_local_band_px // 2))

    y0 = max(0, seam - half)
    y1 = min(overlap, seam + half)

    if y1 - y0 < 40:
        return {
            "local_score": -1.0,
            "local_mae": 999.0,
            "gray_ncc": -1.0,
            "edge_ncc": -1.0,
            "edge_density": 999.0,
            "valid_ratio": 0.0,
        }

    a = prev.content[delta + y0 : delta + y1]
    b = cur.content[y0:y1]

    va = prev.match_valid[delta + y0 : delta + y1]
    vb = cur.match_valid[y0:y1]
    valid = va & vb

    valid_ratio = float(valid.mean())

    if valid_ratio < args.min_seam_valid_ratio:
        return {
            "local_score": -1.0,
            "local_mae": 999.0,
            "gray_ncc": -1.0,
            "edge_ncc": -1.0,
            "edge_density": 999.0,
            "valid_ratio": valid_ratio,
        }

    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    ea = cv2.Canny((ga * 255).astype(np.uint8), 50, 150).astype(np.float32) / 255.0
    eb = cv2.Canny((gb * 255).astype(np.uint8), 50, 150).astype(np.float32) / 255.0

    gray_ncc = masked_ncc(ga, gb, valid, min_pixels=args.min_ncc_pixels)
    edge_ncc = masked_ncc(ea, eb, valid, min_pixels=args.min_ncc_pixels)

    local_mae = float(np.mean(np.abs(ga[valid] - gb[valid])))
    mae_score = max(0.0, 1.0 - local_mae / max(args.max_seam_local_mae, 1e-6))

    local_score = (
        0.50 * gray_ncc
        + 0.25 * edge_ncc
        + 0.25 * mae_score
    )

    # Avoid cutting through dense edge/text/detail regions. A clean seam generally
    # has low edge density in a narrow band around the cut.
    seam_y_in_local = seam - y0
    edge_band = 16
    ey0 = max(0, seam_y_in_local - edge_band)
    ey1 = min(ea.shape[0], seam_y_in_local + edge_band)

    seam_edges = ((ea[ey0:ey1] > 0) | (eb[ey0:ey1] > 0))
    seam_valid = valid[ey0:ey1]

    if seam_valid.sum() > 0:
        edge_density = float(seam_edges[seam_valid].mean())
    else:
        edge_density = 999.0

    return {
        "local_score": float(local_score),
        "local_mae": float(local_mae),
        "gray_ncc": float(gray_ncc),
        "edge_ncc": float(edge_ncc),
        "edge_density": float(edge_density),
        "valid_ratio": float(valid_ratio),
    }


def is_alignment_only_failure(reason: str) -> bool:
    return (
        reason.startswith("combined score too low")
        or reason.startswith("gray score too low")
        or reason.startswith("edge score too low")
        or reason.startswith("row score too low")
    )


def is_method_spread_failure(reason: str) -> bool:
    return reason.startswith("matching methods disagree:")


# -----------------------------
# Pair alignment
# -----------------------------

def align_and_score_pair(prev: Frame, cur: Frame, args, debug_dir: Path) -> StitchDecision:
    pair_name = f"{prev.idx:03d}_{cur.idx:03d}"
    reasons: list[str] = []

    h, _w = prev.content.shape[:2]

    if cur.content.shape[:2] != prev.content.shape[:2]:
        return StitchDecision(
            pair=pair_name,
            accepted=False,
            reasons=["frame content sizes differ"],
        )

    min_d, max_d = delta_range(h, args)

    # Coarse alignment for speed.
    coarse_scale = args.coarse_scale
    fa_coarse = make_features(prev.content, prev.match_valid, coarse_scale)
    fb_coarse = make_features(cur.content, cur.match_valid, coarse_scale)

    min_dc = max(1, int(round(min_d * coarse_scale)))
    max_dc = max(min_dc + 1, int(round(max_d * coarse_scale)))

    coarse_candidates = [
        score_delta(fa_coarse, fb_coarse, dc, args)
        for dc in range(min_dc, max_dc + 1)
    ]

    coarse_candidates = [c for c in coarse_candidates if c.score > -0.5]
    if not coarse_candidates:
        return StitchDecision(
            pair=pair_name,
            accepted=False,
            reasons=["no valid coarse alignment candidates"],
        )

    coarse_best = max(coarse_candidates, key=lambda c: c.score)
    best_est_full = int(round(coarse_best.delta / coarse_scale))

    # Fine alignment at original resolution around coarse best.
    fine_lo = max(min_d, best_est_full - args.fine_window_px)
    fine_hi = min(max_d, best_est_full + args.fine_window_px)

    fa = make_features(prev.content, prev.match_valid, 1.0)
    fb = make_features(cur.content, cur.match_valid, 1.0)

    fine_candidates = [
        score_delta(fa, fb, d, args)
        for d in range(fine_lo, fine_hi + 1)
    ]
    fine_candidates = [c for c in fine_candidates if c.score > -0.5]

    if not fine_candidates:
        return StitchDecision(
            pair=pair_name,
            accepted=False,
            reasons=["no valid fine alignment candidates"],
        )

    best = max(fine_candidates, key=lambda c: c.score)
    second = find_second_best(fine_candidates, best, args.second_peak_sep_px)

    second_score = float(second.score) if second is not None else None
    margin = float(best.score - second_score) if second is not None else None

    gray_best = max(fine_candidates, key=lambda c: c.gray_score)
    edge_best = max(fine_candidates, key=lambda c: c.edge_score)
    row_best = max(fine_candidates, key=lambda c: c.row_score)

    method_deltas = [gray_best.delta, edge_best.delta, row_best.delta]
    method_spread = int(max(method_deltas) - min(method_deltas))

    if best.score < args.min_combined_score:
        reasons.append(
            f"combined score too low: {best.score:.4f} < {args.min_combined_score:.4f}"
        )

    # Only enforce second-best margin when a real second-best candidate exists.
    if margin is not None and margin < args.min_score_margin:
        reasons.append(
            f"best/second-best margin too small: {margin:.4f} < {args.min_score_margin:.4f}"
        )

    if best.gray_score < args.min_gray_score:
        reasons.append(
            f"gray score too low: {best.gray_score:.4f} < {args.min_gray_score:.4f}"
        )

    if best.edge_score < args.min_edge_score:
        reasons.append(
            f"edge score too low: {best.edge_score:.4f} < {args.min_edge_score:.4f}"
        )

    if best.row_score < args.min_row_score:
        reasons.append(
            f"row score too low: {best.row_score:.4f} < {args.min_row_score:.4f}"
        )

    if method_spread > args.max_method_spread_px:
        reasons.append(
            f"matching methods disagree: spread={method_spread}px > {args.max_method_spread_px}px"
        )

    if best.valid_ratio < args.min_valid_ratio:
        reasons.append(
            f"valid overlap ratio too low: {best.valid_ratio:.4f} < {args.min_valid_ratio:.4f}"
        )

    seam, seam_error, seam_valid_ratio, seam_reasons = choose_seam(prev, cur, best.delta, args)
    reasons.extend(seam_reasons)

    if seam is None:
        reasons.append("could not choose a safe seam")

    local = seam_local_quality(prev, cur, best.delta, seam, args)

    rescued_by_local_seam = False
    rescued_by_sticky_chrome = False
    sticky_rescue_reason = None

    local_seam_is_excellent = (
        seam is not None
        and seam_error <= args.max_seam_error
        and seam_valid_ratio >= args.min_seam_valid_ratio
        and local["local_score"] >= args.min_seam_local_score
        and local["local_mae"] <= args.max_seam_local_mae
        and local["edge_density"] <= args.max_seam_edge_density
        and local["valid_ratio"] >= args.min_seam_valid_ratio
    )

    # Ordinary seam-local rescue remains conservative: it rescues only global
    # similarity failures when geometry methods agree.
    if args.allow_seam_rescue and local_seam_is_excellent:
        alignment_only_failures = [r for r in reasons if is_alignment_only_failure(r)]
        non_rescuable_failures = [r for r in reasons if not is_alignment_only_failure(r)]

        if alignment_only_failures and not non_rescuable_failures:
            reasons = []
            rescued_by_local_seam = True

    # Sticky-tab/chrome rescue:
    #
    # Some mobile pages have a fixed tab strip whose ACTIVE TAB and horizontal
    # tab position change as vertical content crosses sections. The underlying
    # content can be aligned perfectly while gray/row methods disagree slightly.
    #
    # We may relax ONLY a *moderate* method-spread failure, and ONLY when the
    # seam neighborhood is extraordinarily strong. Large geometry disagreement,
    # invalid overlap, bad seams, size mismatches, etc. remain fatal.
    if (
        reasons
        and bool(getattr(args, "allow_sticky_chrome_rescue", True))
        and seam is not None
    ):
        alignment_failures = [
            r for r in reasons if is_alignment_only_failure(r)
        ]
        spread_failures = [
            r for r in reasons if is_method_spread_failure(r)
        ]
        other_failures = [
            r
            for r in reasons
            if not is_alignment_only_failure(r)
            and not is_method_spread_failure(r)
        ]

        sticky_local_is_exceptional = (
            best.score >= float(args.sticky_rescue_min_combined_score)
            and method_spread <= int(args.sticky_rescue_max_method_spread_px)
            and seam_error <= float(args.sticky_rescue_max_seam_error)
            and seam_valid_ratio >= args.min_seam_valid_ratio
            and local["local_score"] >= float(args.sticky_rescue_min_local_score)
            and local["local_mae"] <= float(args.sticky_rescue_max_local_mae)
            and local["edge_density"] <= float(args.sticky_rescue_max_edge_density)
            and local["valid_ratio"] >= args.min_seam_valid_ratio
            and best.overlap >= int(args.sticky_rescue_min_overlap_px)
        )

        if (
            sticky_local_is_exceptional
            and spread_failures
            and not other_failures
            and (alignment_failures or spread_failures)
        ):
            rescued_by_sticky_chrome = True
            sticky_rescue_reason = (
                "exceptional seam-local agreement overrides modest global/"
                f"row disagreement from changing sticky chrome; "
                f"spread={method_spread}px, "
                f"local_score={local['local_score']:.4f}, "
                f"local_mae={local['local_mae']:.6f}, "
                f"seam_error={seam_error:.6f}"
            )
            reasons = []

    accepted = len(reasons) == 0

    decision = StitchDecision(
        pair=pair_name,
        accepted=accepted,
        reasons=reasons,
        delta=best.delta,
        overlap=best.overlap,
        seam=seam,
        seam_global_in_next_frame=seam,
        best_score=best.score,
        second_best_score=second_score,
        score_margin=margin,
        gray_best_delta=gray_best.delta,
        edge_best_delta=edge_best.delta,
        row_best_delta=row_best.delta,
        method_spread_px=method_spread,
        gray_score=best.gray_score,
        edge_score=best.edge_score,
        row_score=best.row_score,
        valid_ratio=best.valid_ratio,
        seam_error=seam_error,
        seam_valid_ratio=seam_valid_ratio,
        seam_local_score=local["local_score"],
        seam_local_mae=local["local_mae"],
        seam_local_gray_ncc=local["gray_ncc"],
        seam_local_edge_ncc=local["edge_ncc"],
        seam_edge_density=local["edge_density"],
        seam_local_valid_ratio=local["valid_ratio"],
        rescued_by_local_seam=rescued_by_local_seam,
        rescued_by_sticky_chrome=rescued_by_sticky_chrome,
        sticky_rescue_reason=sticky_rescue_reason,
    )

    save_pair_debug(prev, cur, decision, debug_dir)

    return decision


# -----------------------------
# Debug artifacts
# -----------------------------

def save_mask(path: Path, mask: np.ndarray) -> None:
    cv2.imwrite(str(path), (mask.astype(np.uint8) * 255))


def save_pair_debug(prev: Frame, cur: Frame, decision: StitchDecision, debug_dir: Path) -> None:
    debug_dir.mkdir(parents=True, exist_ok=True)

    pair = decision.pair

    cv2.imwrite(str(debug_dir / f"frame_{prev.idx:03d}_content.png"), prev.content)
    cv2.imwrite(str(debug_dir / f"frame_{cur.idx:03d}_content.png"), cur.content)
    save_mask(debug_dir / f"frame_{prev.idx:03d}_match_valid.png", prev.match_valid)
    save_mask(debug_dir / f"frame_{cur.idx:03d}_match_valid.png", cur.match_valid)

    if decision.delta is None or decision.seam is None:
        return

    left = prev.content.copy()
    right = cur.content.copy()

    y_left = int(decision.delta + decision.seam)
    y_right = int(decision.seam)

    color = (0, 255, 0) if decision.accepted else (0, 0, 255)
    label = "ACCEPT" if decision.accepted else "REJECT"
    if decision.rescued_by_sticky_chrome:
        label = "ACCEPT sticky-chrome rescue"
    elif decision.rescued_by_local_seam:
        label = "ACCEPT local-seam rescue"

    cv2.line(left, (0, y_left), (left.shape[1] - 1, y_left), color, 3)
    cv2.line(right, (0, y_right), (right.shape[1] - 1, y_right), color, 3)

    cv2.putText(
        left,
        f"prev seam y={y_left}",
        (20, max(40, y_left - 15)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        color,
        2,
        cv2.LINE_AA,
    )

    cv2.putText(
        right,
        f"next seam y={y_right} {label}",
        (20, max(40, y_right - 15)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        color,
        2,
        cv2.LINE_AA,
    )

    gap = np.full((left.shape[0], 16, 3), 255, dtype=np.uint8)
    side_by_side = np.hstack([left, gap, right])

    cv2.imwrite(str(debug_dir / f"pair_{pair}_seam_overlay.png"), side_by_side)

    h = prev.content.shape[0]
    delta = int(decision.delta)
    overlap = h - delta

    if overlap > 0:
        a = prev.content[delta:h]
        b = cur.content[:overlap]
        gray_a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gray_b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
        diff = np.abs(gray_a - gray_b)
        diff = np.clip(diff * 4.0, 0, 255).astype(np.uint8)
        cv2.imwrite(str(debug_dir / f"pair_{pair}_overlap_diff.png"), diff)

    if decision.seam is not None:
        save_seam_local_debug(prev, cur, decision, debug_dir)


def save_seam_local_debug(prev: Frame, cur: Frame, decision: StitchDecision, debug_dir: Path) -> None:
    if decision.delta is None or decision.seam is None:
        return

    h = prev.content.shape[0]
    overlap = h - decision.delta
    if overlap <= 0:
        return

    band = 260
    half = band // 2
    y0 = max(0, decision.seam - half)
    y1 = min(overlap, decision.seam + half)

    a = prev.content[decision.delta + y0 : decision.delta + y1].copy()
    b = cur.content[y0:y1].copy()

    if a.size == 0 or b.size == 0:
        return

    seam_y = decision.seam - y0
    color = (0, 255, 0) if decision.accepted else (0, 0, 255)
    cv2.line(a, (0, seam_y), (a.shape[1] - 1, seam_y), color, 2)
    cv2.line(b, (0, seam_y), (b.shape[1] - 1, seam_y), color, 2)

    gap = np.full((a.shape[0], 16, 3), 255, dtype=np.uint8)
    side_by_side = np.hstack([a, gap, b])
    cv2.imwrite(str(debug_dir / f"pair_{decision.pair}_seam_local.png"), side_by_side)


# -----------------------------
# Composition
# -----------------------------

def compose_frames(frames: list[Frame], decisions: list[StitchDecision], args) -> tuple[np.ndarray, dict]:
    if len(frames) < 1:
        raise RuntimeError("Need at least one frame.")

    if len(frames) == 1:
        # Non-scrollable or very short page. There is nothing to align; return
        # the single captured content region and let the normal final render
        # add back chrome/overlays. This keeps tiny pages from failing just
        # because there are no adjacent scroll pairs.
        f = frames[0]
        return f.content.copy(), {
            "single_frame_mode": True,
            "reason": "only one unique viewport captured",
            "origins": [0],
            "seam_globals": [],
            "primary_ranges": [{"frame": 0, "global_start": 0, "global_end": int(f.content.shape[0])}],
            "final_height": int(f.content.shape[0]),
            "width": int(f.content.shape[1]),
            "hole_ratio_before_inpaint": 0.0,
            "max_hole_row_ratio_before_inpaint": 0.0,
            "inpainted_remaining_holes": False,
        }

    if len(decisions) != len(frames) - 1:
        raise RuntimeError("Need one stitch decision for each adjacent frame pair.")

    bad = [d for d in decisions if not d.accepted]
    if bad:
        raise RuntimeError(
            "Cannot compose because at least one stitch was rejected:\n"
            + json.dumps([b.as_dict() for b in bad], indent=2)
        )

    h, w = frames[0].content.shape[:2]

    # Frame i origin means: where frame i's local y=0 lands in final composite y.
    origins = [0]
    seam_globals = []

    for d in decisions:
        assert d.delta is not None
        assert d.seam is not None

        next_origin = origins[-1] + int(d.delta)
        origins.append(next_origin)
        seam_globals.append(next_origin + int(d.seam))

    final_h = origins[-1] + h

    trim_info = {
        "trimmed_final_unsafe_bottom": False,
        "original_final_height": int(final_h),
        "trimmed_final_height": int(final_h),
    }

    # The final frame can still have bottom app chrome / FAB-masked areas. Trim
    # unsafe tail if requested.
    if args.trim_final_unsafe:
        last = frames[-1]
        invalid = ~last.comp_valid
        row_invalid_ratio = invalid.mean(axis=1)
        start = int(round(h * args.final_trim_search_start_ratio))

        cut = None
        for y in range(start, h):
            if row_invalid_ratio[y] >= args.final_unsafe_row_invalid_ratio:
                cut = y
                break

        if cut is not None:
            final_h = min(final_h, origins[-1] + cut)
            trim_info["trimmed_final_unsafe_bottom"] = True
            trim_info["trimmed_final_height"] = int(final_h)
            trim_info["last_frame_safe_cut_y"] = int(cut)

    canvas = np.zeros((final_h, w, 3), dtype=np.uint8)
    filled = np.zeros((final_h, w), dtype=bool)

    primary_ranges = []

    # Primary ownership: each global interval is taken from the frame whose side
    # of the seam it belongs to. This prevents duplicated overlap.
    for i, frame in enumerate(frames):
        start = 0 if i == 0 else seam_globals[i - 1]
        end = final_h if i == len(frames) - 1 else seam_globals[i]

        start = max(start, origins[i])
        end = min(end, origins[i] + h, final_h)

        primary_ranges.append(
            {
                "frame": i,
                "global_start": int(start),
                "global_end": int(end),
            }
        )

        if end <= start:
            continue

        local_start = start - origins[i]
        local_end = end - origins[i]

        region = frame.content[local_start:local_end]
        valid = frame.comp_valid[local_start:local_end]

        target = canvas[start:end]
        target_filled = filled[start:end]

        write = valid
        target[write] = region[write]
        target_filled[write] = True

    # Backfill holes only from valid regions of other frames. This is not blending;
    # it just avoids holes from masks where another frame has safe pixels.
    for i, frame in enumerate(frames):
        start = max(0, origins[i])
        end = min(final_h, origins[i] + h)

        if end <= start:
            continue

        local_start = start - origins[i]
        local_end = end - origins[i]

        region = frame.content[local_start:local_end]
        valid = frame.comp_valid[local_start:local_end]

        target = canvas[start:end]
        target_filled = filled[start:end]

        write = valid & (~target_filled)
        target[write] = region[write]
        target_filled[write] = True

    holes = ~filled
    hole_ratio = float(holes.mean())
    hole_rows = holes.mean(axis=1)

    # Save a diagnostic hole map before any inpaint/fill. White = pixels that
    # could not be supplied by a non-overlay region from any captured frame.
    try:
        debug_dir = Path(args.out) / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_dir / "composite_holes_before_inpaint.png"), holes.astype(np.uint8) * 255)
    except Exception:
        pass

    comp_report = {
        "origins": [int(x) for x in origins],
        "seam_globals": [int(x) for x in seam_globals],
        "primary_ranges": primary_ranges,
        "final_height": int(final_h),
        "width": int(w),
        "hole_ratio_before_inpaint": hole_ratio,
        "max_hole_row_ratio_before_inpaint": float(hole_rows.max()) if len(hole_rows) else 0.0,
        **trim_info,
    }

    if hole_ratio > args.max_allowed_hole_ratio:
        raise RuntimeError(
            f"Composite has too many unfilled overlay-mask pixels: {hole_ratio:.6f} > "
            f"{args.max_allowed_hole_ratio:.6f}. Inspect debug/composite_holes_before_inpaint.png. "
            f"Use a smaller output FAB mask, capture one extra scroll, or increase "
            f"--max-allowed-hole-ratio only after visual inspection."
        )

    if hole_ratio > 0 and args.inpaint_remaining_holes:
        # This is only for small leftover overlay masks after multi-frame backfill.
        # It is not used for alignment and it should remain a tiny fraction of the
        # image. The report records exactly how much was filled.
        mask = holes.astype(np.uint8) * 255
        canvas = cv2.inpaint(canvas, mask, args.inpaint_radius, cv2.INPAINT_TELEA)
        comp_report["inpainted_remaining_holes"] = True
    else:
        comp_report["inpainted_remaining_holes"] = False

    return canvas, comp_report


# -----------------------------
# Report / CLI
# -----------------------------

def json_safe_settings(args) -> dict:
    out = {}
    for k, v in vars(args).items():
        if isinstance(v, Path):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def write_report(
    path: Path,
    args,
    frames: list[Frame],
    decisions: list[StitchDecision],
    comp_report: Optional[dict],
) -> None:
    report = {
        "settings": json_safe_settings(args),
        "page_profile": getattr(args, "_page_profile", None),
        "chrome_detection": getattr(args, "_chrome_detection", None),
        "return_to_top": getattr(args, "_return_to_top_report", None),
        "auto_bottom_stop": getattr(args, "_auto_bottom_report", None),
        "frames": [
            {
                "idx": f.idx,
                "raw_shape": list(f.raw_shape),
                "content_shape": list(f.content.shape),
                "top_crop": f.top_crop,
                "bottom_crop": f.bottom_crop,
                "match_valid_ratio": float(f.match_valid.mean()),
                "composite_valid_ratio": float(f.comp_valid.mean()),
            }
            for f in frames
        ],
        "decisions": [d.as_dict() for d in decisions],
        "composite": comp_report,
    }

    path.write_text(json.dumps(report, indent=2), encoding="utf-8")




def fab_restore_rect_raw(frame: Frame, args) -> tuple[int, int, int, int, dict]:
    """
    Return the raw-screenshot rectangle used to restore a fixed floating button.

    The existing FAB ratios are defined inside the cropped content area because
    they are also used by the match/composite masks. This function converts that
    content-space center back to raw screenshot coordinates, then expands it into
    a generous rectangle so the full button + shadow + any inpaint artifact gets
    covered by one clean patch from the raw screenshot.
    """
    raw = frame.raw_image
    h, w = raw.shape[:2]
    content_h = h - frame.top_crop - frame.bottom_crop

    cx = int(round(w * args.fab_output_cx_ratio))
    cy = int(round(frame.top_crop + content_h * args.fab_output_cy_ratio))
    base_r = int(round(min(w, max(1, content_h)) * args.fab_output_radius_ratio))
    base_r = max(args.fab_output_min_radius_px, base_r)

    rx = int(round(base_r * args.fab_restore_rect_scale_x))
    ry = int(round(base_r * args.fab_restore_rect_scale_y))

    x0 = max(0, cx - rx)
    x1 = min(w, cx + rx)
    y0 = max(0, cy - ry)
    y1 = min(h, cy + ry)

    meta = {
        "cx": int(cx),
        "cy": int(cy),
        "base_radius_px": int(base_r),
        "rect_scale_x": float(args.fab_restore_rect_scale_x),
        "rect_scale_y": float(args.fab_restore_rect_scale_y),
    }

    return x0, y0, x1, y1, meta


def detect_blue_fab_in_patch(patch: np.ndarray, args) -> dict:
    """
    Lightweight auto-detection for the current app's blue floating + button.

    This is intentionally conservative. In auto mode we only restore the patch
    when the expected bottom-right region contains a sufficiently large saturated
    blue component. For non-blue FABs, use --restore-fab-overlay always or tune
    the hue/saturation thresholds.
    """
    if patch.size == 0:
        return {
            "detected": False,
            "reason": "empty patch",
            "blue_pixels": 0,
            "blue_ratio": 0.0,
            "largest_blue_component_px": 0,
        }

    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    h = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    hue_lo = int(args.fab_restore_blue_hue_low)
    hue_hi = int(args.fab_restore_blue_hue_high)

    if hue_lo <= hue_hi:
        hue_ok = (h >= hue_lo) & (h <= hue_hi)
    else:
        # Supports wraparound ranges if ever needed.
        hue_ok = (h >= hue_lo) | (h <= hue_hi)

    blue = (
        hue_ok
        & (sat >= int(args.fab_restore_min_saturation))
        & (val >= int(args.fab_restore_min_value))
    )

    if args.fab_restore_blue_close_px > 0:
        k = int(args.fab_restore_blue_close_px)
        if k % 2 == 0:
            k += 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        blue = cv2.morphologyEx(blue.astype(np.uint8), cv2.MORPH_CLOSE, kernel).astype(bool)

    blue_pixels = int(blue.sum())
    blue_ratio = float(blue.mean())

    largest = 0
    if blue_pixels > 0:
        num, labels, stats, _centroids = cv2.connectedComponentsWithStats(blue.astype(np.uint8), 8)
        if num > 1:
            largest = int(stats[1:, cv2.CC_STAT_AREA].max())

    detected = (
        blue_pixels >= int(args.fab_restore_min_blue_pixels)
        and blue_ratio >= float(args.fab_restore_min_blue_ratio)
        and largest >= int(args.fab_restore_min_blue_component_px)
    )

    return {
        "detected": bool(detected),
        "reason": "blue FAB-like component found" if detected else "no large blue FAB-like component found",
        "blue_pixels": int(blue_pixels),
        "blue_ratio": float(blue_ratio),
        "largest_blue_component_px": int(largest),
    }



def build_fab_overlay_alphas(patch: np.ndarray, args, fallback: Optional[dict] = None) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Build two masks for restoring a floating action button without copying the
    rectangular background around it.

    - shadow_alpha darkens the destination underneath the button using a soft,
      synthetic shadow. It does NOT copy source background pixels.
    - button_alpha copies only the button disk / antialiased edge from the raw
      screenshot patch. This prevents the rectangular patch distortion that can
      happen when the content under the FAB differs between the raw viewport and
      the final long composite.
    """
    ph, pw = patch.shape[:2]
    empty = np.zeros((ph, pw), dtype=np.float32)
    meta = {
        "detected_blue_component": False,
        "reason": "not computed",
    }

    if patch.size == 0 or ph <= 0 or pw <= 0:
        meta["reason"] = "empty patch"
        return empty, empty, meta

    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    lo = int(args.fab_restore_blue_hue_low)
    hi = int(args.fab_restore_blue_hue_high)
    if lo <= hi:
        hue_ok = (hue >= lo) & (hue <= hi)
    else:
        hue_ok = (hue >= lo) | (hue <= hi)

    blue = hue_ok & (sat >= int(args.fab_restore_min_saturation)) & (val >= int(args.fab_restore_min_value))

    k = max(3, int(args.fab_restore_blue_close_px))
    if k % 2 == 0:
        k += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blue_closed = cv2.morphologyEx(blue.astype(np.uint8), cv2.MORPH_CLOSE, kernel).astype(bool)

    cx = None
    cy = None
    r = None

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(blue_closed.astype(np.uint8), 8)
    if num > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        best_i = int(np.argmax(areas)) + 1
        area = int(stats[best_i, cv2.CC_STAT_AREA])
        x = int(stats[best_i, cv2.CC_STAT_LEFT])
        y = int(stats[best_i, cv2.CC_STAT_TOP])
        bw = int(stats[best_i, cv2.CC_STAT_WIDTH])
        bh = int(stats[best_i, cv2.CC_STAT_HEIGHT])
        if area >= int(args.fab_restore_min_blue_component_px):
            cx = float(centroids[best_i][0])
            cy = float(centroids[best_i][1])
            r = float(max(bw, bh)) / 2.0
            meta.update({
                "detected_blue_component": True,
                "reason": "blue component used for masked FAB restore",
                "component_rect_patch": [int(x), int(y), int(x + bw), int(y + bh)],
                "component_area_px": int(area),
                "component_center_patch": [float(cx), float(cy)],
                "component_radius_px": float(r),
            })

    if cx is None or cy is None or r is None:
        if fallback:
            cx = float(fallback.get("cx_patch", pw / 2.0))
            cy = float(fallback.get("cy_patch", ph / 2.0))
            r = float(fallback.get("radius_px", min(pw, ph) / 4.0))
            meta.update({
                "detected_blue_component": False,
                "reason": "fallback center/radius used for masked FAB restore",
                "fallback_center_patch": [float(cx), float(cy)],
                "fallback_radius_px": float(r),
            })
        else:
            meta["reason"] = "no blue component and no fallback geometry"
            return empty, empty, meta

    # Button disk alpha: full opacity inside the disk, then a small feathered edge.
    button_r = max(1.0, r * float(args.fab_restore_button_radius_scale))
    feather = max(1.0, float(args.fab_restore_edge_feather_px))

    yy, xx = np.mgrid[0:ph, 0:pw]
    dist = np.sqrt((xx.astype(np.float32) - cx) ** 2 + (yy.astype(np.float32) - cy) ** 2)
    button_alpha = np.clip((button_r + feather - dist) / feather, 0.0, 1.0).astype(np.float32)

    # Keep the source button disk, including the white + glyph. Outside the disk,
    # do not copy raw source pixels because those pixels are page content, not FAB.
    if args.fab_restore_use_blue_guard:
        # Blue guard prevents accidentally copying a large pale/background area if
        # detection went wrong, while preserving the white plus because it sits
        # inside the geometric disk.
        guard_r = button_r + feather
        button_alpha[dist > guard_r] = 0.0

    # Synthetic soft shadow. This darkens the destination rather than copying the
    # source background, so it cannot create a mismatched rectangular patch.
    shadow_opacity = max(0.0, min(1.0, float(args.fab_restore_shadow_opacity)))
    if shadow_opacity <= 0.0:
        shadow_alpha = empty.copy()
    else:
        sx = cx + r * float(args.fab_restore_shadow_offset_x_ratio)
        sy = cy + r * float(args.fab_restore_shadow_offset_y_ratio)
        sr = max(1.0, r * float(args.fab_restore_shadow_radius_scale))
        sdist = np.sqrt((xx.astype(np.float32) - sx) ** 2 + (yy.astype(np.float32) - sy) ** 2)
        shadow_alpha = np.exp(-((sdist / sr) ** 2) * 2.0).astype(np.float32) * shadow_opacity
        # Do not darken under the opaque blue disk; the source button disk will
        # be pasted there anyway.
        shadow_alpha *= (1.0 - np.clip(button_alpha, 0.0, 1.0))
        shadow_alpha = np.clip(shadow_alpha, 0.0, shadow_opacity).astype(np.float32)

    meta.update({
        "button_radius_px": float(button_r),
        "button_edge_feather_px": float(feather),
        "shadow_opacity": float(shadow_opacity),
        "shadow_radius_px": float(r * float(args.fab_restore_shadow_radius_scale)),
        "button_alpha_nonzero_px": int((button_alpha > 0.01).sum()),
        "shadow_alpha_nonzero_px": int((shadow_alpha > 0.01).sum()),
    })

    return button_alpha, shadow_alpha, meta


def restore_fab_overlay_once(final_display: np.ndarray, frames: list[Frame], args, comp_report: Optional[dict]) -> tuple[np.ndarray, dict]:
    """
    Presentation-only restoration of fixed floating overlays.

    The FAB is excluded from stitching because it is fixed UI, not scrollable
    content. The important production detail is that we must NOT paste the whole
    rectangular source patch, because that rectangle contains ordinary feed
    content from the last viewport. If that background differs from the final
    composite, it creates the warped/distorted patch seen around the button.

    Correct model:
        1. do NOT alter layout or add a gutter just for the FAB
        2. do NOT copy the rectangular background around the FAB
        3. paste only the button itself at the exact fixed viewport position

    v8 default behavior intentionally disables the synthetic shadow and the
    bottom overlay gutter. The goal is a pure FAB-only overlay placed exactly
    where it sits in the final viewport, with no extra background, no padding,
    and no layout changes below it.
    """
    report = {
        "mode": str(args.restore_fab_overlay),
        "restored": False,
        "reason": "not attempted",
    }

    if not frames:
        report["reason"] = "no frames"
        return final_display, report

    if args.restore_fab_overlay == "never":
        report["reason"] = "disabled by --restore-fab-overlay never"
        return final_display, report

    last = frames[-1]
    raw = last.raw_image
    raw_h, raw_w = raw.shape[:2]

    x0, y0, x1, y1, rect_meta = fab_restore_rect_raw(last, args)
    patch = raw[y0:y1, x0:x1].copy()

    report.update({
        "raw_rect": [int(x0), int(y0), int(x1), int(y1)],
        **rect_meta,
    })

    detection = detect_blue_fab_in_patch(patch, args)
    report["auto_detection"] = detection

    if args.restore_fab_overlay == "auto" and not detection["detected"]:
        report["reason"] = detection["reason"]
        return final_display, report

    fallback = {
        "cx_patch": float(rect_meta.get("cx", (x0 + x1) / 2.0) - x0),
        "cy_patch": float(rect_meta.get("cy", (y0 + y1) / 2.0) - y0),
        "radius_px": float(rect_meta.get("base_radius_px", min(max(1, x1 - x0), max(1, y1 - y0)) / 4.0)),
    }
    button_alpha, shadow_alpha, alpha_meta = build_fab_overlay_alphas(patch, args, fallback=fallback)
    report["alpha_mask"] = alpha_meta

    if button_alpha.size == 0 or float(button_alpha.max(initial=0.0)) <= 0.0:
        report["reason"] = "FAB alpha mask is empty"
        return final_display, report

    # Because this is a fixed viewport overlay, anchor it relative to the bottom
    # of the final display. This makes the long screenshot read like the phone's
    # current viewport at the end of the capture.
    display_h, display_w = final_display.shape[:2]
    dx0 = int(round(display_w * (x0 / max(1, raw_w))))
    dx1 = int(round(display_w * (x1 / max(1, raw_w))))
    dy0 = int(display_h - raw_h + y0)
    dy1 = int(display_h - raw_h + y1)

    # Clip safely. The patch and masks are clipped identically.
    src_x0 = 0
    src_y0 = 0
    src_x1 = patch.shape[1]
    src_y1 = patch.shape[0]

    if dx0 < 0:
        src_x0 += -dx0
        dx0 = 0
    if dy0 < 0:
        src_y0 += -dy0
        dy0 = 0
    if dx1 > display_w:
        src_x1 -= dx1 - display_w
        dx1 = display_w
    if dy1 > display_h:
        src_y1 -= dy1 - display_h
        dy1 = display_h

    if dx1 <= dx0 or dy1 <= dy0 or src_x1 <= src_x0 or src_y1 <= src_y0:
        report["reason"] = "restore patch lies outside final display"
        return final_display, report

    patch_clipped = patch[src_y0:src_y1, src_x0:src_x1]
    button_alpha_clipped = button_alpha[src_y0:src_y1, src_x0:src_x1]
    shadow_alpha_clipped = shadow_alpha[src_y0:src_y1, src_x0:src_x1]

    out_w = dx1 - dx0
    out_h = dy1 - dy0
    if patch_clipped.shape[:2] != (out_h, out_w):
        patch_clipped = cv2.resize(patch_clipped, (out_w, out_h), interpolation=cv2.INTER_AREA)
        button_alpha_clipped = cv2.resize(button_alpha_clipped, (out_w, out_h), interpolation=cv2.INTER_LINEAR)
        shadow_alpha_clipped = cv2.resize(shadow_alpha_clipped, (out_w, out_h), interpolation=cv2.INTER_LINEAR)

    button_alpha_clipped = np.clip(button_alpha_clipped.astype(np.float32), 0.0, 1.0)
    shadow_alpha_clipped = np.clip(shadow_alpha_clipped.astype(np.float32), 0.0, 1.0)

    restored = final_display.copy()
    region = restored[dy0:dy1, dx0:dx1].astype(np.float32)

    # Synthetic shadow: darken destination only. No raw background pixels copied.
    if float(shadow_alpha_clipped.max(initial=0.0)) > 0.0:
        region *= (1.0 - shadow_alpha_clipped[:, :, None])

    # Button disk: paste clean raw button pixels through the circular alpha.
    src = patch_clipped.astype(np.float32)
    a = button_alpha_clipped[:, :, None]
    region = src * a + region * (1.0 - a)

    restored[dy0:dy1, dx0:dx1] = np.clip(region, 0, 255).astype(np.uint8)

    report.update({
        "restored": True,
        "reason": "restored FAB with masked circular alpha, not rectangular background patch",
        "display_rect": [int(dx0), int(dy0), int(dx1), int(dy1)],
        "raw_frame_index": int(last.idx),
        "button_alpha_max": float(button_alpha_clipped.max(initial=0.0)),
        "shadow_alpha_max": float(shadow_alpha_clipped.max(initial=0.0)),
    })

    # Debug artifacts for the restored patch and masks.
    try:
        debug_dir = Path(args.out) / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug_dir / "fab_restore_patch.png"), patch)
        cv2.imwrite(str(debug_dir / "fab_restore_button_alpha.png"), np.clip(button_alpha * 255.0, 0, 255).astype(np.uint8))
        cv2.imwrite(str(debug_dir / "fab_restore_shadow_alpha.png"), np.clip(shadow_alpha * 255.0, 0, 255).astype(np.uint8))
    except Exception:
        pass

    return restored, report


def compute_bottom_overlay_gutter_px(frames: list[Frame], args) -> int:
    """
    Optional presentation gutter placed between stitched content and bottom chrome.

    Why this exists:
    - A FAB is a fixed viewport overlay, so restoring it at the bottom of a very
      long stitched image can cover real text from the last captured content row.
    - That is not a seam failure and not a FAB-mask failure; it is a final
      presentation collision between scrollable content and fixed overlay UI.
    - The gutter gives fixed bottom overlays the same kind of safe visual lane a
      phone viewport has near the bottom, so the FAB/nav can be restored cleanly
      without sitting on top of the last line of content.
    """
    mode = str(getattr(args, "bottom_overlay_gutter", "auto"))
    if mode == "never" or not frames:
        args._bottom_overlay_gutter_px = 0
        args._bottom_overlay_gutter_reason = "disabled"
        return 0

    nav_present = bool(getattr(args, "_bottom_nav_present", False))
    fab_possible = bool(getattr(args, "mask_fab_in_output", False)) and str(getattr(args, "restore_fab_overlay", "auto")) != "never"

    if mode == "auto" and not (nav_present and fab_possible):
        args._bottom_overlay_gutter_px = 0
        args._bottom_overlay_gutter_reason = "auto skipped: no bottom nav/FAB combination"
        return 0

    explicit = getattr(args, "bottom_overlay_gutter_px", None)
    if explicit is not None:
        gutter = int(explicit)
        reason = "explicit --bottom-overlay-gutter-px"
    else:
        last = frames[-1]
        raw_h, raw_w = last.raw_image.shape[:2]
        content_h = max(1, raw_h - last.top_crop - last.bottom_crop)
        base_r = int(round(min(raw_w, content_h) * float(args.fab_output_radius_ratio)))
        base_r = max(int(args.fab_output_min_radius_px), base_r)
        gutter = int(round(base_r * float(args.bottom_overlay_gutter_radius_scale)))
        reason = "derived from FAB radius"

    gutter = max(int(args.bottom_overlay_gutter_min_px), gutter)
    gutter = min(int(args.bottom_overlay_gutter_max_px), gutter)
    gutter = max(0, gutter)

    args._bottom_overlay_gutter_px = int(gutter)
    args._bottom_overlay_gutter_reason = reason
    return int(gutter)


def sample_bottom_gutter_color(frames: list[Frame], target_w: int) -> np.ndarray:
    """
    Sample a neutral app-background color for the bottom overlay gutter.
    Prefer the bottom chrome/nav background because it is usually the correct
    white/off-white surface for this app family.
    """
    if not frames:
        return np.array([255, 255, 255], dtype=np.uint8)

    last = frames[-1]
    raw = last.raw_image
    h, w = raw.shape[:2]

    if last.bottom_crop > 0:
        y0 = max(0, h - last.bottom_crop)
        y1 = min(h, y0 + min(32, last.bottom_crop))
        band = raw[y0:y1]
    else:
        y1 = h
        y0 = max(0, h - 32)
        band = raw[y0:y1]

    if band.size == 0:
        return np.array([255, 255, 255], dtype=np.uint8)

    # Median is robust against icons/text in the nav band.
    color = np.median(band.reshape(-1, 3), axis=0)
    return np.clip(color, 0, 255).astype(np.uint8)

def add_chrome_back(final_content: np.ndarray, frames: list[Frame], args) -> np.ndarray:
    """
    Presentation-only wrapper: add top chrome and the detected bottom chrome
    after all stitching is complete.

    This does not affect matching or seams.

    v7 improvement: optionally insert a small safe gutter between the stitched
    content and the bottom nav. This prevents the final restored FAB from landing
    directly on top of the last visible line of scroll content.
    """
    if not frames:
        return final_content

    first = frames[0]
    last = frames[-1]
    h = last.raw_image.shape[0]

    parts = []

    if first.top_crop > 0:
        parts.append(first.raw_image[: first.top_crop])

    parts.append(final_content)

    target_w = final_content.shape[1]
    gutter_px = compute_bottom_overlay_gutter_px(frames, args)
    if gutter_px > 0:
        color = sample_bottom_gutter_color(frames, target_w)
        gutter = np.zeros((gutter_px, target_w, 3), dtype=np.uint8)
        gutter[:, :] = color.reshape(1, 1, 3)
        parts.append(gutter)

        try:
            debug_dir = Path(args.out) / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(debug_dir / "bottom_overlay_gutter.png"), gutter)
        except Exception:
            pass

    if last.bottom_crop > 0:
        parts.append(last.raw_image[h - last.bottom_crop : h])

    # Widths should match, but guard against odd input-dir images.
    fixed_parts = []
    for part in parts:
        if part.shape[1] != target_w:
            part = cv2.resize(part, (target_w, part.shape[0]), interpolation=cv2.INTER_AREA)
        fixed_parts.append(part)

    return np.vstack(fixed_parts)


def final_output_path(out_dir: Path, args) -> Path:
    suffix = getattr(args, "_output_suffix", "withnav" if getattr(args, "_bottom_nav_present", False) else "nonav")
    return out_dir / f"final_long_screenshot_{suffix}.png"

def parse_args():
    p = argparse.ArgumentParser()

    p.add_argument("--device", default=None, help="ADB device id, e.g. emulator-5554.")
    p.add_argument("--input-dir", default=None, help="Optional folder of existing screenshots.")
    p.add_argument("--out", default="./longshot_out")

    p.add_argument("--scrolls", type=int, default=5)

    p.add_argument("--pre-capture-wait", type=float, default=0.2)
    p.add_argument("--pair-delay", type=float, default=0.15)
    p.add_argument("--settle-after-scroll", type=float, default=0.85)

    # After capture, restore the device/emulator to the first captured viewport.
    # This does not affect stitching because the screenshots are already saved.
    # The reverse replay is deterministic first; image similarity is verification,
    # never permission to stop after only one coincidentally similar card screen.
    p.add_argument("--auto-stop-at-bottom", dest="auto_stop_at_bottom", action="store_true", default=True)
    p.add_argument("--no-auto-stop-at-bottom", dest="auto_stop_at_bottom", action="store_false")
    p.add_argument("--auto-bottom-min-completed-scrolls", type=int, default=0)
    p.add_argument("--auto-bottom-compare-y0-ratio", type=float, default=0.26)
    p.add_argument("--auto-bottom-compare-y1-ratio", type=float, default=0.76)
    p.add_argument("--auto-bottom-compare-x0-ratio", type=float, default=0.08)
    p.add_argument("--auto-bottom-compare-x1-ratio", type=float, default=0.92)
    p.add_argument("--auto-bottom-compare-width-px", type=int, default=260)

    p.add_argument("--auto-bottom-crop-padding-px", type=int, default=24)
    p.add_argument("--auto-bottom-min-valid-ratio", type=float, default=0.32)
    p.add_argument("--auto-bottom-dynamic-threshold", type=int, default=10)
    p.add_argument("--auto-bottom-dynamic-dilate-px", type=int, default=13)
    
    p.add_argument("--auto-bottom-exclude-fab-zone", dest="auto_bottom_exclude_fab_zone", action="store_true", default=True)
    p.add_argument("--no-auto-bottom-exclude-fab-zone", dest="auto_bottom_exclude_fab_zone", action="store_false")
    p.add_argument("--auto-bottom-fab-x0-ratio", type=float, default=0.68)
    p.add_argument("--auto-bottom-fab-y0-ratio", type=float, default=0.55)
    
    p.add_argument("--auto-bottom-match-ncc", type=float, default=0.992)
    p.add_argument("--auto-bottom-match-mae", type=float, default=2.8)
    p.add_argument("--auto-bottom-structural-ncc", type=float, default=0.975)
    p.add_argument("--auto-bottom-structural-mae", type=float, default=5.5)
    p.add_argument("--auto-bottom-edge-mae", type=float, default=6.5)

    p.add_argument("--return-to-top", dest="return_to_top", action="store_true", default=True)
    p.add_argument("--no-return-to-top", dest="return_to_top", action="store_false")
    p.add_argument("--return-to-top-extra-swipes", type=int, default=0)
    p.add_argument("--return-to-top-max-swipes", type=int, default=30)
    p.add_argument("--return-to-top-settle", type=float, default=0.35)
    p.add_argument("--return-to-top-x-ratio", type=float, default=None)
    p.add_argument("--return-to-top-start-ratio", type=float, default=None, help="Finger start y-ratio for reset swipe. Default uses --swipe-end-ratio.")
    p.add_argument("--return-to-top-end-ratio", type=float, default=None, help="Finger end y-ratio for reset swipe. Default uses --swipe-start-ratio.")
    p.add_argument("--return-to-top-duration-ms", type=int, default=None)
    p.add_argument("--return-to-top-match-ncc", type=float, default=0.985)
    p.add_argument("--return-to-top-match-mae", type=float, default=8.0)
    p.add_argument("--return-to-top-match-edge-ncc", type=float, default=0.75)
    p.add_argument("--return-to-top-compare-x0-ratio", type=float, default=0.06)
    p.add_argument("--return-to-top-compare-x1-ratio", type=float, default=0.94)
    p.add_argument("--return-to-top-compare-y0-ratio", type=float, default=0.18)
    p.add_argument("--return-to-top-compare-y1-ratio", type=float, default=0.82)
    p.add_argument("--return-to-top-debug", action="store_true", default=False)

    p.add_argument("--swipe-x-ratio", type=float, default=0.5)
    p.add_argument("--swipe-start-ratio", type=float, default=0.78)
    p.add_argument("--swipe-end-ratio", type=float, default=0.30)
    p.add_argument("--swipe-duration-ms", type=int, default=360)

    # Page auto-profile. This is the production-facing layer: infer sticky top
    # chrome, bottom-nav presence, and common floating overlays from the captured
    # scroll frames before stitching. Manual crop/mask arguments still override.
    p.add_argument("--auto-profile", dest="auto_profile", action="store_true", default=True)
    p.add_argument("--no-auto-profile", dest="auto_profile", action="store_false")
    p.add_argument("--profile-search", dest="profile_search", action="store_true", default=True)
    p.add_argument("--no-profile-search", dest="profile_search", action="store_false")
    p.add_argument("--profile-search-pairs", type=int, default=3)
    p.add_argument("--profile-search-extra-top-crops", default="", help="Optional comma-separated top-crop candidates, e.g. 280,315,350")
    p.add_argument("--profile-search-min-score", type=float, default=0.52)
    p.add_argument("--profile-search-close-score-margin", type=float, default=0.035)
    p.add_argument("--profile-search-prefer-lower-top-weight", type=float, default=0.12)

    # Crops remove persistent top/bottom chrome. In auto mode these are fallback
    # ratios; detected fixed regions override them unless --top-crop/--bottom-crop
    # is explicitly supplied.
    p.add_argument("--top-crop", type=int, default=None)
    p.add_argument("--bottom-crop", type=int, default=None)
    p.add_argument("--top-crop-ratio", type=float, default=0.13)
    p.add_argument("--bottom-crop-ratio", type=float, default=0.12)

    # Top chrome / sticky header detection.
    p.add_argument("--top-chrome-mode", choices=["auto", "fixed"], default="auto")
    p.add_argument("--top-chrome-min-height-px", type=int, default=42)
    p.add_argument("--top-chrome-fallback-px", type=int, default=56)
    p.add_argument("--top-chrome-extra-pad-px", type=int, default=2)
    p.add_argument("--top-chrome-max-search-ratio", type=float, default=0.34)
    p.add_argument("--top-chrome-max-output-ratio", type=float, default=0.34)
    p.add_argument("--top-chrome-stable-threshold", type=float, default=7.0)
    p.add_argument("--top-chrome-smooth-rows", type=int, default=9)
    p.add_argument("--top-chrome-allowed-unstable-rows", type=int, default=8)

    # Bottom nav detection / output naming.
    # auto: detect from persistent bottom pixels across scrolls.
    # withnav/nonav: force the suffix and bottom-crop behavior.
    p.add_argument("--bottom-nav-mode", choices=["auto", "withnav", "nonav"], default="auto")
    p.add_argument("--bottom-nav-min-height-px", type=int, default=90)
    p.add_argument("--bottom-nav-max-search-ratio", type=float, default=0.30)
    p.add_argument("--bottom-nav-stable-threshold", type=float, default=7.0)
    p.add_argument("--bottom-nav-smooth-rows", type=int, default=9)
    p.add_argument("--bottom-nav-allowed-unstable-rows", type=int, default=8)
    p.add_argument("--nonav-bottom-crop-px", type=int, default=42)
    p.add_argument("--add-chrome-to-final", dest="add_chrome_to_final", action="store_true", default=True)
    p.add_argument("--no-add-chrome-to-final", dest="add_chrome_to_final", action="store_false")

    # Presentation safety zone between stitched content and bottom chrome.
    # Auto mode adds this only when a bottom nav + FAB is present. This keeps the
    # final restored FAB from sitting on top of the last line of scroll content.
    p.add_argument("--bottom-overlay-gutter", choices=["auto", "always", "never"], default="never")
    p.add_argument("--bottom-overlay-gutter-px", type=int, default=None)
    p.add_argument("--bottom-overlay-gutter-radius-scale", type=float, default=2.35)
    p.add_argument("--bottom-overlay-gutter-min-px", type=int, default=72)
    p.add_argument("--bottom-overlay-gutter-max-px", type=int, default=190)

    # Floating action button / overlay handling.
    # auto: detect common blue FABs and configure masks/restore automatically.
    # force: use the ratios supplied below.
    # none: disable FAB masking and final FAB restoration.
    p.add_argument("--fab-mode", choices=["auto", "force", "none"], default="auto")

    # Mask a right-side FAB zone inside the cropped content. These are fallback
    # values or forced values; auto-profile overwrites them when it detects a FAB.
    p.add_argument("--fab-mask", dest="fab_mask", action="store_true", default=True)
    p.add_argument("--no-fab-mask", dest="fab_mask", action="store_false")
    p.add_argument("--fab-x0-ratio", type=float, default=0.72)
    p.add_argument("--fab-y0-ratio", type=float, default=0.50)
    p.add_argument("--fab-y1-ratio", type=float, default=0.96)

    # The matching mask above is intentionally rectangular/aggressive.
    # The output mask is intentionally small/precise to avoid creating large holes.
    p.add_argument("--mask-fab-in-output", dest="mask_fab_in_output", action="store_true", default=True)
    p.add_argument("--no-mask-fab-in-output", dest="mask_fab_in_output", action="store_false")
    p.add_argument("--fab-output-cx-ratio", type=float, default=0.875)
    p.add_argument("--fab-output-cy-ratio", type=float, default=0.905)
    p.add_argument("--fab-output-radius-ratio", type=float, default=0.070)
    p.add_argument("--fab-output-min-radius-px", type=int, default=48)

    # Auto FAB search region and shape constraints. Defaults target common
    # bottom-right floating buttons without touching central content.
    p.add_argument("--fab-auto-search-x0-ratio", type=float, default=0.55)
    p.add_argument("--fab-auto-search-x1-ratio", type=float, default=1.00)
    p.add_argument("--fab-auto-search-y0-ratio", type=float, default=0.45)
    p.add_argument("--fab-auto-search-y1-ratio", type=float, default=0.96)
    p.add_argument("--fab-auto-min-area-px", type=int, default=700)
    p.add_argument("--fab-auto-min-size-px", type=int, default=28)
    p.add_argument("--fab-auto-max-size-px", type=int, default=150)
    p.add_argument("--fab-auto-max-width-ratio", type=float, default=0.24)
    p.add_argument("--fab-auto-max-height-ratio", type=float, default=0.16)
    p.add_argument("--fab-auto-max-area-ratio", type=float, default=0.030)
    p.add_argument("--fab-auto-min-aspect", type=float, default=0.65)
    p.add_argument("--fab-auto-max-aspect", type=float, default=1.55)
    p.add_argument("--fab-auto-min-fill-ratio", type=float, default=0.42)
    p.add_argument("--fab-auto-max-fill-ratio", type=float, default=0.96)
    p.add_argument("--fab-auto-min-center-x-ratio", type=float, default=0.66)
    p.add_argument("--fab-auto-min-center-y-ratio", type=float, default=0.50)
    p.add_argument("--fab-auto-close-px", type=int, default=11)
    p.add_argument("--fab-auto-rect-pad-ratio", type=float, default=0.65)
    p.add_argument("--fab-auto-match-pad-ratio", type=float, default=1.70)
    p.add_argument("--fab-auto-output-radius-scale", type=float, default=1.15)


    # Restore the fixed floating action button as a final presentation overlay.
    # This prevents the FAB from being warped by inpainting/backfill while still
    # keeping it out of the stitch math.
    p.add_argument("--restore-fab-overlay", choices=["auto", "always", "never"], default="auto")
    p.add_argument("--fab-restore-rect-scale-x", type=float, default=2.45)
    p.add_argument("--fab-restore-rect-scale-y", type=float, default=2.65)
    p.add_argument("--fab-restore-blue-hue-low", type=int, default=88)
    p.add_argument("--fab-restore-blue-hue-high", type=int, default=125)
    p.add_argument("--fab-restore-min-saturation", type=int, default=70)
    p.add_argument("--fab-restore-min-value", type=int, default=80)
    p.add_argument("--fab-restore-min-blue-pixels", type=int, default=350)
    p.add_argument("--fab-restore-min-blue-ratio", type=float, default=0.010)
    p.add_argument("--fab-restore-min-blue-component-px", type=int, default=250)
    p.add_argument("--fab-restore-blue-close-px", type=int, default=7)
    p.add_argument("--fab-restore-button-radius-scale", type=float, default=1.02)
    p.add_argument("--fab-restore-edge-feather-px", type=float, default=2.0)
    p.add_argument("--fab-restore-shadow-opacity", type=float, default=0.0)
    p.add_argument("--fab-restore-shadow-radius-scale", type=float, default=1.80)
    p.add_argument("--fab-restore-shadow-offset-x-ratio", type=float, default=0.06)
    p.add_argument("--fab-restore-shadow-offset-y-ratio", type=float, default=0.20)
    p.add_argument("--fab-restore-use-blue-guard", dest="fab_restore_use_blue_guard", action="store_true", default=True)
    p.add_argument("--no-fab-restore-use-blue-guard", dest="fab_restore_use_blue_guard", action="store_false")

    p.add_argument("--mask-border-px", type=int, default=3)

    # Dynamic-pixel detection from two screenshots at the same scroll position.
    p.add_argument("--dynamic-threshold", type=int, default=10)
    p.add_argument("--dynamic-dilate-px", type=int, default=17)
    p.add_argument("--valid-erode-px", type=int, default=0)

    # Scroll / overlap search constraints.
    p.add_argument("--min-scroll-ratio", type=float, default=0.16)
    p.add_argument("--max-scroll-ratio", type=float, default=0.86)
    p.add_argument("--min-scroll-px", type=int, default=None)
    p.add_argument("--max-scroll-px", type=int, default=None)
    p.add_argument("--expected-scroll-px", type=int, default=None)
    p.add_argument("--expected-low", type=float, default=0.55)
    p.add_argument("--expected-high", type=float, default=1.45)
    p.add_argument("--min-overlap-px", type=int, default=240)

    p.add_argument("--coarse-scale", type=float, default=0.25)
    p.add_argument("--fine-window-px", type=int, default=45)
    p.add_argument("--second-peak-sep-px", type=int, default=60)

    # Global alignment scoring weights.
    p.add_argument("--gray-weight", type=float, default=0.55)
    p.add_argument("--edge-weight", type=float, default=0.30)
    p.add_argument("--row-weight", type=float, default=0.15)

    p.add_argument("--min-valid-ratio", type=float, default=0.28)
    p.add_argument("--row-min-valid-ratio", type=float, default=0.35)
    p.add_argument("--min-ncc-pixels", type=int, default=2500)

    # Ignore a small portion of the top/bottom of the overlap ONLY for the 1-D
    # row-profile score. This makes row geometry robust to sticky headers/tabs
    # whose labels change while scrolling.
    p.add_argument("--row-score-edge-trim-ratio", type=float, default=0.10)

    # Global alignment gates. These are deliberately strict. Local-seam rescue
    # can override only these global-similarity failures, not geometry failures.
    p.add_argument("--min-combined-score", type=float, default=0.68)
    p.add_argument("--min-score-margin", type=float, default=0.045)
    p.add_argument("--min-gray-score", type=float, default=0.62)
    p.add_argument("--min-edge-score", type=float, default=0.08)
    p.add_argument("--min-row-score", type=float, default=0.55)
    p.add_argument("--max-method-spread-px", type=int, default=35)

    # Seam search gates.
    p.add_argument("--seam-band-px", type=int, default=48)
    p.add_argument("--seam-margin-px", type=int, default=80)
    p.add_argument("--seam-inner-min-ratio", type=float, default=0.12)
    p.add_argument("--seam-inner-max-ratio", type=float, default=0.88)
    p.add_argument("--seam-center-penalty", type=float, default=0.002)
    p.add_argument("--min-seam-valid-ratio", type=float, default=0.30)
    p.add_argument("--max-seam-error", type=float, default=0.035)

    # Correction for the observed case: dynamic content elsewhere in the overlap
    # can tank the global score while the seam itself is perfect.
    p.add_argument("--allow-seam-rescue", dest="allow_seam_rescue", action="store_true", default=True)
    p.add_argument("--no-seam-rescue", dest="allow_seam_rescue", action="store_false")
    p.add_argument("--seam-local-band-px", type=int, default=220)
    p.add_argument("--min-seam-local-score", type=float, default=0.86)
    p.add_argument("--max-seam-local-mae", type=float, default=0.028)
    p.add_argument("--max-seam-edge-density", type=float, default=0.22)

    # Sticky-changing chrome rescue. This is intentionally stricter than normal
    # seam rescue. It exists for pages where a fixed tab/header changes active
    # label/horizontal position during vertical scrolling.
    p.add_argument(
        "--allow-sticky-chrome-rescue",
        dest="allow_sticky_chrome_rescue",
        action="store_true",
        default=True,
    )
    p.add_argument(
        "--no-sticky-chrome-rescue",
        dest="allow_sticky_chrome_rescue",
        action="store_false",
    )
    p.add_argument("--sticky-rescue-max-method-spread-px", type=int, default=90)
    p.add_argument("--sticky-rescue-min-combined-score", type=float, default=0.52)
    p.add_argument("--sticky-rescue-min-local-score", type=float, default=0.97)
    p.add_argument("--sticky-rescue-max-local-mae", type=float, default=0.008)
    p.add_argument("--sticky-rescue-max-seam-error", type=float, default=0.008)
    p.add_argument("--sticky-rescue-max-edge-density", type=float, default=0.18)
    p.add_argument("--sticky-rescue-min-overlap-px", type=int, default=500)

    # Final composite safety.
    p.add_argument("--trim-final-unsafe", dest="trim_final_unsafe", action="store_true", default=True)
    p.add_argument("--no-trim-final-unsafe", dest="trim_final_unsafe", action="store_false")
    p.add_argument("--final-trim-search-start-ratio", type=float, default=0.45)
    p.add_argument("--final-unsafe-row-invalid-ratio", type=float, default=0.15)

    p.add_argument("--max-allowed-hole-ratio", type=float, default=0.015)
    p.add_argument("--inpaint-remaining-holes", dest="inpaint_remaining_holes", action="store_true", default=True)
    p.add_argument("--no-inpaint-remaining-holes", dest="inpaint_remaining_holes", action="store_false")
    p.add_argument("--inpaint-radius", type=int, default=3)

    p.add_argument("--stop-on-reject", dest="stop_on_reject", action="store_true", default=True)
    p.add_argument("--no-stop-on-reject", dest="stop_on_reject", action="store_false")

    return p.parse_args()


def main():
    args = parse_args()

    out_dir = Path(args.out)
    debug_dir = out_dir / "debug"
    out_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)

    if args.input_dir:
        frames = load_frames_from_dir(args)
    else:
        frames = capture_frames(args, out_dir)

    decisions: list[StitchDecision] = []

    for i in range(len(frames) - 1):
        decision = align_and_score_pair(frames[i], frames[i + 1], args, debug_dir)
        decisions.append(decision)

        if decision.rescued_by_sticky_chrome:
            rescue = " sticky_chrome_rescue=True"
        elif decision.rescued_by_local_seam:
            rescue = " seam_rescue=True"
        else:
            rescue = ""

        print(
            f"[{decision.pair}] "
            f"{'ACCEPT' if decision.accepted else 'REJECT'}{rescue} "
            f"delta={decision.delta} "
            f"score={decision.best_score} "
            f"margin={decision.score_margin} "
            f"seam={decision.seam} "
            f"seam_error={decision.seam_error} "
            f"local_score={decision.seam_local_score} "
            f"local_mae={decision.seam_local_mae}"
        )

        if decision.rescued_by_sticky_chrome and decision.sticky_rescue_reason:
            print(f"Sticky-chrome rescue: {decision.sticky_rescue_reason}")

        if not decision.accepted:
            print("Reasons:")
            for r in decision.reasons:
                print(f"  - {r}")

            if args.stop_on_reject:
                write_report(out_dir / "stitch_report.json", args, frames, decisions, None)
                raise SystemExit(2)

    comp_report = None

    if all(d.accepted for d in decisions):
        final, comp_report = compose_frames(frames, decisions, args)

        # Keep a clean stitched-content-only output for diagnostics.
        content_path = out_dir / "final_long_screenshot_content.png"
        cv2.imwrite(str(content_path), final)

        # Primary output uses the detected/forced suffix: _withnav or _nonav.
        if args.add_chrome_to_final:
            final_display = add_chrome_back(final, frames, args)
        else:
            args._bottom_overlay_gutter_px = 0
            args._bottom_overlay_gutter_reason = "chrome not added"
            final_display = final

        # Restore fixed overlays as a final presentation layer. This is where the
        # FAB belongs: after stitching, after chrome restoration, and exactly once.
        final_display, fab_restore_report = restore_fab_overlay_once(final_display, frames, args, comp_report)

        primary_path = final_output_path(out_dir, args)
        cv2.imwrite(str(primary_path), final_display)

        if comp_report is not None:
            comp_report["primary_output"] = str(primary_path)
            comp_report["content_only_output"] = str(content_path)
            comp_report["output_suffix"] = getattr(args, "_output_suffix", None)
            comp_report["bottom_nav_present"] = bool(getattr(args, "_bottom_nav_present", False))
            comp_report["added_chrome_to_final"] = bool(args.add_chrome_to_final)
            comp_report["bottom_overlay_gutter_px"] = int(getattr(args, "_bottom_overlay_gutter_px", 0))
            comp_report["bottom_overlay_gutter_reason"] = str(getattr(args, "_bottom_overlay_gutter_reason", "unknown"))
            comp_report["fab_overlay_restore"] = fab_restore_report

        print(f"\nSaved: {primary_path}")
        print(f"Saved content-only debug image: {content_path}")

    write_report(out_dir / "stitch_report.json", args, frames, decisions, comp_report)
    print(f"Saved: {out_dir / 'stitch_report.json'}")
    print(f"Debug folder: {debug_dir}")


if __name__ == "__main__":
    main()
