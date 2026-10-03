import { useCallback, useEffect, useRef, useState } from 'react';
import './style.css';

type PreviewMessage =
  | { type: 'touch'; action: 'down' | 'move' | 'up'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; deltaY: number }
  | { type: 'key'; key: string }
  | { type: 'text'; value: string };

type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type Assignment = { worker: string; port: number; package: string; app: string; icon: string; token: string };
type CatalogApp = { package: string; name: string; icon: string; status: string };
const apps = [
  { package: 'org.wikipedia', name: 'Wikipedia', icon: 'wikipedia.png', status: 'checking' },
  { package: 'de.danoeh.antennapod', name: 'AntennaPod', icon: 'antennapod.png', status: 'checking' },
] as const;
const query = new URLSearchParams(window.location.search);
const embedded = query.get('embed') === '1';
const parentOrigins = new Set(['https://www.usenorthstar.ai', 'http://127.0.0.1:3000', 'http://localhost:3000']);
const asset = (name: string) => `${embedded ? '/preview/' : '/'}${name}`;
const brokerUrl = () => embedded ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/preview/api/allocate` : 'ws://127.0.0.1:18082/allocate';
const catalogUrl = () => embedded ? `${location.origin}/preview/api/catalog` : 'http://127.0.0.1:18082/catalog';
const releaseUrl = () => embedded ? `${location.origin}/preview/api/release` : 'http://127.0.0.1:18082/release';
const streamUrl = (port: number) => embedded
  ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/preview/worker/${port === 18081 ? '2' : '1'}/stream`
  : `ws://127.0.0.1:${port}/stream`;
let currentGrant = '';
let activeAssignment: Assignment | null = null;
const directWorker = query.get('worker') === '2' ? '2' : '1';
const appParameter = query.get('app');
const validApp = appParameter === null || /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appParameter);
const requestedApp = apps.find(app => app.package === appParameter) ?? (appParameter ? { package: appParameter, name: appParameter, icon: '', status: 'checking' } : apps[0]);
const pooled = query.has('app');
const sessionKey = `northstar.preview.session.${directWorker}`;
const assignmentKey = `northstar.preview.assignment.${requestedApp.package}`;
let pendingAllocation: Promise<Assignment> | null = null;

function savedAssignment(): Assignment | null {
  if (embedded) return activeAssignment;
  try {
    const value = JSON.parse(sessionStorage.getItem(assignmentKey) ?? 'null');
    return value && value.package === requestedApp.package && typeof value.token === 'string' &&
      typeof value.worker === 'string' && typeof value.icon === 'string' && Number.isInteger(value.port) && value.port >= 18080 && value.port <= 18081 ? value : null;
  } catch { return null; }
}

function allocate(onQueued?: (position: number) => void): Promise<Assignment> {
  const saved = savedAssignment();
  if (saved) return Promise.resolve(saved);
  if (pendingAllocation) return pendingAllocation;
  pendingAllocation = new Promise<Assignment>((resolve, reject) => {
    const ws = new WebSocket(brokerUrl());
    const timeout = window.setTimeout(() => { ws.close(); reject(new Error('The preview pool did not respond.')); }, 260000);
    ws.onopen = () => ws.send(JSON.stringify({ package: requestedApp.package, ...(embedded ? { grant: currentGrant } : {}) }));
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'preparing') return;
        if (message.type === 'queued' && Number.isInteger(message.position) && message.position > 0) {
          onQueued?.(message.position);
          return;
        }
        if (message.type === 'allocated' && message.package === requestedApp.package &&
            typeof message.token === 'string' && typeof message.worker === 'string' &&
            (message.port === 18080 || message.port === 18081) && typeof message.icon === 'string') {
          const assignment: Assignment = { worker: message.worker, port: message.port, package: message.package, app: message.app, icon: message.icon, token: message.token };
          activeAssignment = assignment;
          if (!embedded) sessionStorage.setItem(assignmentKey, JSON.stringify(assignment));
          resolve(assignment);
        } else reject(new Error(message.message || 'The app is unavailable for preview.'));
      } catch { reject(new Error('The preview pool returned an invalid response.')); }
      clearTimeout(timeout);
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timeout); reject(new Error('Could not connect to the preview pool.')); };
    ws.onclose = () => { clearTimeout(timeout); reject(new Error('The preview pool disconnected.')); };
  }).finally(() => { pendingAllocation = null; });
  return pendingAllocation;
}

