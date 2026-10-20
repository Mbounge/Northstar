'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Download } from 'lucide-react';
import { FilmRecorder } from './film-recorder';
import type { FilmCameraController } from '@/lib/canvas-v2/film-camera';
import { CanvasV2Workspace, CanvasV2RenderProfiler, canvasV2RenderProfilingEnabled } from '@/components/canvas-v2/canvas-v2-workspace';
import { SnapshotSaveSchedule } from '@/lib/canvas-v2/sessions/snapshot-save-schedule';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';
import { exportSubagentSnapshot, importSubagentSnapshotBlob, listSavedSubagentSnapshots, loadSavedSubagentSnapshot, readSubagentSnapshotDurable, writeSubagentSnapshotDurableDetailed, type SavedSubagentSnapshotSummary } from './snapshot';

export function CodexSubagentWorkspace({ accountEndpoint = '/canvas-v2-e2e/codex/account', presentation = false, recording = false }: { accountEndpoint?: string; presentation?: boolean; recording?: boolean }) {
  const [renderProfiling] = useState(canvasV2RenderProfilingEnabled);
  const filmCamera = useRef<FilmCameraController | null>(null);
  const registerFilmCamera = useCallback((controller: FilmCameraController | null) => { filmCamera.current = controller; }, []);
  const [owner] = useState(() => crypto.randomUUID().replaceAll('-', ''));
  const [state, setState] = useState<{ ready: boolean; snapshot?: NorthstarSnapshot }>({ ready: false });
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [savedCanvases, setSavedCanvases] = useState<SavedSubagentSnapshotSummary[]>([]);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [snapshotDownload, setSnapshotDownload] = useState<{url: string; name: string; bytes: number}>();
  useEffect(() => () => { if (snapshotDownload) URL.revokeObjectURL(snapshotDownload.url); }, [snapshotDownload]);
  const [saveStatus, setSaveStatus] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; detail?: string }>({ state: 'idle' });
  const saveQueue = useRef<{ pending?: NorthstarSnapshot; running?: Promise<void> }>({});
  const saveSchedule = useRef<SnapshotSaveSchedule | undefined>(undefined);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveQueue.current.pending || saveQueue.current.running) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); saveSchedule.current?.dispose(); saveSchedule.current = undefined; };
  }, []);
  const mounted = useRef(true);
  const hydrated = useRef(false);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    // Fast Refresh reruns effects while preserving the live canvas. Never
    // replace its newer unsaved state with an older durable checkpoint.
    if (hydrated.current) return () => { mounted.current = false; };
    void readSubagentSnapshotDurable(window.sessionStorage).then(snapshot => {
      if (active) { hydrated.current = true; setState({ ready: true, snapshot }); }
    }).catch(() => {
      if (active) { hydrated.current = true; setState({ ready: true }); }
    });
    return () => { active = false; mounted.current = false; };
  }, []);

  const refreshSavedCanvases = useCallback(async () => {
    setSavedCanvases(await listSavedSubagentSnapshots());
  }, []);

  useEffect(() => { void refreshSavedCanvases(); }, [refreshSavedCanvases]);

  const restoreSavedCanvas = useCallback(async (key: string) => {
    setRestoreStatus('Loading saved canvas…');
    const snapshot = await loadSavedSubagentSnapshot(key);
    if (!snapshot) { setRestoreStatus('That saved canvas is unavailable or malformed.'); return; }
    // Drop queued writes from the old mounted workspace before replacing it.
    // The selected snapshot is copied into this tab and future saves use this
    // tab's own durable key, so the source record remains untouched.
    saveSchedule.current?.cancel();
    saveQueue.current.pending = undefined;
    setState({ ready: true, snapshot });
    setWorkspaceKey(current => current + 1);
    setRestoreOpen(false);
    setRestoreStatus(undefined);
  }, []);

  const flushSnapshots = useCallback(async (drain = false) => {
    if (saveQueue.current.running) { await saveQueue.current.running; if (!drain) return; }
    let failed = false;
    saveQueue.current.running = (async () => {
      do {
        if (!saveQueue.current.pending) break;
        const next = saveQueue.current.pending;
        const result = await writeSubagentSnapshotDurableDetailed(window.sessionStorage, next);
        if (!result.ok) {
          failed = true;
          if (mounted.current) setSaveStatus({ state: 'error', detail: `${result.stage}: ${result.message}` });
          break;
        }
        if (saveQueue.current.pending === next) saveQueue.current.pending = undefined;
      } while (drain && saveQueue.current.pending);
      if (!saveQueue.current.pending && mounted.current) setSaveStatus({ state: 'saved' });
    })().finally(() => {
      saveQueue.current.running = undefined;
      // A quiet timer may have fired while the previous large write was still
      // running. Leave the newest snapshot queued, but do not encode it in an
      // uninterrupted worker loop while camera/chat updates keep arriving.
      if (!failed && saveQueue.current.pending) saveSchedule.current?.request();
    });
    return saveQueue.current.running;
  }, []);
  const onSnapshot = useCallback((snapshot: NorthstarSnapshot) => {
    saveQueue.current.pending = snapshot; setSaveStatus(current => current.state === 'saving' ? current : { state: 'saving' });
    saveSchedule.current ??= new SnapshotSaveSchedule(() => flushSnapshots());
    saveSchedule.current.request();
  }, [flushSnapshots]);
  const downloadSnapshot = useCallback(async () => {
    setExporting(true);
    try {
      saveSchedule.current?.cancel();
      await flushSnapshots(true);
      if (saveQueue.current.pending) throw new Error('The latest canvas could not be saved; resolve the save error before downloading.');
      const blob = await exportSubagentSnapshot(window.sessionStorage);
      setSnapshotDownload({url: URL.createObjectURL(blob), name: `northstar-test-canvas-${new Date().toISOString().replaceAll(':', '-')}.json`, bytes: blob.size});
    } catch (error) {
      setSaveStatus({ state: 'error', detail: error instanceof Error ? error.message : String(error) });
    } finally { setExporting(false); }
  }, [flushSnapshots]);

  if (!state.ready) return <div role="status" className="flex min-h-screen items-center justify-center bg-[#11111b] text-white/60">Opening test canvas…</div>;
  return <>
    {!presentation && <>
    <div data-testid="codex-subagent-save-status" role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-11 z-[1000] max-w-[min(90vw,720px)] -translate-x-1/2 rounded bg-[#222] px-2 py-1 text-[11px] text-white/80">Snapshot {saveStatus.state}{saveStatus.detail ? ` · ${saveStatus.detail}` : ''}</div>
    <button type="button" data-testid="codex-subagent-restore" aria-label="Restore saved canvas" title="Restore saved canvas" onClick={() => { setRestoreOpen(open => !open); void refreshSavedCanvases(); }} className="fixed bottom-3 left-3 z-[1001] grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-[#222] text-white/60 shadow-lg hover:bg-[#333]"><History size={13}/></button>
    <button type="button" aria-label="Download test snapshot" title="Download test snapshot" disabled={exporting} onClick={() => void downloadSnapshot()} className="fixed bottom-3 left-12 z-[1001] grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-[#222] text-white/60 shadow-lg hover:bg-[#333] disabled:opacity-50"><Download size={13}/></button>
    {snapshotDownload && <a href={snapshotDownload.url} download={snapshotDownload.name} className="fixed bottom-12 left-3 z-[1001] rounded bg-[#222] px-3 py-1.5 text-[11px] text-white shadow-lg hover:bg-[#333]">Save prepared snapshot · {(snapshotDownload.bytes / 1024 / 1024).toFixed(1)} MB</a>}
    {restoreOpen && <div role="dialog" aria-label="Saved canvases" className="fixed bottom-12 left-3 z-[1001] w-[min(92vw,440px)] rounded-xl border border-white/15 bg-[#17171f] p-3 text-white shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-3"><strong className="text-sm">Saved canvases</strong><button type="button" aria-label="Close saved canvases" onClick={() => setRestoreOpen(false)} className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10">Close</button></div>
      {restoreStatus && <p role="status" className="mb-2 text-xs text-amber-200">{restoreStatus}</p>}
      <label className="mb-2 block rounded border border-white/15 p-2 text-xs">Import saved canvas<input aria-label="Import saved canvas" type="file" accept="application/json,.json" className="mt-1 block w-full" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        try {
          const snapshot = await importSubagentSnapshotBlob(file);
          saveSchedule.current?.cancel();
          await saveQueue.current.running;
          saveQueue.current.pending = undefined;
          setState({ ready: true, snapshot });
          setWorkspaceKey(current => current + 1);
          setRestoreOpen(false);
          setRestoreStatus(undefined);
        } catch (error) { setRestoreStatus(error instanceof Error ? error.message : 'This canvas file could not be imported.'); }
      }} /></label>
      {!savedCanvases.length ? <p className="text-xs text-white/60">No durable canvases are available in this browser.</p> : <div className="grid max-h-[min(60vh,420px)] gap-1 overflow-auto">{savedCanvases.map(item => <button key={item.key} type="button" onClick={() => void restoreSavedCanvas(item.key)} className="rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/10"><span className="block truncate text-xs font-semibold">{item.title}</span><span className="block text-[10px] text-white/60">{item.appCount} app{item.appCount === 1 ? '' : 's'} · {item.objectCount} object{item.objectCount === 1 ? '' : 's'} · {item.savedAt ? new Date(item.savedAt).toLocaleString() : 'unknown time'}</span></button>)}</div>}
    </div>}
    </>}
    {presentation && saveStatus.state === 'error' && <div role="alert" className="fixed bottom-5 right-5 z-[1001] max-w-md rounded-lg bg-[#602929] p-3 text-sm text-white">Canvas changes are not saved. {saveStatus.detail}<button type="button" className="ml-3 underline" onClick={() => void flushSnapshots(true)}>Retry save</button></div>}
    <CanvasV2RenderProfiler id="Workspace" enabled={renderProfiling}><CanvasV2Workspace registerFilmCamera={recording ? registerFilmCamera : undefined} key={workspaceKey} initialSnapshot={state.snapshot} onSnapshot={onSnapshot}
      accountEndpoint={accountEndpoint} agentEndpoint={`/canvas-v2-e2e/codex-subagent/agent?owner=${owner}`}
      designEndpoint="/canvas-v2-e2e/design" routerEndpoint="/canvas-v2-e2e/route" researchEndpoint={accountEndpoint === '/api/canvas-v2/account' ? '/api/canvas-v2/research' : '/canvas-v2-e2e/research'} /></CanvasV2RenderProfiler>
    {recording && <FilmRecorder camera={filmCamera} />}
  </>;
}
