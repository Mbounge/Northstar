"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from "@/lib/utils";

// ─── DYNAMIC APP TUNING ──────────────────────────────────────────────────────
const APP_TUNING = [
  {
    matchers: ["graet"],
    header: 11.42,
    footer: 10.5,
  },
  {
    matchers: ["nhl", "eliteprospects", "elite"],
    header: 12.0,
    footer: 10.5, 
  }
];

function getTuningForImage(url: string) {
  const lowerUrl = url.toLowerCase();
  for (const config of APP_TUNING) {
    if (config.matchers.some(m => lowerUrl.includes(m))) {
      return { header: config.header, footer: config.footer };
    }
  }
  return { header: 11.5, footer: 10.5 }; 
}
// ─────────────────────────────────────────────────────────────────────────────

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
  headerHeightPct, 
  footerHeightPct,   
}: PanoramicMockupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const tuning = getTuningForImage(imgUrl);
  const activeHeaderPct = headerHeightPct ?? tuning.header;
  const activeFooterPct = footerHeightPct ?? tuning.footer;

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

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalRatio(img.naturalHeight / img.naturalWidth);
    }
  }, []);

  const { w: containerW, h: containerH } = dims;

  const topPx    = containerH * (activeHeaderPct / 100);
  const bottomPx = containerH * (activeFooterPct / 100);

  const renderedImgH = naturalRatio !== null && containerW > 0
    ? containerW * naturalRatio
    : null;

  const ready = containerH > 0 && containerW > 0 && renderedImgH !== null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-white transition-all duration-300"
      style={{
        // CHANGED: Removed borders, border-radius, and shadows. 
        // This component will now perfectly fill its parent's shape (0.8rem or 1.2rem).
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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

      {ready && (
        <>
          {/* ── Layer 1: STICKY TOP ── */}
          <div style={{
            height: topPx,
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 20,
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

          {/* ── Layer 2: SCROLLABLE MIDDLE ── */}
          <div style={{
            flex: 1,
            overflowY: 'scroll',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
          }}>
            <div style={{
              height: Math.max(0, renderedImgH! - topPx - bottomPx),
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

          {/* ── Layer 3: STICKY BOTTOM ── */}
          {hasBottomNav && (
            <div style={{
              height: bottomPx,
              flexShrink: 0,
              overflow: 'hidden',
              position: 'relative',
              zIndex: 20,
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