function PreviewApp() {
  const socket = useRef<WebSocket | null>(null);
  const assignmentRef = useRef<Assignment | null>(pooled ? savedAssignment() : null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const pressed = useRef(false);
  const lastPointer = useRef({ x: 540, y: 1200 });
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const wheelDelta = useRef(0);
  const wheelPosition = useRef({ x: 540, y: 1200 });
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollInFlight = useRef(false);
  const textBuffer = useRef('');
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextInputId = useRef(1);
  const pendingInputs = useRef(new Map<number, number>());
  const awaitingFrame = useRef<number | null>(null);
  const lastFrameAt = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const lastStatsAt = useRef(0);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [instance, setInstance] = useState(0);
  const [ended, setEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const endingRef = useRef(false);
  const endedRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [waitingForDevice, setWaitingForDevice] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [frameRate, setFrameRate] = useState<number | null>(null);
  const [appName, setAppName] = useState<string>(pooled ? requestedApp.name : directWorker === '2' ? 'AntennaPod' : 'Wikipedia');
  const [appIcon, setAppIcon] = useState<string>(pooled ? requestedApp.icon : directWorker === '2' ? 'antennapod.png' : 'wikipedia.png');
  const [deviceLabel, setDeviceLabel] = useState(pooled ? '' : directWorker);
  const [unsupported, setUnsupported] = useState(false);

  const markEnded = useCallback(() => {
    endingRef.current = false;
    endedRef.current = true;
    activeAssignment = null;
    assignmentRef.current = null;
    if (!embedded) sessionStorage.removeItem(pooled ? assignmentKey : sessionKey);
    setEnding(false);
    setEnded(true);
    setHasFrame(false);
    setFrameRate(null);
    setLatencyMs(null);
    const context = canvas.current?.getContext('2d');
    if (context) {
      context.fillStyle = '#f9f9f9';
      context.fillRect(0, 0, 540, 1200);
    }
    setError('');
    setNotice('Session ended. The device is returning to a clean state.');
  }, []);

  useEffect(() => {
    document.title = `${appName} live preview · Northstar`;
  }, [appName]);

  useEffect(() => {
    if (ended) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 0;
    let newestFrame: { blob: Blob; socket: WebSocket } | null = null;
    let drawing = false;
    let firstFrame = false;
    let failedAttaches = 0;

    const drawNewest = async () => {
      if (drawing) return;
      drawing = true;
      while (newestFrame && !disposed) {
        const frame = newestFrame;
        newestFrame = null;
        try {
          const bitmap = await createImageBitmap(frame.blob);
          if (!disposed && canvas.current && !newestFrame) {
            const context = canvas.current.getContext('2d', { alpha: false });
            context?.drawImage(bitmap, 0, 0, canvas.current.width, canvas.current.height);
            const now = performance.now();
            lastFrameAt.current = now;
            frameTimes.current.push(now);
            frameTimes.current = frameTimes.current.filter(value => now - value <= 2000);
            if (now - lastStatsAt.current > 1000 && frameTimes.current.length > 1 && now - frameTimes.current[0] >= 500) {
              const times = frameTimes.current;
              setFrameRate(Math.round((times.length - 1) * 1000 / (now - times[0])));
              lastStatsAt.current = now;
            }
            if (awaitingFrame.current !== null) {
              setLatencyMs(Math.round(now - awaitingFrame.current));
              awaitingFrame.current = null;
            }
            if (!firstFrame) {
              firstFrame = true;
              setHasFrame(true);
            }
            setConnection('connected');
            setError('');
            retry = 0;
            failedAttaches = 0;
          }
          bitmap.close();
        } catch {
          if (!disposed) setError('The device sent a frame the browser could not draw.');
        } finally {
          if (socket.current === frame.socket && frame.socket.readyState === WebSocket.OPEN) {
            frame.socket.send('{"type":"frame_ready"}');
          }
        }
      }
      drawing = false;
    };

    const connect = async () => {
      if (disposed) return;
      setConnection('connecting');
      lastFrameAt.current = 0;
      frameTimes.current = [];
      let assignment: Assignment | null = null;
      try {
        if (pooled) {
          assignment = await allocate(position => { setQueuePosition(position); setWaitingForDevice(true); });
          if (disposed) return;
          assignmentRef.current = assignment;
          setWaitingForDevice(false);
          setQueuePosition(null);
          setAppName(assignment.app);
          setAppIcon(assignment.icon);
          setDeviceLabel(assignment.worker.replace('preview-', ''));
        }
      } catch (cause) {
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : 'The preview pool is unavailable.';
        if (message.includes('not in the preview pool') || message.includes('No test device is configured')) {
          setUnsupported(true);
          setError(message);
          setConnection('disconnected');
          return;
        }
        const occupied = message.includes('occupied or preparing');
        setWaitingForDevice(occupied);
        setError(occupied ? '' : message);
        setConnection('disconnected');
        timer = setTimeout(() => void connect(), Math.min(1000 * 2 ** retry++, 10000));
        return;
      }
      const url = new URL(streamUrl(assignment?.port ?? (directWorker === '2' ? 18081 : 18080)));
      const stored = assignment?.token ?? sessionStorage.getItem(sessionKey);
      if (stored && !embedded) url.searchParams.set('session', stored);
      const ws = embedded && stored
        ? new WebSocket(url, ['northstar-preview', `session.${stored}`])
        : new WebSocket(url);
      ws.binaryType = 'blob';
      socket.current = ws;
      ws.onmessage = event => {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'session' && typeof message.token === 'string') {
              if (!pooled) sessionStorage.setItem(sessionKey, message.token);
              if (typeof message.app === 'string') setAppName(message.app);
            }
            if (message.type === 'session_ending') {
              markEnded();
            }
            if (message.type === 'error') {
              const occupied = pooled && typeof message.message === 'string' && message.message.includes('in use');
              setError(occupied ? '' : message.message);
              if (occupied) setWaitingForDevice(true);
            }
            if (message.type === 'input_applied' && Number.isInteger(message.id)) {
              const start = pendingInputs.current.get(message.id);
              pendingInputs.current.delete(message.id);
              if (start !== undefined) awaitingFrame.current = start;
            }
            if (message.type === 'scroll_done') {
              scrollInFlight.current = false;
              if (Math.abs(wheelDelta.current) >= 5 && wheelTimer.current === null) {
                wheelTimer.current = setTimeout(flushWheel, 16);
              }
            }
          } catch { /* Ignore malformed notices. */ }
          return;
        }
        if (newestFrame && ws.readyState === WebSocket.OPEN) {
          // The viewer no longer needs the older, undrawn frame.
          ws.send('{"type":"frame_ready"}');
        }
        newestFrame = { blob: event.data, socket: ws };
        void drawNewest();
      };
      ws.onerror = () => { if (!disposed) setConnection('disconnected'); };
      ws.onclose = () => {
        if (disposed || endedRef.current) return;
        if (!firstFrame && ++failedAttaches >= 2) {
          // The saved lease can outlive a wiped/restarted worker. Ask the pool
          // for a fresh device rather than retrying an invalid token forever.
          activeAssignment = null;
          if (!embedded) sessionStorage.removeItem(pooled ? assignmentKey : sessionKey);
        }
        if (endingRef.current) {
          endingRef.current = false;
          setEnding(false);
          setError('The reset was not confirmed. Reconnect and try ending the session again.');
        }
        setConnection('disconnected');
        scrollInFlight.current = false;
        wheelDelta.current = 0;
        if (wheelTimer.current !== null) clearTimeout(wheelTimer.current);
        wheelTimer.current = null;
        socket.current = null;
        pendingInputs.current.clear();
        awaitingFrame.current = null;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
      };
    };

    void connect();
    const frameWatchdog = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN && lastFrameAt.current > 0 && performance.now() - lastFrameAt.current > 4500) {
        setError('The video paused. Restoring the preview…');
        setConnection('disconnected');
        socket.current.close();
      }
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(frameWatchdog);
      if (timer) clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [instance, ended, markEnded]);

  useEffect(() => () => {
    if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
    if (wheelTimer.current !== null) clearTimeout(wheelTimer.current);
    if (textTimer.current !== null) clearTimeout(textTimer.current);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    const endOnExit = () => {
      if (socket.current?.readyState === WebSocket.OPEN && !endingRef.current) {
        socket.current.send('{"type":"end_session"}');
      }
    };
    window.addEventListener('pagehide', endOnExit);
    return () => window.removeEventListener('pagehide', endOnExit);
  }, []);

  const send = (message: PreviewMessage) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return;
    const measured = message.type !== 'touch' || message.action === 'up';
    if (measured) {
      const id = nextInputId.current++;
      pendingInputs.current.set(id, performance.now());
      socket.current.send(JSON.stringify({ ...message, id }));
      return;
    }
    socket.current.send(JSON.stringify(message));
  };

  const flushWheel = () => {
    wheelTimer.current = null;
    if (scrollInFlight.current || Math.abs(wheelDelta.current) < 5) return;
    if (socket.current?.readyState !== WebSocket.OPEN) return;
    const deltaY = Math.max(-650, Math.min(650, wheelDelta.current));
    wheelDelta.current = 0;
    scrollInFlight.current = true;
    send({ type: 'scroll', ...wheelPosition.current, deltaY });
  };

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      event.preventDefault();
      if (pressed.current) return;
      const bounds = element.getBoundingClientRect();
      wheelPosition.current = {
        x: Math.max(0, Math.min(1079, Math.floor((event.clientX - bounds.left) / bounds.width * 1080))),
        y: Math.max(0, Math.min(2399, Math.floor((event.clientY - bounds.top) / bounds.height * 2400))),
      };
      const scale = event.deltaMode === 1 ? 35 : event.deltaMode === 2 ? 500 : 1;
      wheelDelta.current += event.deltaY * scale;
      if (wheelTimer.current === null) {
        wheelTimer.current = setTimeout(flushWheel, 24);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const flushText = () => {
    if (textTimer.current !== null) clearTimeout(textTimer.current);
    textTimer.current = null;
    if (textBuffer.current) send({ type: 'text', value: textBuffer.current });
    textBuffer.current = '';
  };

  const appendText = (value: string) => {
    if (!value || !/^[\x20-\x7E]+$/.test(value)) return;
    if (textBuffer.current.length + value.length > 190) flushText();
    textBuffer.current += value;
    if (textTimer.current === null) textTimer.current = setTimeout(flushText, 40);
  };

  const locate = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1079, Math.floor((event.clientX - bounds.left) / bounds.width * 1080))),
      y: Math.max(0, Math.min(2399, Math.floor((event.clientY - bounds.top) / bounds.height * 2400))),
    };
  };

  const flushMove = () => {
    if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
    moveFrame.current = null;
    if (pendingMove.current) send({ type: 'touch', action: 'move', ...pendingMove.current });
    pendingMove.current = null;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pressed.current) return;
    pendingMove.current = locate(event);
    lastPointer.current = pendingMove.current;
    if (moveFrame.current === null) {
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        if (pendingMove.current) send({ type: 'touch', action: 'move', ...pendingMove.current });
        pendingMove.current = null;
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pressed.current) return;
    flushMove();
    lastPointer.current = locate(event);
    send({ type: 'touch', action: 'up', ...lastPointer.current });
    pressed.current = false;
  };

  useEffect(() => {
    const releaseOnBlur = () => {
      if (!pressed.current) return;
      pressed.current = false;
      flushMove();
      send({ type: 'touch', action: 'up', ...lastPointer.current });
    };
    window.addEventListener('blur', releaseOnBlur);
    return () => window.removeEventListener('blur', releaseOnBlur);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Tab') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    if (event.key.length === 1 && event.key.charCodeAt(0) < 128) {
      appendText(event.key);
      return;
    }
    flushText();
    if (event.key === 'Backspace' || event.key === 'Escape') send({ type: 'key', key: event.key === 'Escape' ? 'GoBack' : 'Backspace' });
    else if (event.key === 'Enter' || event.key.startsWith('Arrow')) send({ type: 'key', key: event.key });
  };

  const onTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;
    if (event.key.length === 1) return; // Text and IME insertions arrive through onInput.
    event.preventDefault();
    flushText();
    if (event.key === 'Backspace' || event.key === 'Escape') send({ type: 'key', key: event.key === 'Escape' ? 'GoBack' : 'Backspace' });
    else if (event.key === 'Enter' || event.key.startsWith('Arrow')) send({ type: 'key', key: event.key });
  };

  const reconnect = () => {
    endedRef.current = false;
    setError('');
    setNotice('');
    setConnection('connecting');
    setHasFrame(false);
    setInstance(value => value + 1);
  };

  const endSession = async () => {
    const assignment = pooled ? assignmentRef.current : null;
    const token = assignment?.token ?? (pooled ? null : sessionStorage.getItem(sessionKey));
    if (!token || ending) return;
    if (assignment) {
      endingRef.current = true;
      setEnding(true);
      setError('');
      try {
        const response = await fetch(releaseUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker: assignment.worker, token }),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('The device could not confirm its reset. Try again when the connection returns.');
        markEnded();
      } catch (cause) {
        endingRef.current = false;
        setEnding(false);
        setError(cause instanceof Error ? cause.message : 'The device could not confirm its reset.');
      }
      return;
    }
    if (socket.current?.readyState === WebSocket.OPEN) {
      endingRef.current = true;
      setEnding(true);
      socket.current.send('{"type":"end_session"}');
    }
  };

  const interactive = !ended && connection === 'connected' && hasFrame;

  if (unsupported) return <UnsupportedApp />;

  return <main className={`page ${embedded ? 'embedded' : ''}`}>
    {!embedded && <header className="topbar">
      <div className="wordmark"><span className="star">✦</span> Northstar <span className="divider" /> <span className="preview-label">Preview lab</span></div>
      <span className="private-label">Private test · not in Northstar</span>
    </header>}

    <section className="preview-shell" aria-label={`${appName} live app preview`}>
      {!embedded && <div className="preview-heading">
        <div className="app-identity">{appIcon ? <img className="app-icon" src={asset(appIcon)} alt="" /> : <span className="app-icon app-icon-fallback">{appName.slice(0, 1)}</span>}<div><p className="overline">LIVE APP PREVIEW</p><h1>{appName}</h1><p className="app-meta">Android · {deviceLabel ? `Private device ${deviceLabel}` : 'Device assigned when available'}</p></div></div>
      </div>}

      <div className={`viewer-stage ${expanded ? 'is-expanded' : ''}`}>
        <div className="stage-intro">
          <p className="overline">INTERACTIVE PREVIEW</p>
          <h2>Explore the real app.</h2>
          <p>Tap, swipe, scroll and type directly on the device.</p>
          <span className="stage-rule" aria-hidden="true" />
          <p className="stage-footnote">A private Android session for your workspace.</p>
        </div>
        <div className="device-area"><div className={`phone ${expanded ? 'expanded' : ''}`}>
          <div className="screen"><canvas ref={canvas} width={540} height={1200} tabIndex={0} aria-label={`Interactive ${appName} Android preview`} aria-disabled={!interactive} onPointerDown={event => { if (!interactive) return; event.preventDefault(); pressed.current = true; lastPointer.current = locate(event); event.currentTarget.setPointerCapture(event.pointerId); textInput.current?.focus({ preventScroll: true }); send({ type: 'touch', action: 'down', ...lastPointer.current }); }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown} onPaste={event => { const value = event.clipboardData.getData('text'); if (value && value.length <= 200 && /^[\x20-\x7E]+$/.test(value)) { event.preventDefault(); flushText(); send({ type: 'text', value }); } }} /><textarea ref={textInput} className="input-capture" tabIndex={-1} aria-label="Type in Android preview" autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={onTextKeyDown} onInput={event => { const value = event.currentTarget.value; event.currentTarget.value = ''; appendText(value); }} onPaste={event => { const value = event.clipboardData.getData('text'); if (value && value.length <= 200 && /^[\x20-\x7E]+$/.test(value)) { event.preventDefault(); flushText(); send({ type: 'text', value }); } }} onBlur={flushText} /></div>
        </div></div>
        {!hasFrame && <div className="frame-notice">{ended ? 'Session ended' : waitingForDevice ? `Your private device is being prepared${queuePosition ? ` · queue position ${queuePosition}` : ''}.` : 'Starting a clean Android device…'}</div>}
        <aside className="session-panel" aria-label="Preview session controls">
          <div className="session-panel-heading"><span className="overline">YOUR SESSION</span><span className="session-index">ANDROID{deviceLabel ? ` · ${deviceLabel}` : ''}</span></div>
          <div className="status" aria-live="polite"><span className={`status-dot ${ended ? 'ended' : ending ? 'ending' : connection}`} />{ended ? 'Session ended' : ending ? 'Ending session…' : connection === 'connected' ? 'Live device' : waitingForDevice ? `Waiting for device${queuePosition ? ` · ${queuePosition} in queue` : ''}` : connection === 'disconnected' && hasFrame ? 'Reconnecting…' : 'Preparing device…'}</div>
          <div className="controls">
          <button type="button" disabled={!interactive} onClick={() => send({ type: 'key', key: 'GoBack' })}><span className="control-glyph" aria-hidden="true">←</span><span>Back</span></button>
          <button type="button" disabled={!interactive} onClick={() => send({ type: 'key', key: 'GoHome' })}><span className="control-glyph" aria-hidden="true">⌂</span><span>Device home</span></button>
          <button type="button" onClick={() => setExpanded(value => !value)}><span className="control-glyph" aria-hidden="true">{expanded ? '↙' : '↗'}</span><span>{expanded ? 'Fit view' : 'Enlarge'}</span></button>
          <button type="button" onClick={ended ? () => { endedRef.current = false; setEnded(false); setError(''); setNotice(''); setInstance(value => value + 1); } : reconnect}><span className="control-glyph" aria-hidden="true">↻</span><span>{ended ? 'Start preview' : 'Reconnect'}</span></button>
          {!ended && <button type="button" className="end-session" disabled={ending || (pooled ? !assignmentRef.current : !interactive)} onClick={() => void endSession()}><span className="control-glyph" aria-hidden="true">×</span><span>{ending ? 'Ending…' : 'End session'}</span></button>}
          {pooled && ended && !embedded && <a className="pool-link" href="?pool=1">Choose another app</a>}
          </div>
          <p className="session-help">If the app asks you to sign in, use your own account. This device is erased when your session ends.</p>
          {!ended && <p className="live-metrics">{frameRate === null ? 'Connecting stream…' : `${frameRate} frames/s`}{latencyMs !== null && ` · ${latencyMs} ms response`}</p>}
        </aside>
        </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="session-notice" role="status">{notice}</p>}
    </section>
  </main>;
}

