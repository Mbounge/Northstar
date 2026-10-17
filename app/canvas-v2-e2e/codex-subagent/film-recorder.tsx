'use client';

import type { FilmCameraController, FilmCameraPlan } from '@/lib/canvas-v2/film-camera';
import { useEffect, useRef, useState, type RefObject } from 'react';

/** Local E2E filming aid. Records the chosen real browser surface, with no UI reconstruction. */
export function FilmRecorder({ camera }: { camera: RefObject<FilmCameraController | null> }) {
  const [focusView, setFocusView] = useState(false);
  const [planText, setPlanText] = useState('');
  const plan = useRef<FilmCameraPlan | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string; settings: MediaTrackSettings }>();
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(15);
  useEffect(() => {
    const stop = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyR') {
        event.preventDefault();
        if (recorder.current?.state === 'recording') recorder.current.stop();
      }
    };
    window.addEventListener('keydown', stop, true);
    return () => { window.removeEventListener('keydown', stop, true); stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  async function start() {
    setError('');
    try {
      const options = {
        video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 }, displaySurface: 'browser' },
        audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions;
      const media = stream.current?.getVideoTracks()[0]?.readyState === 'live'
        ? stream.current : await navigator.mediaDevices.getDisplayMedia(options);
      stream.current = media;
      const track = media.getVideoTracks()[0];
      // Let the browser sharing bar settle before the encoder fixes its dimensions.
      await new Promise(resolve => window.setTimeout(resolve, 2500));
      const settings = track.getSettings();
      const mimeType = ['video/mp4;codecs=avc1.42002a', 'video/webm;codecs=vp8'].find(t => MediaRecorder.isTypeSupported(t));
      const recording = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 20_000_000 });
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = () => {
        camera.current?.stop();
        const blob = new Blob(chunks, { type: recording.mimeType });
        setResult({ url: URL.createObjectURL(blob), name: `northstar-native-${Date.now()}.${recording.mimeType.includes('mp4') ? 'mp4' : 'webm'}`, settings });
        setRecording(false);
        // Keep this explicitly shared tab available for the next take in this filming session.
      };
      track.onended = () => { if (recording.state === 'recording') recording.stop(); };
      setRecording(true);
      recording.start(1000);
      window.setTimeout(() => { if (recording.state === 'recording' && plan.current) camera.current?.play(plan.current); }, 600);
      window.setTimeout(() => { if (recording.state === 'recording') recording.stop(); }, seconds * 1000);
    } catch (e) { setError(String(e)); setRecording(false); }
  }
  if (recording) return focusView ? <style>{'[aria-label="Canvas tools"],[aria-label="Canvas navigation"]{visibility:hidden!important}'}</style> : null;
  return <aside style={{ position: 'fixed', right: 16, top: 110, width: 280, maxHeight: '70vh', overflow: 'auto', zIndex: 10000, padding: 12, background: '#242334', color: 'white', borderRadius: 12 }}>
    <label style={{display:'block',fontSize:12}}><input aria-label="Focus artwork during recording" type="checkbox" checked={focusView} onChange={event=>setFocusView(event.target.checked)} />Focus artwork during recording</label>
    <label style={{ display: 'block' }}>Camera plan<textarea aria-label="Camera plan" value={planText} onChange={e => setPlanText(e.target.value)} style={{ display: 'block', width: 240, height: 60, color: 'white', background: '#111' }} /></label>
    <button onClick={() => { try { const parsed = JSON.parse(planText) as FilmCameraPlan; if (!parsed.start || !Array.isArray(parsed.stops)) throw new Error('Invalid plan'); camera.current?.stage(parsed.start); plan.current = parsed; setError(`Staged: ${parsed.name}`); } catch (e) { setError(String(e)); } }}>Stage camera plan</button>
    <button onClick={() => { camera.current?.stop(); plan.current = null; }}>Stop camera plan</button>
    <button onClick={() => void start()}>Record native canvas</button>
    <button onClick={() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setError('Tab sharing stopped'); }}>Stop tab sharing</button>
    <label style={{ display: 'block', fontSize: 12 }}>Seconds <input aria-label="Recording seconds" type="number" min="5" max="180" value={seconds} onChange={e => setSeconds(Math.max(5, Math.min(180, Number(e.target.value) || 15)))} style={{ width: 60, color: '#fff', background: '#333' }} /></label>
    <p style={{ fontSize: 12 }}>Stop: Option + Shift + R</p>
    {result && <><a href={result.url} download={result.name}>Save native recording</a><button onClick={async () => {
      try {
        const blob = await (await fetch(result.url)).blob();
        const chunkSize = 20_000_000;
        const parts = Math.ceil(blob.size / chunkSize);
        const take = crypto.randomUUID();
        let name = '';
        for (let part = 0; part < parts; part++) {
          setError(`Saving take: ${part + 1} / ${parts}`);
          const query = new URLSearchParams({ take, part: String(part), parts: String(parts) });
          const response = await fetch(`./codex-subagent/film-takes?${query}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob.slice(part * chunkSize, (part + 1) * chunkSize, blob.type) });
          const saved = await response.json();
          if (!response.ok) throw new Error(saved.error || 'Could not save take');
          name = saved.name || '';
        }
        setError(`Saved to workspace: ${name}`);
      } catch (e) { setError(String(e)); }
    }}>Save take to workspace</button><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:10}}>{JSON.stringify(result.settings, null, 2)}</pre></>}
    {error && <p role="alert">{error}</p>}
  </aside>;
}
