'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, MousePointer2 } from 'lucide-react';
import type { CanvasV2InspectableElement } from '@/lib/canvas-v2/element-inspection';
import type { CanvasV2ManualMutation } from '@/lib/canvas-v2/manual-mutations';

function Property({ label, value, disabled, positive, onCommit }: { label: string; value: number; disabled?: boolean; positive?: boolean; onCommit: (value: number) => void }) {
  const formatted = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(formatted);
  const dirty = useRef(false);
  useEffect(() => {
    if (disabled) dirty.current = false;
    // Remote movement refreshes the accepted value, not a human's unfinished
    // number. Escape still returns to that newest accepted position.
    if (!dirty.current) setDraft(formatted);
  }, [formatted, disabled]);
  const cancelled = useRef(false);
  const commit = () => {
    if(cancelled.current){cancelled.current=false;return;}
    if (!dirty.current) return;
    dirty.current = false;
    const next = Number(draft);
    if (disabled || !draft.trim() || !Number.isFinite(next) || (positive && next <= 0)) { setDraft(formatted); return; }
    if (next !== value) onCommit(next);
  };
  return <label className="flex h-9 items-center gap-3 rounded-lg bg-black/[.035] px-3 text-[11px] dark:bg-white/[.04]">
    <span className="w-4 shrink-0 text-[#968aa3]">{label}</span>
    <input aria-label={`Object ${label}`} inputMode="decimal" value={draft} disabled={disabled} onChange={event => { dirty.current = true; setDraft(event.target.value); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current=true;dirty.current=false;setDraft(formatted); event.currentTarget.blur(); } }} className="min-w-0 w-full bg-transparent text-right tabular-nums outline-none disabled:opacity-40" />
  </label>;
}

/** Board-level properties stay present even without a focused app or selection. */
export function BoardDesignInspector({ selected, onMutation, onOpen, readOnly=false }: { readOnly?:boolean; selected: readonly CanvasV2InspectableElement[]; onMutation: (mutation: CanvasV2ManualMutation) => void; onOpen: () => void }) {
  const element = selected.length === 1 ? selected[0] : undefined;
  return <aside aria-label="Design properties" data-canvas-v2-direct-editing="true" onWheel={event => event.stopPropagation()} className="fixed bottom-4 right-4 top-[90px] z-[1001] flex w-[280px] flex-col rounded-2xl border border-[#e2ddeb] bg-[#fcfbfe]/[.98] p-4 text-[#514a60] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#1d1a24]/[.98] dark:text-[#eee7f5]">
    <h2 className="text-xs font-medium">Design</h2>
    {element ? <div className="mt-6 space-y-5">
      <div><p className="truncate text-xs font-medium">{element.label || element.nodeId}</p><p className="mt-1 text-[11px] text-[#968aa3]">{readOnly?'View only':element.locked ? 'Locked object' : element.kind}</p></div>
      <section><h3 className="mb-3 text-[11px] font-medium">Position and size</h3><div className="grid grid-cols-2 gap-2">
        <Property key={`${element.nodeId}:X`} label="X" value={element.bounds.x} disabled={element.locked||readOnly} onCommit={value => onMutation({ kind: 'move', nodeId: element.nodeId, deltaX: value - element.bounds.x, deltaY: 0 })} />
        <Property key={`${element.nodeId}:Y`} label="Y" value={element.bounds.y} disabled={element.locked||readOnly} onCommit={value => onMutation({ kind: 'move', nodeId: element.nodeId, deltaX: 0, deltaY: value - element.bounds.y })} />
        <Property key={`${element.nodeId}:W`} label="W" value={element.bounds.width} positive disabled={element.locked||readOnly} onCommit={value => onMutation({ kind: 'resize', nodeId: element.nodeId, width: value, height: element.bounds.height })} />
        <Property key={`${element.nodeId}:H`} label="H" value={element.bounds.height} positive disabled={element.locked||readOnly} onCommit={value => onMutation({ kind: 'resize', nodeId: element.nodeId, width: element.bounds.width, height: value })} />
        <Property key={`${element.nodeId}:°`} label="°" value={element.rotation || 0} disabled={element.locked||readOnly} onCommit={value => onMutation({ kind: 'rotate', nodeId: element.nodeId, rotation: value })} />
      </div></section>
      {element.locked ? <button disabled={readOnly} onClick={() => onMutation({ kind: 'lock', nodeId: element.nodeId, locked: false })} className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#8b73f8]/10 text-[11px] text-[#8068b5] dark:text-[#c4b4f7]"><Lock size={12}/>Unlock object</button> : element.textEditable && <button disabled={readOnly} onClick={onOpen} className="h-8 w-full rounded-lg bg-[#8b73f8]/10 text-[11px] text-[#8068b5] dark:text-[#c4b4f7]">Edit text</button>}
    </div> : <div className="m-auto max-w-[190px] text-center"><MousePointer2 size={22} strokeWidth={1.3} className="mx-auto mb-4 text-[#a18adf]"/><p className="text-xs font-medium">{selected.length ? `${selected.length} objects selected` : 'Choose an object'}</p><p className="mt-2 text-[11px] leading-5 text-[#968aa3]">{selected.length ? 'Use the canvas controls to align and style this selection.' : 'Select an object on the canvas or in the layers to edit its properties.'}</p></div>}
  </aside>;
}
