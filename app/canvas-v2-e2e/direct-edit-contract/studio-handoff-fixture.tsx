'use client';

import { useRef, useState } from 'react';
import { ScreenDesignStudio } from '@/components/canvas-v2/screen-design-studio';
import { applyScreenDesignOperation, type ScreenDesignOperation } from '@/lib/canvas-v2/screen-design-edit';
import { parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { flushScreenDirectEdits, type ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';
import type { CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';

const baseline: CanvasV2InteractiveScreen = { version: 1, title: 'Studio handoff fixture', width: 640, height: 480, html: '<main><h1 id="heading" style="letter-spacing:0px;line-height:1.2">Human studio source</h1><p id="other">Keep sibling</p></main>', css: '', javascript: '', referenceAssetIds: [] };

/** Real production Studio controls with a deliberately delayed source commit.
 * No model, account, persistence or frozen workspace is involved. */
export function StudioHandoffFixture() {
  const [open, setOpen] = useState(false), [screen, setScreen] = useState(baseline), [writes, setWrites] = useState(0), [reads, setReads] = useState(0), [pending, setPending] = useState(false), [reading, setReading] = useState(false), [failure, setFailure] = useState(''), [readHtml, setReadHtml] = useState('');
  const source = useRef(baseline), holdNext = useRef(true), failNext = useRef(false), release = useRef<(() => void) | undefined>(undefined), operations = useRef<ScreenDesignOperation[]>([]), depth = useRef(0);
  const target = (): CanvasV2ScreenFeedbackTarget => {
    const heading = new DOMParser().parseFromString(source.current.html, 'text/html').querySelector<HTMLElement>('#heading')!;
    return { nodeId: 'studio-handoff', title: baseline.title, selector: '#heading', tag: 'h1', label: 'Human heading', text: heading.textContent ?? '', rect: { x: 0, y: 0, width: 400, height: 60 }, styles: Object.fromEntries([...heading.style].map(key => [key, heading.style.getPropertyValue(key)])) };
  };
  const commit = async (operation: ScreenDesignOperation, ownerId?: string): Promise<ScreenDirectResult> => {
    if (++depth.current > 8) { depth.current--; return { ok: false, error: 'Recursive Studio flush detected.' }; }
    try {
      await flushScreenDirectEdits(window, ownerId);
      if (holdNext.current) { holdNext.current = false; setPending(true); await new Promise<void>(resolve => { release.current = resolve; }); setPending(false); }
      if (failNext.current) { failNext.current = false; return { ok: false, error: 'Studio fixture save failed.' }; }
      const result = applyScreenDesignOperation(source.current, [target()], operation, new DOMParser());
      source.current = parseCanvasV2Screen(result.encoded); operations.current.push(operation); setScreen(source.current); setWrites(count => count + 1);
      return { ok: true, encoded: result.encoded, selectors: result.selectors };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    finally { depth.current--; }
  };
  const handoff = async () => {
    setReading(true); setFailure('');
    try { await flushScreenDirectEdits(); setReadHtml(source.current.html); setReads(count => count + 1); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setReading(false); }
  };
  return <section aria-label="Studio focused draft handoff fixture" style={{ marginTop: 32, maxWidth: 560, padding: 20, border: '1px solid #a99acb', borderRadius: 16 }}>
    <h2>Studio focused draft handoff</h2>
    <p>Open Typography details. Commit Tracking and hold its save, edit Leading, then flush while Leading still has focus. Release the first save. The AI read must contain both edits.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" onClick={() => setOpen(value => !value)}>{open ? 'Unmount Studio handoff editor' : 'Open Studio handoff editor'}</button>
      <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => void handoff()}>Flush Studio handoff without blur</button>
      <button type="button" onClick={() => { release.current?.(); release.current = undefined; }}>Release Studio source save</button>
      <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => { failNext.current = true; }}>Fail next Studio save</button>
    </div>
    <p role="status">{pending ? 'Studio source save held' : reading ? 'Waiting for Studio handoff' : failure || (reads ? 'AI read committed Studio source' : 'Ready')}</p>
    <pre data-testid="studio-handoff-results" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ writes, reads, pending, reading, failure, operations: operations.current, html: screen.html, readHtml }, null, 2)}</pre>
    {open && <ScreenDesignStudio screen={screen} targets={[target()]} onOperation={commit} onExport={async () => { await flushScreenDirectEdits(); }} onCompare={() => undefined} />}
  </section>;
}
