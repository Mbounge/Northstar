'use client';

import { useEffect, useRef, useState } from 'react';

type Trace = Record<string, unknown>;
const text = (value: unknown, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : undefined;
const integer = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const selectors = (value: unknown) => Array.isArray(value) ? value.slice(0, 24).flatMap(item => typeof item === 'string' ? [item.slice(0, 300)] : []) : undefined;
function publicUi() {
  const active = document.activeElement;
  return {
    activeElement: active ? { tag: active.localName, id: active.id || undefined, label: active.getAttribute('aria-label') ?? undefined, role: active.getAttribute('role') ?? undefined, frameTitle: active.localName === 'iframe' ? active.getAttribute('title') : undefined } : null,
    selectedTree: [...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')].slice(0, 24).map(row => ({ selector: row.getAttribute('data-layer-selector'), label: row.getAttribute('aria-label') })),
  };
}

/** Guarded fixture only. This observes public messages and public visible DOM;
 * it neither reads React/controller state nor reaches into iframe documents. */
export function NativeEventTrace() {
  const [records, setRecords] = useState<Trace[]>([]), [enabled, setEnabled] = useState(false), [expanded, setExpanded] = useState(false);
  const recording = useRef(false), serial = useRef(0), started = useRef(0);
  useEffect(() => {
    const append = (entry: Trace) => {
      if (!recording.current) return;
      const now = performance.now();
      const record = { sequence: ++serial.current, utc: new Date().toISOString(), elapsedMs: Math.round((now - started.current) * 100) / 100, ...entry, ...publicUi() };
      setRecords(current => [...current, record].slice(-180));
    };
    const receive = (event: MessageEvent) => {
      if (!recording.current) return;
      const data = object(event.data);
      if (data.protocol !== 'northstar-screen-v1' || !(data.directGesture || data.userInputType || data.directOptions || data.selectionRequestId !== undefined)) return;
      const frame = [...document.querySelectorAll('iframe')].find(candidate => candidate.contentWindow === event.source);
      if (!frame) return;
      const options = object(data.directOptions), appearance = object(options.appearance), nativeText = object(options.text), section = object(options.section);
      const box = frame.getBoundingClientRect(), messageSequence = serial.current + 1;
      append({ kind: 'native-message-received', frameTitle: frame.title, frameVisible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth, directGesture: text(data.directGesture), selector: text(appearance.selector), textSelector: text(nativeText.selector), sectionSelector: text(section.selector), targetTag: text(appearance.tag), directRefresh: data.directRefresh === true, directSelection: data.directSelection === true, selectionMode: text(data.selectionMode), selectionSelectors: selectors(data.selectionSelectors), selectionTargets: Array.isArray(data.selectionTargets) ? data.selectionTargets.slice(0, 24).map(target => text(object(target).selector)) : undefined, userInputType: text(data.userInputType), inputSequence: integer(data.inputSequence), selectionRequestId: integer(data.selectionRequestId), requestId: typeof data.requestId === 'number' ? integer(data.requestId) : text(data.requestId) });
      requestAnimationFrame(() => append({ kind: 'public-ui-after-message', receivedSequence: messageSequence }));
    };
    const hostFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-dev-native-event-trace]')) return;
      if (!target.closest('[data-canvas-v2-direct-editing]') && target.localName !== 'iframe') return;
      append({ kind: 'host-' + event.type, targetTag: target.localName, targetLabel: target.getAttribute('aria-label'), targetId: target.id || undefined, nextTargetTag: event.relatedTarget instanceof Element ? event.relatedTarget.localName : null });
    };
    window.addEventListener('message', receive);
    document.addEventListener('focusin', hostFocus, true); document.addEventListener('focusout', hostFocus, true);
    return () => { window.removeEventListener('message', receive); document.removeEventListener('focusin', hostFocus, true); document.removeEventListener('focusout', hostFocus, true); };
  }, []);
  const clear = () => { serial.current = 0; started.current = performance.now(); setRecords([]); };
  return <aside data-dev-native-event-trace aria-label="Development native event trace" style={{ position: 'fixed', left: 300, top: 8, zIndex: 1201, width: expanded ? 'min(620px, calc(100vw - 324px))' : 280, maxHeight: '52vh', overflow: 'auto', padding: 10, background: '#fff', color: '#21182e', border: '1px solid #bd9565', borderRadius: 10, boxShadow: '0 6px 24px #0002', font: '11px/1.4 system-ui' }}>
    <button type="button" aria-label={expanded ? 'Collapse native event trace' : 'Show native event trace'} onClick={() => setExpanded(value => !value)} style={{ width: '100%', textAlign: 'left', fontWeight: 700 }}>Native event trace · {records.length} · {enabled ? 'recording' : 'paused'} {expanded ? '▾' : '▸'}</button>
    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><button type="button" onClick={() => { if (!enabled) { if (!records.length) started.current = performance.now(); recording.current = true; setEnabled(true); } else { recording.current = false; setEnabled(false); } }}>{enabled ? 'Pause native event trace' : 'Start native event trace'}</button><button type="button" onClick={clear}>Clear native event trace</button></div>
    {expanded && <><p>This records receipt of public native messages, then public focus and selected layer rows on the following animation frame. No private controller state or iframe DOM is read.</p><label>Exact visible event trace<textarea readOnly aria-label="Exact visible native event trace" value={JSON.stringify(records, null, 2)} rows={15} style={{ display: 'block', width: '100%', font: '10px monospace' }} /></label></>}
  </aside>;
}
