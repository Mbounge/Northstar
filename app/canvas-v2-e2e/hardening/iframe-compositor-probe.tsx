'use client';

import { useEffect, useRef, useState } from 'react';

type SavedStyle = { value: string; priority: string };
type Entry = { frame: HTMLIFrameElement; owner: string | null; original: Record<string, SavedStyle>; applied: Record<string, SavedStyle> };
const properties = ['transform', 'backface-visibility', 'will-change'] as const;

/** Public-DOM-only, reversible experiment. This never reads a frame document. */
export function IframeCompositorProbe() {
  const entries = useRef<Entry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState('No experiment applied.');

  const restore = () => {
    const restored = entries.current.map(entry => {
      const conflicts: string[] = [];
      for (const property of properties) {
        if (entry.frame.style.getPropertyValue(property) !== entry.applied[property].value || entry.frame.style.getPropertyPriority(property) !== entry.applied[property].priority) {
          conflicts.push(property);
          continue;
        }
        const original = entry.original[property];
        if (original.value) entry.frame.style.setProperty(property, original.value, original.priority);
        else entry.frame.style.removeProperty(property);
      }
      return { owner: entry.owner, title: entry.frame.title, connected: entry.frame.isConnected, conflicts, exact: properties.every(property => entry.frame.style.getPropertyValue(property) === entry.original[property].value && entry.frame.style.getPropertyPriority(property) === entry.original[property].priority) };
    });
    entries.current = [];
    return restored;
  };

  useEffect(() => {
    setEnabled(process.env.NODE_ENV !== 'production' && location.pathname.startsWith('/canvas-v2-e2e/') && new URLSearchParams(location.search).get('hardening') === '1');
    return () => { restore(); };
  }, []);

  if (!enabled) return null;
  return <aside data-hardening-observer aria-label="Development iframe compositing experiment" style={{ position: 'fixed', left: 1200, top: 54, zIndex: 1202, width: open ? 'min(550px,calc(100vw - 24px))' : 280, maxWidth: 'calc(100vw - 24px)', maxHeight: '70vh', overflow: 'auto', background: '#fff', color: '#242035', border: '1px solid #aaa0c4', borderRadius: 10, padding: 10, font: '11px/1.4 system-ui', transform: open ? 'translateX(min(0px,calc(100vw - 1774px)))' : undefined }}>
    <button onClick={() => setOpen(value => !value)}>{open ? 'Collapse iframe compositing probe' : 'Show iframe compositing probe'}</button>
    {open && <><p>DEV only. Current public iframe styles; no frame document or app state is read.</p><button onClick={() => {
      restore();
      const frames = [...document.querySelectorAll<HTMLIFrameElement>('[data-northstar-device-frame] iframe')].filter(frame => frame.title !== 'Private interactive screen capture' && !frame.closest('[data-testid="canvas-v2-committed-observation-surface"]')).slice(0, 128);
      entries.current = frames.map(frame => {
        const original = Object.fromEntries(properties.map(property => [property, { value: frame.style.getPropertyValue(property), priority: frame.style.getPropertyPriority(property) }]));
        const transform = original.transform.value;
        frame.style.setProperty('transform', `${transform && transform !== 'none' ? transform + ' ' : ''}translateZ(0)`, original.transform.priority);
        frame.style.setProperty('backface-visibility', 'hidden');
        frame.style.setProperty('will-change', 'transform');
        return { frame, owner: frame.closest('[data-canvas-v2-node-id]')?.getAttribute('data-canvas-v2-node-id') ?? null, original, applied: Object.fromEntries(properties.map(property => [property, { value: frame.style.getPropertyValue(property), priority: frame.style.getPropertyPriority(property) }])) };
      });
      setReceipt(JSON.stringify({ at: new Date().toISOString(), applied: entries.current.length, frames: entries.current.map(entry => ({ owner: entry.owner, title: entry.frame.title, original: entry.original, applied: entry.applied })) }, null, 2));
    }}>Apply iframe compositing hint</button><button onClick={() => setReceipt(JSON.stringify({ at: new Date().toISOString(), restored: restore() }, null, 2))}>Restore iframe compositing styles</button><textarea readOnly aria-label="Exact public iframe compositing receipt" value={receipt} style={{ width: '100%', height: 260, font: '10px monospace' }}/></>}
  </aside>;
}
