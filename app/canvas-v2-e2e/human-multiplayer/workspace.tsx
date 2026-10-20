'use client';

import { Profiler, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasV2Workspace } from '@/components/canvas-v2/canvas-v2-workspace';
import { CanvasCollaborationClient, type CollaborationTransport, type PeerPresence, type SharedRoom } from '@/lib/canvas-v2/sessions/collaboration-client';
import type { CollaborationJournal } from '@/lib/canvas-v2/sessions/collaboration-client';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';
import type { FixturePeer } from './seed';
import { fixtureMembers } from './seed';
import { CANVAS_V2_WORKSPACE } from '@/lib/canvas-v2/workspace-coordinate-space';
import { privateCanvasWorkspace } from '@/lib/canvas-v2/sessions/collaboration-local';
import { PrivateWorkspaceSync } from '@/lib/canvas-v2/sessions/private-workspace-sync';
import { privateCanvasHistory } from '@/lib/canvas-v2/sessions/private-workspace';
import { privateFixtureHistory, privateFixtureRemote } from './private-fixture-services';

function fixtureTransport(room: string, peer: FixturePeer, clientId: string) {
  const network = { online: true };
  async function call<T = unknown>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    if (!network.online) throw new Error('Fixture network disconnected');
    const response = await fetch('/canvas-v2-e2e/human-multiplayer/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', body: JSON.stringify({ room, peer, clientId, action, ...data }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Fixture HTTP request failed');
    return value as T;
  }
  type WireRoom = Omit<SharedRoom, 'cells'> & { cells: Array<[string, string]> };
  const decode = (value: WireRoom): SharedRoom => ({ ...value, cells: new Map(value.cells) });
  const transport: CollaborationTransport = {
    read: async () => decode(await call<WireRoom>('read')),
    enable: async () => decode(await call<WireRoom>('enable')),
    commit: operation => call('commit', { operation }),
    since: version => call('since', { version }),
    claim: (_client, objectIds) => call('claim', { objectIds }),
    members: () => call('members'),
    watch: (_client, onSignal) => {
      let stopped = false, busy = false, version = -1;
      const known = new Map<string, number>();
      const poll = async () => {
        if (stopped || busy || !network.online) return;
        busy = true;
        try {
          const value = await call<{ version: number; peers: PeerPresence[] }>('watch');
          if (stopped) return;
          if (version !== value.version) { version = value.version; onSignal({ kind: 'changed' }); }
          const current = new Set(value.peers.map(item => item.clientId));
          for (const id of known.keys()) if (!current.has(id)) { known.delete(id); onSignal({ kind: 'leave', clientId: id }); }
          for (const presence of value.peers) if (known.get(presence.clientId) !== presence.sequence) {
            known.set(presence.clientId, presence.sequence); onSignal({ kind: 'presence', value: presence });
          }
        } catch { /* Production client sync publishes reconnect/access state. */ }
        finally { busy = false; }
      };
      const timer = setInterval(() => void poll(), 200); void poll();
      return () => { stopped = true; clearInterval(timer); void call('leave').catch(() => {}); };
    },
    presence: value => { void call('presence', { value }).catch(() => {}); },
    notify: () => {}, // HTTP observers see the durable sequence on their next200ms poll.
    invite: role => call('invite', { role }),
    removeMember: userId => call('remove-member', { userId }),
    revokeInvite: id => call('revoke-invite', { id }),
  };
  return { transport, call, setOnline: (value: boolean) => { network.online = value; } };
}

function FixtureStatus({ client }: { client: CanvasCollaborationClient }) {
  const status = useSyncExternalStore(client.subscribe, client.getStatus, client.getStatus);
  return <output data-testid="multiplayer-fixture-status" style={{ display: 'block', maxWidth: 900, overflow: 'hidden', whiteSpace: 'nowrap' }}>{JSON.stringify({ phase: status.phase, role: status.role, pending: status.pending, busyObjects: status.busyObjects, members: status.members, error: status.error, recovery: status.recovery && { label: status.recovery.label, keys: status.recovery.changes?.map(change => change.key), changes: status.recovery.changes, html: status.recovery.revision.document.html } })}</output>;
}

function PrivateFixtureStatus({ client }: { client: PrivateWorkspaceSync }) {
  const status = useSyncExternalStore(client.subscribe, client.getStatus, client.getStatus);
  return <output data-testid="multiplayer-private-status" style={{ display: 'block' }}>{JSON.stringify(status)}</output>;
}

type FixtureBundle = { client: CanvasCollaborationClient; snapshot: NorthstarSnapshot; http: ReturnType<typeof fixtureTransport>;
  personal?: PrivateWorkspaceSync; view: ReturnType<typeof privateCanvasWorkspace>; cacheInitiallyPresent: boolean };

/** Isolated HTTP peers use the exact production client and workspace. The
 * explicit Alice/Bob/Quinn identities test behavior, never real-account auth. */
export function HumanMultiplayerFixture({ room, peer, device = 'first', personal = false }: { room: string; peer: FixturePeer; device?: string; personal?: boolean }) {
  const [bundle, setBundle] = useState<FixtureBundle>();
  const [error, setError] = useState(''), [online, setOnline] = useState(true), [receipt, setReceipt] = useState('');
  const [privateReceipt, setPrivateReceipt] = useState('');
  const count = useRef(0), commits = useRef<HTMLOutputElement>(null), bodyCount = useRef(0), bodyRenders = useRef<HTMLOutputElement>(null);
  const copies = useRef(0), codecCopies = useRef<HTMLOutputElement>(null), cameraWrites = useRef(0), cameraOutput = useRef<HTMLOutputElement>(null);
  const latest = useRef<NorthstarSnapshot | undefined>(undefined), cameraTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const measure = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== 'WorkspaceBody' || detail?.phase !== 'render-body') return;
      bodyCount.current++; if (bodyRenders.current) bodyRenders.current.textContent = String(bodyCount.current);
    };
    const copied = () => { copies.current++; if (codecCopies.current) codecCopies.current.textContent = String(copies.current); };
    window.addEventListener('northstar:e2e:react-render-timing', measure);
    window.addEventListener('northstar:e2e:snapshot-copy-timing', copied);
    return () => { window.removeEventListener('northstar:e2e:react-render-timing', measure); window.removeEventListener('northstar:e2e:snapshot-copy-timing', copied); };
  }, []);
  useEffect(() => {
    let disposed = false;
    const key = `northstar-e2e-human-multiplayer:${room}:${peer}:${device}`;
    const clientId = sessionStorage.getItem(key + ':client') || peer + '-' + crypto.randomUUID();
    sessionStorage.setItem(key + ':client', clientId);
    const http = fixtureTransport(room, peer, clientId);
    const member = fixtureMembers.find(item => item.userId === peer)!;
    // The device suffix models a second browser/device without clearing any
    // real account's IndexedDB. Both devices still use the SAME cloud peer.
    const view = privateCanvasWorkspace(peer, `fixture:${room}:${device}`);
    let privateSync: PrivateWorkspaceSync | undefined;
    const client = new CanvasCollaborationClient({ clientId, userId: peer, name: member.name, transport: http.transport,
      saveJournal: async journal => { sessionStorage.setItem(key + ':journal', JSON.stringify(journal)); },
      loadJournal: async () => { try { return JSON.parse(sessionStorage.getItem(key + ':journal') || 'null') as CollaborationJournal | undefined; } catch { return undefined; } },
    });
    void client.connect().then(async () => {
      const revision = client.getRevision();
      if (!revision) throw new Error('The fixture room did not provide a document');
      if (disposed) { client.close(); return; }
      const scale = peer === 'bob' ? .6 : .7;
      const cache = view.historyCacheFor(clientId);
      const cacheInitiallyPresent = Boolean(await cache.read());
      privateSync = personal ? new PrivateWorkspaceSync({ cache, remote: privateFixtureRemote(room, peer, http.call) }) : undefined;
      const history = await privateSync?.open(privateFixtureHistory(peer));
      const viewport = personal ? await view.readCamera() : undefined;
      if (disposed) { client.close(); void privateSync?.close(); return; }
      const snapshot: NorthstarSnapshot = { schema: 1, revision, turns: [], draft: '', model: 'gpt-5.6-sol', effort: 'high', ...history,
        viewport: viewport ?? { x: (peer === 'bob' ? 500 : 450) - CANVAS_V2_WORKSPACE.aiAuthoringOriginX * scale, y: 130 - CANVAS_V2_WORKSPACE.aiAuthoringOriginY * scale, scale } };
      latest.current = snapshot;
      setBundle({ client, snapshot, http, personal: privateSync, view, cacheInitiallyPresent });
    }).catch(cause => { if (!disposed) setError(String(cause)); });
    return () => { disposed = true; client.close(); void privateSync?.close(); clearTimeout(cameraTimer.current); };
  }, [room, peer, device, personal]);
  const workspace = useMemo(() => bundle && <Profiler id="actual-collaboration-workspace" onRender={() => { count.current++; if (commits.current) commits.current.textContent = String(count.current); }}>
    <CanvasV2Workspace initialSnapshot={bundle.snapshot} collaboration={bundle.client} sessionTitle={`Disposable collaboration · ${room}`}
      onSnapshot={snapshot => {
        if (!bundle.personal) return;
        latest.current = snapshot; bundle.personal.observe(privateCanvasHistory(snapshot));
        if (!cameraTimer.current) cameraTimer.current = setTimeout(() => { cameraTimer.current = undefined; const current = latest.current;
          if (current) void bundle.view.writeCamera(current.viewport).then(() => { cameraWrites.current++; if (cameraOutput.current) cameraOutput.current.textContent = String(cameraWrites.current); });
        }, 900);
      }} accountEndpoint="/canvas-v2-e2e/codex/account" agentEndpoint="/canvas-v2-e2e/human-multiplayer/api" designEndpoint="/canvas-v2-e2e/human-multiplayer/api" researchEndpoint="/canvas-v2-e2e/human-multiplayer/api" routerEndpoint="/canvas-v2-e2e/human-multiplayer/api" />
  </Profiler>, [bundle, room]);
  const reconnect = async () => {
    if (!bundle) return;
    bundle.http.setOnline(!online); setOnline(!online);
    if (!online) { await bundle.client.sync(); bundle.client.pointer(null); await bundle.personal?.flush(); }
  };
  const ownerAction = async (action: string) => {
    if (!bundle) return;
    try { await bundle.http.call(action, { userId: 'bob' }); await bundle.client.refreshMembers(); setError(''); }
    catch (cause) { setError(String(cause)); }
  };
  return <>
    {workspace || <main><p role="status">{error || 'Opening disposable multiplayer fixture…'}</p></main>}
    <aside aria-label="Disposable multiplayer fixture controls" style={{ position: 'fixed', zIndex: 200000, bottom: 100, left: personal ? undefined : 20, right: personal ? 20 : undefined, width: personal ? 260 : 380, maxHeight: personal ? 200 : undefined, overflow: 'auto', padding: '6px 10px', color: '#eee', background: '#181522f2', border: '1px solid #7b7188', borderRadius: 8, font: '11px system-ui' }}>
      <strong>DEV HTTP fixture · {peer} · {room}</strong> <span>No real-account, RLS or model claim.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => void reconnect()} disabled={!bundle}>{online ? 'Disconnect fixture network' : 'Reconnect fixture network'}</button>
        {peer === 'alice' && <><button onClick={() => void ownerAction('remove-member')}>Fixture remove Bob</button><button onClick={() => void ownerAction('restore-bob')}>Fixture restore Bob</button></>}
        <button onClick={() => { if (bundle) void bundle.http.call('diagnostics').then(value => setReceipt(JSON.stringify(value, null, 2))).catch(cause => setError(String(cause))); }}>Read fixture server receipt</button>
        <span>Workspace React commits: <output ref={commits} data-testid="multiplayer-workspace-react-commits">{count.current}</output></span>
        <span>Workspace body renders: <output ref={bodyRenders} data-testid="multiplayer-workspace-body-renders">{bodyCount.current}</output> (add hardening=1)</span>
      </div>
      {bundle && <FixtureStatus client={bundle.client} />}
      {bundle?.personal && <>
        <PrivateFixtureStatus client={bundle.personal} />
        <output data-testid="multiplayer-private-cache-state">{JSON.stringify({ peer, device, cacheInitiallyPresent: bundle.cacheInitiallyPresent })}</output>
        <div>Private codec copies: <output ref={codecCopies} data-testid="multiplayer-private-codec-copies">{copies.current}</output> · Camera writes: <output ref={cameraOutput} data-testid="multiplayer-camera-writes">{cameraWrites.current}</output></div>
        <button onClick={() => void bundle.personal?.flush()}>Flush private history</button>{' '}
        <button onClick={() => void bundle.http.call('private-diagnostics').then(value => setPrivateReceipt(JSON.stringify(value))).catch(cause => setError(String(cause)))}>Read own private receipt</button>
        {privateReceipt && <textarea readOnly aria-label="Own private cloud receipt" value={privateReceipt} rows={4} style={{ width: '100%', color: '#111', font: '11px monospace' }} />}
      </>}
      {error && <p role="alert">{error}</p>}
      {receipt && <textarea readOnly aria-label="Fixture public server receipt" value={receipt} rows={5} style={{ width: '100%', color: '#111', font: '11px monospace' }} />}
    </aside>
  </>;
}
