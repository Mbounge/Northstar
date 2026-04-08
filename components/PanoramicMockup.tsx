"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from "@/lib/utils";

interface PanoramicMockupProps {
  imgUrl: string;
  alt: string;
  isActive?: boolean;
  hasBottomNav?: boolean;
  headerHeightPct?: number;
  footerHeightPct?: number;
}

export function PanoramicMockup({
  imgUrl,
  alt,
  isActive = true,
  hasBottomNav = true,
  headerHeightPct = 14,
  footerHeightPct = 10,
}: PanoramicMockupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  // Measure container — grab immediately AND watch for resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setDims({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => {
      setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Use the actual rendered <img> onLoad to get natural dimensions.
  // This is the most reliable method — same request the browser already made,
  // no CORS/auth issues that affect new Image().
  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalRatio(img.naturalHeight / img.naturalWidth);
    }
  }, []);

  const { w: containerW, h: containerH } = dims;

  const topPx    = containerH * (headerHeightPct / 100);
  const bottomPx = containerH * (footerHeightPct / 100);

  // How tall will the panoramic image be when rendered at full container width?
  const renderedImgH = naturalRatio !== null && containerW > 0
    ? containerW * naturalRatio
    : null;

  const ready = containerH > 0 && containerW > 0 && renderedImgH !== null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full bg-white transition-all duration-300",
        isActive
          ? "shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]"
          : "shadow-md"
      )}
      style={{
        borderWidth: '0.3px',
        borderColor: '#818A98',
        borderStyle: 'solid',
        borderRadius: isActive ? '1.8rem' : '1.1rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── PHASE 1: naturalRatio not yet known ─────────────────────────
          Render the full image as a simple scroller. This:
          - Puts the real <img src> in the DOM immediately (no blank screen)
          - Fires onLoad so we get naturalRatio
          - Shows the user something while we wait
          Once ready=true, this unmounts and the 3-layer layout takes over. */}
      {!ready && (
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
          <img
            src={imgUrl}
            alt={alt}
            onLoad={handleImgLoad}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>
      )}

      {/* ── PHASE 2: 3-layer sticky layout ──────────────────────────────
          Only renders once we know container size AND image natural ratio. */}
      {ready && (
        <>
          {/* ── Layer 1: STICKY TOP (status bar + app header) ──
              Fixed height = topPx. overflow:hidden clips to just this strip.
              The img is full-width, top-anchored, and full renderedImgH tall,
              so we see exactly the top `topPx` pixels of the panoramic. */}
          <div style={{
            height: topPx,
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <img
              src={imgUrl}
              alt=""
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: renderedImgH!,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          </div>

          {/* ── Layer 2: SCROLLABLE MIDDLE (content only) ──
              flex:1 fills remaining vertical space.
              The clipping wrapper div is sized to exactly the content region
              (renderedImgH minus the two sticky strips), so the status bar
              and nav tabs are NEVER reachable by scrolling.
              The img is pulled up by -topPx so scrolling starts at real content. */}
          <div style={{
            flex: 1,
            overflowY: 'scroll',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
          }}>
            <div style={{
              height: renderedImgH! - topPx - bottomPx,
              overflow: 'hidden',
              position: 'relative',
            }}>
              <img
                src={imgUrl}
                alt={alt}
                style={{
                  display: 'block',
                  width: '100%',
                  height: renderedImgH!,
                  marginTop: -topPx,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>
          </div>

          {/* ── Layer 3: STICKY BOTTOM (nav tabs) ──
              Same principle as the top strip but bottom-anchored.
              The img is full renderedImgH tall with bottom:0, so overflow:hidden
              clips to reveal exactly the last `bottomPx` pixels. */}
          {hasBottomNav && (
            <div style={{
              height: bottomPx,
              flexShrink: 0,
              overflow: 'hidden',
              position: 'relative',
            }}>
              <img
                src={imgUrl}
                alt=""
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: '100%',
                  height: renderedImgH!,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}