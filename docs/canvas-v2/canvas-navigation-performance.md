# Canvas navigation performance

The navigation fixes apply to every canvas app and reference media object. They do not change authored app sources, object geometry, visible animation quality, or product clocks.

## Input and workload changes

- Pan and held Space suppress pointer input on all native descendants, including iframes whose inline pointer style previously intercepted drags. Select restores normal app input.
- Runtime checkpoints avoid rebuilding retained DOM state when product state and tracked form, focus, and scroll state are unchanged. Trusted input snapshots are batched while the immediate human-input signal remains intact.
- Host-owned Three rendering skips offscreen default-framebuffer draws. Authored animation callbacks and render-target passes continue; returning to the viewport or a tool capture forces a current draw.
- Reference media playback notifications update only the selected toolbar button. They no longer set workspace React state. The workspace also ignores stable-prop parent save-status renders through normal React memoization.
- Each reference media object retains a stable viewport observer. Native videos pause immediately outside the nearby margin and release their loaded resource after a 1.5-second grace period. Exact clip time and human pause preference survive release and return. Initial source loading stays lazy; existing large-board culling remains bounded.
- Media metadata parsing is cached by source. GIF poster decoding runs once per source and releases its temporary decoder; only nearby playing GIFs retain the animated image.

## Verified development-browser comparison

The comparator used four real held vertical drags of 400 pixels each over the reference library. The initial camera, intermediate object rectangles, and final return rectangles matched between runs. Only the isolated library patch was reversed for the baseline; the Pan fix and runtime changes were present in both runs.

| Main-document metric | Baseline | Optimized |
| --- | ---: | ---: |
| Sample wall time | 5.705 s | 4.768 s |
| TaskDuration | 3.116771 s | 1.884284 s |
| ScriptDuration | 2.192419 s | 0.930271 s |
| RecalcStyleDuration | 0.034106 s | 0.040483 s |
| LayoutDuration | 0.004198 s | 0.005309 s |

Normalizing each work duration by its sample wall time gives approximately 27.7% less task work and 49.2% less script work. Style and layout work rose slightly. This is one development-browser pair, not an FPS, GPU, or production-performance result. Evidence is stored in `/Users/mbounge/Documents/Codex/2026-09-05/do-x20/outputs/northstar-harness/2026-10-12-motion-and-teaser/proofs/canvas-performance/library-{baseline,optimized,comparison}-valid.json`.

## Regression checks and diagnostics

Focused tests cover unselected playback notification isolation, decoder release, source reattachment races, retained playback time and human pause, runtime checkpoint dirtiness, and continued offscreen authored clocks. TypeScript and scoped ESLint checks pass. Browser verification confirmed Pan/Space movement, Select interaction, offscreen video reset, visible autoplay, and exact restoration of a manually paused clip.

Public DOM diagnostics include `data-canvas-v2-render-count`, `data-canvas-v2-camera-preview-frame`, `data-canvas-v2-media-nearby`, and `data-canvas-v2-media-observed-bounds`. Held camera previews should move object rectangles and advance the preview counter without workspace renders from unselected media. A gesture-end viewport commit legitimately renders; development Strict Mode can double that count.

After source removal plus `load()`, browser `currentSrc` can retain a stale URL ([WHATWG issue 10410](https://github.com/whatwg/html/issues/10410)). Inspect paused state, absent source, `readyState` zero, and empty buffers instead of treating this string as a decoder-liveness signal. Chromium's [load implementation](https://chromium.googlesource.com/chromium/src/third_party/+/master/blink/renderer/core/html/media/html_media_element.cc) shuts down and deletes the previous media player.

Remaining work should start from another measured production trace. Authored app logic deliberately continues offscreen to preserve application clocks; suspending it globally would change product behavior.

## Native tile reuse at camera commit

Native nodes and child chunks now compare actual mounted/culled presence when
camera bounds change. An unchanged tile staying in the same presence state
reuses its DOM rather than rebuilding styles and descendants. Scene roots still
propagate new bounds. Crossing the overscan boundary, moving a root, source
changes and selected-object protection remain observable. Live screen/model
runtimes keep their existing mounting rules and state.

A matched-start Chrome production comparison on 2026-10-14 used the existing
240-image composition fixture and four synthesized wheel pans in each build.
JavaScript time was 422.6 ms before and 136.3 ms after; task time was 743.5 ms
before and 522.3 ms after. Function calls over 15 ms fell from 12 to 3, with the
longest falling from 45.3 ms to 28.3 ms. Gesture windows were approximately
4.05 and 3.82 seconds. This is one local comparison with other applications
open, not a stable FPS, physical input latency or mixed live-app board claim.
Actual post-pan selection was also exercised. Raw traces, metrics and the
comparison are archived under the workspace's
`outputs/northstar-harness/2026-10-14-core-hardening` directory.

## Populated live demo board, 2026-10-15

The next pass used the actual main demo canvas: 40 live previews, reference
rails and generated source photographs, with a 125,678,593-byte saved snapshot.
No authored preview source was changed.

- Root leaves now reuse their native subtree when only camera bounds change.
  Roots with children still propagate bounds for screenshot culling. Source,
  geometry and newly added children remain visible to reconciliation.
- The fixed-size device wrapper uses `content-visibility: auto` to reduce
  offscreen browser painting while keeping iframe identity and application
  state. It does not suspend authored animation callbacks.
- The local demo autosave passes its existing 128 MB storage limit to the
  serialization worker. Previously the worker's 100 MB default rejected this
  board and triggered a second JSON encode on the UI thread. Production's
  default 100 MB limit is unchanged. Size rejection is now final, while actual
  worker failures retain the existing fallback.
- Durable demo saves store the materialized Blob directly in IndexedDB,
  avoiding a large text conversion and string copy for each checkpoint. Read,
  restore and export accept both the new Blob record and older records.
- Startup camera centring runs only for fresh canvases. Restoring a saved board
  preserves its camera rather than recentring or fitting reference flows.

One valid pre-fix sample and two post-fix samples used identical starting
cameras and the same four synthesized wheel pans, returning to the starting
camera each time. Main-document TaskDuration fell from 1,859 ms over a 3,587 ms
sample to 320 and 410 ms over 2,571 and 2,610 ms samples. These are local
development measurements with other applications open, not stable FPS or
physical input latency claims. The main-thread save handler's 486 ms trace
event disappeared, although initial snapshot structured cloning still produced
roughly 86–93 ms events. Heavy authored simulation loops remain a separate cost.

Two alternating containment comparisons reduced aggregate trace paint time
from 33.0/32.6 ms to 22.6/22.9 ms. Layout and style work rose slightly; total
task time varied with save timing. This supports retaining containment as a
painting optimization, not claiming that it pauses all offscreen computation.

Verification: 88 focused tests, TypeScript and scoped ESLint passed. Browser
checks covered long pan travel, Fit all, selection and focus from overview,
pause-state retention offscreen and working controls on return. A real refresh
restored all 40 exact encoded sources and the saved camera position. Evidence
and raw traces are in the parent workspace's
`outputs/northstar-harness/2026-10-15-populated-canvas-performance` directory.
