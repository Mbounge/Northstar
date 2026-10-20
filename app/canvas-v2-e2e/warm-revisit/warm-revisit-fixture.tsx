'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasV2NativeCanvasScene } from '@/components/canvas-v2/native-canvas-scene';
import { encodeCanvasV2Screen, SCREEN_ATTRIBUTE } from '@/lib/canvas-v2/interactive-screen';
import { MEDIA_ATTRIBUTE } from '@/lib/canvas-v2/canvas-media';
import { CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneDocument, type CanvasV2NativeSceneNode } from '@/lib/canvas-v2/native-scene';
import { FIXTURE_PHOTO_DATA_URL } from '../direct-edit-contract/fixture-assets';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '@/lib/canvas-v2/types';

const WIDTH = 900, HEIGHT = 360, WORLD_HEIGHT = 30000;
const revision: CanvasV2ArtifactRevision = { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'warm-native-fixture', state: 'committed', createdAt: '2026-10-18T00:00:00.000Z', document: { html: '<main>Native warm revisit fixture</main>', css: '', javascript: '' }, evidence: [] };
const liveSource = encodeCanvasV2Screen({ version: 1, device: 'none', title: 'Warm native live runtime', width: 520, height: 260, referenceAssetIds: [], html: '<main><p>Actual retained live runtime</p><button id="counter">Clicks 0</button><input aria-label="Runtime draft" value="Keep this draft"><svg width="400" height="70"><circle id="dot" cx="35" cy="35" r="24" fill="#7b43b5"/></svg></main>', css: 'body{margin:0;background:#fff8e8;color:#27202c;font:18px system-ui}main{padding:18px}button,input{font:inherit;padding:8px;margin:5px}svg{display:block}', javascript: 'const instance=crypto.randomUUID();let count=0;function report(){parent.postMessage({type:"warm-fixture-runtime",instance,count},"*")}document.querySelector("#counter").onclick=()=>{count++;document.querySelector("#counter").textContent="Clicks "+count;document.querySelector("#dot").setAttribute("cx",String(35+count*20));report()};report();' });

function node(id: string, parentId: string | undefined, x: number, y: number, width: number, height: number, kind: CanvasV2NativeSceneNode['kind'] = 'shape', tagName = 'div', attributes: Record<string, string> = {}): CanvasV2NativeSceneNode {
  return { id, sourceNodeId: id, parentId, childIds: [], order: 0, tagName, namespace: 'html', layoutMode: 'absolute', kind, selectable: true, hidden: false, locked: false, canonicalEvidence: false, userEdited: false, editVersion: 0, geometry: { x, y, width, height, rotation: 0, zIndex: 0 }, attributes: { 'data-canvas-v2-node-id': id, ...attributes }, inlineStyle: {}, content: [] };
}

function makeScene(sourceVersion: number): CanvasV2NativeSceneDocument {
  const root = node('warm-root', undefined, 0, 0, 1000, WORLD_HEIGHT, 'root');
  const group = node('warm-live-group', root.id, 20, 20, 840, 300, 'group');
  const photo = node('warm-photo', group.id, 10, 10, 180, 270, 'image', 'img', { src: FIXTURE_PHOTO_DATA_URL, alt: 'Retained neutral landscape fixture' });
  const live = node('warm-live-screen', group.id, 220, 20, 520, 260, 'object', 'div', { [SCREEN_ATTRIBUTE]: liveSource });
  group.childIds = [photo.id, live.id]; group.content = group.childIds.map(id => ({ kind: 'node', id }));
  const media = Array.from({ length: 6 }, (_, index) => node('warm-video-' + (index + 1), root.id, 40, (index + 1) * 2000, 600, 300, 'object', 'div', { [MEDIA_ATTRIBUTE]: JSON.stringify({ version: 1, type: 'video', src: 'http://localhost:3000/northstar-test-media/onboarding-source.mp4' + (index === 0 ? '?source=' + sourceVersion : '?clip=' + (index + 1)), evidenceId: 'warm-video-' + (index + 1), description: 'Warm video ' + (index + 1) }) }));
  const gif = node('warm-gif', root.id, 40, 16000, 600, 300, 'object', 'div', { [MEDIA_ATTRIBUTE]: JSON.stringify({ version: 1, type: 'gif', src: 'http://localhost:3000/northstar-test-media/warm-retention.gif', evidenceId: 'warm-gif', description: 'Warm two-frame GIF' }) });
  // Production native culling intentionally starts above300nodes. These cheap
  // distant leaves exercise that path without mounting an artificial big DOM.
  const fillers = Array.from({ length: 310 }, (_, index) => node('warm-distant-' + index, root.id, 0, 23000 + index * 10, 2, 2));
  root.childIds = [group.id, ...media.map(item => item.id), gif.id, ...fillers.map(item => item.id)]; root.content = root.childIds.map(id => ({ kind: 'node', id }));
  return { schema: CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId: revision.id, width: 1000, height: WORLD_HEIGHT, css: '', rootIds: [root.id], nodes: [root, group, photo, live, ...media, gif, ...fillers] };
}