function PoolLanding() {
  const [catalogApps, setCatalogApps] = useState<CatalogApp[]>(embedded ? [] : [...apps]);
  useEffect(() => { document.title = 'Choose an app · Northstar Preview Lab'; }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => fetch(catalogUrl(), { signal: controller.signal, cache: 'no-store', ...(embedded ? { headers: { Authorization: `Bearer ${currentGrant}` } } : {}) })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Pool unavailable')))
      .then(data => {
        if (Array.isArray(data.apps)) setCatalogApps(data.apps.map((app: { package: string; app: string; icon: string; status: string }) => ({ package: app.package, name: app.app, icon: app.icon, status: app.status })));
      })
      .catch(() => { if (!controller.signal.aborted) setCatalogApps(previous => previous.map(app => ({ ...app, status: 'offline' }))); });
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);
  return <main className="page">
    <header className="topbar"><div className="wordmark"><span className="star">✦</span> Northstar <span className="divider" /> <span className="preview-label">Preview lab</span></div><span className="private-label">Private test · not in Northstar</span></header>
    <section className="pool-shell">
      <p className="overline">LIVE APP PREVIEW</p>
      <h1>Explore the real app.</h1>
      <p className="pool-intro">Choose an app to open a clean Android test device. Sign in with your own account if needed. Your session is private and ends with a full device reset.</p>
      <div className="app-grid">{catalogApps.map(app => <a key={app.package} className="app-choice" href={`?app=${encodeURIComponent(app.package)}`}>
        {app.icon ? <img src={asset(app.icon)} alt="" /> : <span className="app-icon app-icon-fallback">{app.name.slice(0, 1)}</span>}
        <span className="choice-copy"><strong>{app.name}</strong><small>Android app</small></span><span className={`choice-status ${app.status}`}>{app.status === 'available' ? 'Ready' : app.status === 'leased' ? 'In use' : app.status === 'resetting' ? 'Resetting' : app.status === 'offline' ? 'Unavailable' : 'Checking…'}</span><span className="choice-arrow" aria-hidden="true">↗</span>
      </a>)}</div>
      <p className="pool-footnote">Lab capacity: one visitor per device. Availability updates as devices reset between visitors.</p>
    </section>
  </main>;
}

