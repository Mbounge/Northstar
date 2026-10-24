'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { canvasV2SpacingMeasurements, formatCanvasV2DesignPixels, type CanvasV2ObjectBounds } from '@/lib/canvas-v2/object-interaction';

/** Read-only chrome: holding Option/Alt never starts an edit or creates history. */
export function CanvasV2DesignMeasurements({ selected, hovered, scale, hostRef }: {
  selected: CanvasV2ObjectBounds;
  hovered?: CanvasV2ObjectBounds;
  scale: number;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const [alt, setAlt] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let lastAlt = false, lastDragging = false;
    const update = (nextAlt: boolean, nextDragging = lastDragging) => {
      // Ordinary pointer movement should not enqueue React state updates.
      if (nextAlt !== lastAlt) { lastAlt = nextAlt; setAlt(nextAlt); }
      if (nextDragging !== lastDragging) { lastDragging = nextDragging; setDragging(nextDragging); }
    };
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape') { update(false); return; }
      if (event.type === 'keyup') { update(event.altKey); return; }
      if (target?.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) return;
      update(event.altKey);
    };
    const pointer = (event: PointerEvent) => {
      // Covers entering the canvas with Option already held or a swallowed keyup.
      update(event.altKey, event.buttons !== 0);
    };
    const reset = () => update(false, false);
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('pointerdown', pointer, { passive: true });
    window.addEventListener('pointerup', pointer, { passive: true });
    window.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('pointerdown', pointer);
      window.removeEventListener('pointerup', pointer);
      window.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  if (!alt || dragging || !hovered || !Number.isFinite(scale) || scale <= 0) return null;
  const measurements = canvasV2SpacingMeasurements(selected, hovered);
  return <div ref={hostRef} data-testid="canvas-v2-spacing-measurements" aria-hidden className="pointer-events-none absolute inset-0 z-40 select-none" style={{ '--canvas-v2-measure-inverse-scale': 1 / scale } as CSSProperties}>
    {measurements.map((item, index) => {
      const x = (item.from.x + item.to.x) / 2, y = (item.from.y + item.to.y) / 2;
      return <div key={index}>
        <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }} width={1} height={1}>
          <path d={`M${item.from.x} ${item.from.y}L${item.to.x} ${item.to.y}`} stroke="#ef4fb8" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
          {[item.from, item.to].map((point, end) => <path key={end} d={item.axis === 'x'
            ? `M${point.x} ${point.y - 3 / scale}v${6 / scale}`
            : `M${point.x - 3 / scale} ${point.y}h${6 / scale}`} stroke="#ef4fb8" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <span data-measurement-kind={item.kind} data-measurement-axis={item.axis} data-measurement-pixels={item.value}
          className="absolute whitespace-nowrap rounded-[3px] border border-[#ef4fb8]/25 bg-[#fff7fc]/95 px-1 py-px font-mono text-[9px] leading-3 text-[#96215e] dark:border-[#ef4fb8]/20 dark:bg-[#302332]/95 dark:text-[#f0b5d7]"
          style={{ left: x, top: y, transform: 'translate(-50%,-50%) scale(var(--canvas-v2-measure-inverse-scale))' }}>
          {formatCanvasV2DesignPixels(item.value)} px{item.kind === 'offset' ? ' offset' : ''}
        </span>
      </div>;
    })}
  </div>;
}