type Witness = { instance: number; owner: string; tag: string; connected: boolean; src: string | null; complete?: boolean; naturalWidth?: number; paused?: boolean; currentTime?: number; readyState?: number; gifVisibility?: string; loads: number; };

/** DEV-only acceptance UI. It renders the actual production scene/player and
 * publishes bounded public DOM identities/events; no account/model/storage. */
export default function WarmRevisitFixture() {
  const [view, setView] = useState(0), [mounted, setMounted] = useState(true), [sourceVersion, setSourceVersion] = useState(1), [witnesses, setWitnesses] = useState<Witness[]>([]), [events, setEvents] = useState<unknown[]>([]), [runtime, setRuntime] = useState<unknown>();
  const scene = useMemo(() => makeScene(sourceVersion), [sourceVersion]);
  const host = useRef<HTMLDivElement>(null), identities = useRef(new WeakMap<Element, number>()), nextIdentity = useRef(1), tracked = useRef<Element[]>([]), loads = useRef(new WeakMap<Element, number>()), eventRows = useRef<unknown[]>([]);
  const identity = (element: Element) => { let id = identities.current.get(element); if (!id) { id = nextIdentity.current++; identities.current.set(element, id); tracked.current.push(element); tracked.current = tracked.current.slice(-64); } return id; };
  const snapshot = () => {
    host.current?.querySelectorAll('img,video,iframe,[data-canvas-v2-node-id="warm-live-group"]').forEach(identity);
    setWitnesses(tracked.current.map(element => ({ instance: identity(element), owner: element.closest('[data-canvas-v2-node-id]')?.getAttribute('data-canvas-v2-node-id') || '', tag: element.tagName, connected: element.isConnected, src: element.getAttribute('src'), loads: loads.current.get(element) || 0, ...(element instanceof HTMLImageElement ? { complete: element.complete, naturalWidth: element.naturalWidth, gifVisibility: getComputedStyle(element).visibility } : {}), ...(element instanceof HTMLVideoElement ? { paused: element.paused, currentTime: element.currentTime, readyState: element.readyState } : {}) })));
    setEvents([...eventRows.current]);
  };
  useEffect(() => {
    const target = host.current; if (!target) return;
    const record = (type: string, element: Element) => {
      const item = { atMs: Math.round(performance.now()), type, instance: identity(element), tag: element.tagName, owner: element.closest('[data-canvas-v2-node-id]')?.getAttribute('data-canvas-v2-node-id') || '', src: element.getAttribute('src') };
      eventRows.current = [...eventRows.current, item].slice(-180);
    };
    const scan = (element: Node, kind: string) => { if (!(element instanceof Element)) return; if (element.matches('img,video,iframe,[data-canvas-v2-node-id="warm-live-group"]')) record(kind, element); element.querySelectorAll('img,video,iframe,[data-canvas-v2-node-id="warm-live-group"]').forEach(child => record(kind, child)); };
    const observer = new MutationObserver(records => records.forEach(record => { record.removedNodes.forEach(element => scan(element, 'removed')); record.addedNodes.forEach(element => scan(element, 'added')); }));
    observer.observe(target, { subtree: true, childList: true }); scan(target, 'initial');
    const mediaEvent = (event: Event) => { if (!(event.target instanceof Element) || !event.target.matches('img,video,iframe')) return; if (event.type === 'load' || event.type === 'loadedmetadata') loads.current.set(event.target, (loads.current.get(event.target) || 0) + 1); record(event.type, event.target); };
    const types = ['load', 'loadedmetadata', 'emptied', 'play', 'pause', 'error']; types.forEach(type => target.addEventListener(type, mediaEvent, true));
    const message = (event: MessageEvent) => { if (event.data?.type === 'warm-fixture-runtime' && typeof event.data.instance === 'string') setRuntime(event.data); };
    window.addEventListener('message', message);
    return () => { observer.disconnect(); types.forEach(type => target.removeEventListener(type, mediaEvent, true)); window.removeEventListener('message', message); };
    // The diagnostic observes one persistent host; identities intentionally
    // survive source changes and explicit fixture unmount/remount controls.
  }, []);
  return <main style={{ padding: 24, color: '#ece7f4', background: '#14121b', minHeight: '100vh', fontFamily: 'system-ui' }}>
    <h1>Native warm revisit acceptance</h1>
    <p>Real production native scene,320+ nodes, live group, retained local MP4 and actual two-frame GIF. No model, account, main-board state, or simulated playback. Use snapshots before/after each normal navigation.</p>
    <nav aria-label="Fixture camera" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 1000 }}>
      <button onClick={() => setView(0)}>Show live group</button>
      {Array.from({ length: 6 }, (_, index) => <button key={index} onClick={() => setView((index + 1) * 2000)}>Show video {index + 1}</button>)}
      <button onClick={() => setView(16000)}>Show GIF</button><button onClick={() => setView(20000)}>Show empty area</button>
      <button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount native scene' : 'Remount native scene'}</button>
      <button onClick={() => setSourceVersion(value => value + 1)}>Change video 1 source</button>
      <button onClick={snapshot}>Snapshot public lifecycle</button>
    </nav>
    <p role="status">Camera y{view} · source version{sourceVersion} · {mounted ? 'mounted' : 'unmounted'} · current media policy is production policy</p>
    <div ref={host} data-testid="warm-fixture-viewport" data-canvas-v2-native-wheel-capture style={{ width: WIDTH, maxWidth: '100%', height: HEIGHT, overflow: 'hidden', position: 'relative', border: '1px solid #827495', background: '#24202b' }}>
      <div style={{ transform: `translateY(-${view}px)`, width: 1000, height: WORLD_HEIGHT }}>
        {mounted && <CanvasV2NativeCanvasScene revision={revision} sceneOverride={scene} theme="dark" width={1000} height={WORLD_HEIGHT} framePointerEvents="auto" inspectionEnabled={false} visibleBounds={{ x: 0, y: view, width: WIDTH, height: HEIGHT }} viewportScale={1} />}
      </div>
    </div>
    <h2>Public lifecycle witness</h2><p>WeakMap identities/load events refer to actual public DOM. Detached witnesses retain only the last64 test elements to verify source release. Runtime nonce/counter comes from the fixture’s own visible live button via public postMessage.</p>
    <pre data-testid="warm-runtime-witness">{JSON.stringify(runtime || null, null, 2)}</pre>
    <textarea aria-label="Exact public warm lifecycle witness" readOnly value={JSON.stringify({ view, mounted, sourceVersion, witnesses, events }, null, 2)} style={{ width: '100%', minHeight: 260, color: '#16131b', background: '#eee9f6', font: '12px monospace' }} />
  </main>;
}