function UnsupportedApp() {
  useEffect(() => { document.title = 'App unavailable · Northstar Preview Lab'; }, []);
  return <main className="page"><header className="topbar"><div className="wordmark"><span className="star">✦</span> Northstar <span className="divider" /> <span className="preview-label">Preview lab</span></div></header><section className="pool-shell"><p className="overline">LIVE APP PREVIEW</p><h1>This app is not in the test pool.</h1><p className="pool-intro">Choose one of the staged apps to continue.</p><a className="back-to-pool" href="?pool=1">Choose an app →</a></section></main>;
}

export default function App() {
  const [hasGrant, setHasGrant] = useState(!embedded);
  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (!parentOrigins.has(event.origin) || event.source !== window.parent) return;
      if (event.data?.type !== 'northstar-preview-grant' || typeof event.data.grant !== 'string' || event.data.grant.length > 4096) return;
      currentGrant = event.data.grant;
      setHasGrant(true);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'northstar-preview-ready' }, '*');
    return () => window.removeEventListener('message', receive);
  }, []);
  if (!hasGrant) return <main className="page"><div className="pool-shell"><p className="overline">LIVE APP PREVIEW</p><h1>Connecting to Northstar…</h1><p className="pool-intro">Open this preview from your Northstar workspace.</p></div></main>;
  if (query.has('pool')) return <PoolLanding />;
  if (pooled && !validApp) return <UnsupportedApp />;
  return <PreviewApp />;
}
