import { normalizeCanvasV2NativeGeometryDocument } from '../native-geometry-document';
import type { CanvasV2ArtifactRevision } from '../types';
import { applySharedChanges, conflictingSharedCells, diffSharedCells, encodeSharedId, revisionFromSharedCells, sharedCellsFromRevision, type AcceptedOperation, type CellChange, type SharedCells, type SharedOperation } from './collaboration-document';

export interface CanvasMember { userId: string; name: string; role: 'owner' | 'editor' | 'viewer' }
export interface SharedRoom { version: number; cells: SharedCells; seed: CanvasV2ArtifactRevision; ownerId: string; role: CanvasMember['role']; members: CanvasMember[] }
export interface PeerSelection { nodeId: string; x: number; y: number; width: number; height: number }
export interface PeerView { x:number; y:number; width:number; height:number }
export interface PeerPresence {
  clientId: string; userId: string; name: string; sequence: number; cursor: { x: number; y: number } | null;
  selection: PeerSelection[]; mode: 'design' | 'preview'; activity: 'viewing' | 'editing' | 'thinking';
  motion?: PeerSelection[]; at: number;
  view?: PeerView;
  following?: string;
}
export interface CollaborationTransport {
  read(): Promise<SharedRoom | null>;
  enable(cells: SharedCells, seed: CanvasV2ArtifactRevision): Promise<SharedRoom>;
  commit(operation: SharedOperation): Promise<{ ok: boolean; version: number; conflicts?: string[] }>;
  since(version: number): Promise<AcceptedOperation[]>;
  claim(clientId: string, objectIds: string[]): Promise<{ busy: string[] }>;
  members(): Promise<CanvasMember[]>;
  watch(clientId: string, onSignal: (event: { kind: 'changed' } | { kind: 'presence'; value: unknown } | { kind: 'leave'; clientId: string }) => void): () => void;
  presence(value: PeerPresence): void;
  notify(): void;
  invite(role: 'viewer' | 'editor'): Promise<{ id: string; token: string }>;
  removeMember(userId: string): Promise<void>;
  revokeInvite(id: string): Promise<void>;
}
export interface RecoveredBranch { label: string; revision: CanvasV2ArtifactRevision; changes?: CellChange[]; at: number }
export interface RecoveredEdit extends RecoveredBranch { alternatives?: RecoveredBranch[] }
export interface CollaborationJournal { pending: SharedOperation[]; recovery?: RecoveredEdit }
export interface CollaborationStatus {
  phase: 'off' | 'connecting' | 'live' | 'reconnecting' | 'blocked'; role: CanvasMember['role']; pending: number;
  error?: string; recovery?: RecoveredEdit; members: CanvasMember[]; busyObjects: string[];
}
const COLORS = ['#A994FF', '#55C8E9', '#F2A36C', '#77CE9F', '#ED89BD', '#F0CF71', '#8CB4FF', '#CB9DEA'];
export function collaboratorColor(userId: string): string {
  let hash = 0; for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[(hash >>> 0) % COLORS.length];
}
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000;
export function validPeerView(value:unknown):value is PeerView {
  if(!value||typeof value!=='object')return false;
  const view=value as PeerView;return [view.x,view.y,view.width,view.height].every(finite)&&view.width>0&&view.height>0;
}
export function parsePeerPresence(value: unknown, now = Date.now()): PeerPresence | undefined {
  if (!value || typeof value !== 'object') return;
  const p = value as PeerPresence;
  if (typeof p.clientId !== 'string' || p.clientId.length > 80 || typeof p.userId !== 'string' || p.userId.length > 80 || typeof p.name !== 'string' || p.name.length > 48 || !Number.isSafeInteger(p.sequence) || p.sequence < 0 || !['design', 'preview'].includes(p.mode) || !['viewing', 'editing', 'thinking'].includes(p.activity)) return;
  const validSelection = (items: unknown): items is PeerSelection[] => Array.isArray(items) && items.length <= 24 && items.every(item => item && typeof item.nodeId === 'string' && item.nodeId.length <= 256 && [item.x, item.y, item.width, item.height].every(finite) && item.width > 0 && item.height > 0);
  if (!validSelection(p.selection) || (p.motion !== undefined && !validSelection(p.motion)) || (p.cursor !== null && (!p.cursor || !finite(p.cursor.x) || !finite(p.cursor.y)))) return;
  if((p.view!==undefined&&!validPeerView(p.view))||(p.following!==undefined&&(typeof p.following!=='string'||!p.following.length||p.following.length>80||p.following===p.clientId)))return;
  return { clientId: p.clientId, userId: p.userId, name: p.name, sequence: p.sequence, mode: p.mode, activity: p.activity, cursor: p.cursor && { x: p.cursor.x, y: p.cursor.y }, selection: p.selection.map(item => ({ ...item })), ...(p.motion ? { motion: p.motion.map(item => ({ ...item })) } : {}), ...(p.view?{view:{x:p.view.x,y:p.view.y,width:p.view.width,height:p.view.height}}:{}),...(p.following?{following:p.following}:{}),at: now };
}

/** The document stream is durable and ordered; pointer packets are ephemeral.
 * Local camera, UI mode, unsent chat and product runtime state never enter it. */
export class CanvasCollaborationClient {
  readonly clientId: string;
  readonly userId: string;
  readonly transport: CollaborationTransport;
  private status: CollaborationStatus = { phase: 'off', role: 'viewer', pending: 0, members: [], busyObjects: [] };
  private listeners = new Set<() => void>();
  private revisionListeners = new Set<(revision: CanvasV2ArtifactRevision) => void>();
  private presenceListeners = new Set<() => void>();
  private peers = new Map<string, PeerPresence>();
  private accepted: SharedCells = new Map();
  private visible: SharedCells = new Map();
  private revision?: CanvasV2ArtifactRevision;
  private version = 0;
  private pending: SharedOperation[] = [];
  private known = new Set<string>();
  private material = new Map<string, SharedCells>();
  private undoHistory: Array<{ original: CellChange[]; inverse: CellChange[] }> = [];
  private redoHistory: Array<{ original: CellChange[]; inverse: CellChange[] }> = [];
  private historyIntent = new Map<string, 'undo' | 'redo'>();
  private watchStop?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private pumping?: Promise<void>;
  private observing = Promise.resolve();
  private closed = false;
  private local: PeerPresence;
  private lastPointer = 0;
  private pointerTimer?: ReturnType<typeof setTimeout>;
  private lastHeartbeat = 0;
  private lastMembers = 0;
  private lastSync = 0;
  private claims: string[] = [];
  private lastClaim = 0;
  private journalSignature?: string;
  constructor(private options: { clientId: string; userId: string; name: string; transport: CollaborationTransport; saveJournal?: (journal: CollaborationJournal) => Promise<void>; loadJournal?: () => Promise<CollaborationJournal | undefined> }) {
    this.clientId = options.clientId; this.userId = options.userId; this.transport = options.transport;
    this.local = { clientId: this.clientId, userId: this.userId, name: options.name.slice(0, 48) || 'Teammate', sequence: 0, cursor: null, selection: [], mode: 'preview', activity: 'viewing', at: Date.now() };
  }
  get enabled() { return this.status.phase !== 'off'; }
  get writable() { return this.enabled && this.status.phase !== 'blocked' && this.status.role !== 'viewer'; }
  getStatus = () => this.status;
  getRevision = () => this.revision;
  getPeers = () => [...this.peers.values()];
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribePresence = (listener: () => void) => { this.presenceListeners.add(listener); return () => { this.presenceListeners.delete(listener); }; };
  subscribeRevision = (listener: (revision: CanvasV2ArtifactRevision) => void) => { this.revisionListeners.add(listener); return () => { this.revisionListeners.delete(listener); }; };
  private update(next: Partial<CollaborationStatus>) {
    const status = { ...this.status, ...next, pending: this.pending.length };
    const same = (Object.keys(status) as Array<keyof CollaborationStatus>).every(key => {
      const before = this.status[key], after = status[key];
      return before === after || (Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every((item, index) => item === after[index]));
    });
    if (same) return;
    this.status = status; for (const listener of this.listeners) listener();
  }
  private async journal() {
    const signature=this.pending.map(operation=>operation.id).join('|')+':'+(this.status.recovery?.revision.id??'');
    if(signature===this.journalSignature)return;
    try { await this.options.saveJournal?.({ pending: this.pending.map(op => ({ ...op, changes: op.changes.map(change => ({ ...change })) })), recovery: this.status.recovery }); this.journalSignature=signature; }
    catch { this.update({ error: 'Your changes are in memory, but local recovery storage is unavailable. Keep this tab open until they are saved.' }); }
  }
  async connect(): Promise<boolean> {
    const room = await this.transport.read(); if (!room) return false;
    await this.start(room); return true;
  }
  async enable(revision: CanvasV2ArtifactRevision) {
    revision = { ...revision, document: normalizeCanvasV2NativeGeometryDocument(revision.document) };
    const seed: CanvasV2ArtifactRevision = { schema: revision.schema, id: revision.id, state: 'committed', createdAt: revision.createdAt, document: { html: '', css: '' }, evidence: [] };
    const room = await this.transport.enable(sharedCellsFromRevision(revision), seed);
    await this.start(room, revision);
  }
  private async start(room: SharedRoom, existing?: CanvasV2ArtifactRevision) {
    this.accepted = new Map(room.cells); this.visible = new Map(room.cells); this.version = room.version;
    this.revision = existing ?? room.seed; this.pending = [];
    if (existing) this.material.set(existing.id, new Map(room.cells));
    let saved: CollaborationJournal | undefined;
    try { saved = await this.options.loadJournal?.(); }
    catch { this.update({ error: "Local recovery storage is unavailable. Keep this tab open until your edits are saved." }); }
    this.pending = saved?.pending.filter(op => op.clientId === this.clientId) ?? [];
    // A response may have been lost immediately before reload. Replaying the
    // same operation identity asks the durable log for its original receipt;
    // comparing only its old field hashes would invent a conflict with itself.
    if (this.pending.length && room.role !== 'viewer') {
      let acknowledged = false;
      for (const operation of [...this.pending]) {
        try {
          const result = await this.transport.commit(operation);
          if (!result.ok) break;
          this.pending = this.pending.filter(item => item.id !== operation.id); acknowledged = true;
        } catch { break; }
      }
      if (acknowledged) {
        const latest = await this.transport.read();
        if (latest) { room = latest; this.accepted = new Map(room.cells); this.visible = new Map(room.cells); this.version = room.version; }
      }
    }
    this.update({ phase: 'connecting', role: room.role, members: room.members, recovery: saved?.recovery });
    await this.rebase(true);
    this.watchStop?.();
    this.watchStop = this.transport.watch(this.clientId, event => {
      if (event.kind === 'changed') { void this.sync(); return; }
      if (event.kind === 'leave') { this.peers.delete(event.clientId); this.emitPresence(); return; }
      const peer = parsePeerPresence(event.value);
      if (!peer || peer.clientId === this.clientId) return;
      const member = this.status.members.find(member => member.userId === peer.userId);
      if (!member) { void this.refreshMembers(); return; }
      const previous = this.peers.get(peer.clientId);
      if (previous && peer.sequence <= previous.sequence) return;
      this.peers.set(peer.clientId, { ...peer, name: member.name }); this.emitPresence();
    });
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.expirePresence();
      if (Date.now() - this.lastHeartbeat > 4000) this.publishPresence();
      // Cursor traffic must never postpone authorization or durable catch-up.
      if (Date.now() - this.lastSync > 4000) void this.sync();
      if (Date.now() - this.lastMembers > 4000) void this.refreshMembers();
      if (this.claims.length && Date.now() - this.lastClaim > 7000) void this.claim(this.claims);
    }, 1000);
    this.update({ phase: 'live', error: undefined }); this.publishPresence(); void this.sync();
  }
  async refreshMembers(force = false) {
    if (!force && Date.now() - this.lastMembers < 1500) return;
    this.lastMembers = Date.now();
    try {
      const members = await this.transport.members();
      const same = members.length === this.status.members.length && members.every(member => this.status.members.some(previous => previous.userId === member.userId && previous.name === member.name && previous.role === member.role));
      // Owner authority comes from the room read, not its editor membership
      // row. Other users must adopt role changes before another edit queues.
      const role = this.status.role === 'owner' ? 'owner' : members.find(member => member.userId === this.userId)?.role ?? 'viewer';
      if (!same || role !== this.status.role) this.update({ members: same ? this.status.members : members, role });
      if (role === 'viewer' && this.claims.length) void this.claim([]);
      for (const [id, peer] of this.peers) if (!members.some(member => member.userId === peer.userId)) this.peers.delete(id);
      this.emitPresence();
    }
    catch { /* The next durable sync determines whether access was removed. */ }
  }
  observe(revision: CanvasV2ArtifactRevision, label = 'Edited canvas'): Promise<void> {
    if (!this.enabled || this.known.has(revision.id) || this.closed) return Promise.resolve();
    // Capture call-time bytes before any hashing/network await.
    const cells = sharedCellsFromRevision(revision);
    this.observing = this.observing.then(async () => {
      if (this.known.has(revision.id)) return;
      if (!this.writable) { this.update({ error: 'This canvas is view-only.' }); return; }
      // A remote update can arrive between a local synchronous edit and its
      // React effect. Diff against the edit's real parent, not a newer peer
      // document, or an old local render could accidentally reverse that peer.
      const basis = this.material.get(revision.parentId ?? '') ?? this.visible;
      const changes = await diffSharedCells(basis, cells);
      if (!changes.length) { this.revision = revision; this.remember(revision.id, cells); return; }
      const sameBasis = basis.size === this.visible.size && [...basis].every(([key, value]) => this.visible.get(key) === value);
      this.revision = revision; if (sameBasis) this.visible = cells; this.remember(revision.id, cells);
      this.pending.push({ id: crypto.randomUUID(), clientId: this.clientId, changes, label: label.slice(0, 160) });
      this.redoHistory = []; this.update({ error: undefined }); await this.rebase(); void this.sync();
    }).catch(error => this.update({ error: error instanceof Error ? error.message : 'The shared edit could not be prepared.' }));
    return this.observing;
  }
  private remember(id: string, cells?: SharedCells) { this.known.add(id); if (cells) this.material.set(id, cells); if (this.known.size > 300) this.known.delete(this.known.values().next().value!); if (this.material.size > 20) this.material.delete(this.material.keys().next().value!); }
  private emitRevision(cells: SharedCells) {
    if (!this.revision) return;
    const revision = revisionFromSharedCells(cells, this.revision, `collab-${this.version}-${crypto.randomUUID()}`);
    this.revision = revision; this.remember(revision.id, cells);
    for (const listener of this.revisionListeners) listener(revision);
  }
  private recoverPending(label: string) {
    if (!this.revision) return;
    const previous = this.status.recovery;
    const merged = new Map<string, CellChange>();
    // Keep the earliest guard and latest human value for every field. Recovery
    // is a separate branch; these after-values never overwrite accepted work.
    for (const change of [...previous?.changes ?? [], ...this.pending.flatMap(operation => operation.changes)]) {
      const first = merged.get(change.key);
      merged.set(change.key, { ...change, before: first ? first.before : change.before });
    }
    const changes = [...merged.values()];
    let revision = this.revision;
    try { revision = revisionFromSharedCells(applySharedChanges(this.accepted, changes), revision, `recovery-${crypto.randomUUID()}`); }
    catch { revision = { ...revision, id: `recovery-${crypto.randomUUID()}` }; }
    // Older journals and explicit retained revisions may not have a field delta.
    // Preserve those whole branches rather than guessing a diff against peers.
    const alternatives = [...previous?.alternatives ?? []];
    if (previous && !previous.changes?.length) alternatives.push({ label: previous.label, revision: previous.revision, at: previous.at });
    this.update({ recovery: { label, revision, changes, at: Date.now(), ...(alternatives.length ? { alternatives } : {}) } });
  }
  private async rebase(force = false) {
    let next = new Map(this.accepted); const retained: SharedOperation[] = [];
    let conflicted = false;
    for (const operation of this.pending) {
      const conflicts = await conflictingSharedCells(next, operation.changes);
      if (conflicts.length) {
        conflicted = true;
      } else { next = applySharedChanges(next, operation.changes); retained.push(operation); }
    }
    if (conflicted) {
      this.recoverPending(this.pending.length > 1 ? `Recovered ${this.pending.length} unsaved edits` : this.pending[0].label);
      this.update({ error: 'A teammate changed the same element. Your version is kept in recovery; their changes were preserved.' });
    }
    this.pending = retained;
    const changed = next.size !== this.visible.size || [...next].some(([key, value]) => this.visible.get(key) !== value);
    this.visible = next; this.update({}); await this.journal();
    if (force || changed) this.emitRevision(next);
  }
  async sync(): Promise<void> {
    if (this.pumping) return this.pumping;
    if (!this.enabled || this.closed || this.status.phase === 'blocked') return;
    this.lastSync = Date.now();
    this.pumping = (async () => {
      try {
        await this.observing;
        for (let round = 0; round < 30 && !this.closed; round++) {
          const operations = await this.transport.since(this.version);
          for (const operation of operations) {
            if (operation.version <= this.version) continue;
            if (operation.version !== this.version + 1) throw new Error('The connection is catching up.');
            const local = this.pending.find(item => item.id === operation.id);
            const previous = this.accepted;
            this.accepted = applySharedChanges(this.accepted, operation.changes); this.version = operation.version;
            if (local) {
              this.pending = this.pending.filter(item => item.id !== local.id);
              const intent = this.historyIntent.get(local.id); this.historyIntent.delete(local.id);
              if (!intent) {
                const inverse = await diffSharedCells(this.accepted, previous);
                this.undoHistory.push({ original: operation.changes, inverse });
              }
            }
          }
          await this.rebase();
          if (operations.length === 100) continue;
          const operation = this.pending[0]; if (!operation) break;
          const result = await this.transport.commit(operation);
          if (!result.ok) {
            // Pull the accepted peer edit before deciding what can be rebased.
            const room = await this.transport.read(); if (!room) throw new Error('The shared canvas is unavailable.');
            this.accepted = room.cells; this.version = room.version; this.update({ role: room.role, members: room.members });
            this.recoverPending(operation.label);
            this.pending.shift();
            this.update({ error: 'This element changed or is being edited by a teammate. Your version is kept in recovery.' });
            await this.rebase(true); break;
          }
          this.transport.notify(); // Only a sequence hint, never document data.
        }
        this.update({ phase: 'live', error: undefined });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection interrupted.';
        const denied = /access denied|permission denied|JWT|not authenticated|view-only/i.test(message);
        this.update({ phase: denied ? 'blocked' : 'reconnecting', error: denied ? 'Your access to this canvas changed. Your unsent work is kept on this device.' : 'Reconnecting. Your unsent changes are kept on this device.' });
        if (denied) { this.watchStop?.(); this.watchStop = undefined; this.peers.clear(); this.emitPresence(); }
        await this.journal();
      }
    })().finally(() => { this.pumping = undefined; });
    return this.pumping;
  }
  async undo(): Promise<boolean> { return this.history('undo'); }
  async redo(): Promise<boolean> { return this.history('redo'); }
  private async history(direction: 'undo' | 'redo'): Promise<boolean> {
    await this.observing; await this.sync();
    if (!this.writable || this.pending.length) { this.update({ error: 'Wait for your edits to finish saving before using undo.' }); return false; }
    const from = direction === 'undo' ? this.undoHistory : this.redoHistory, to = direction === 'undo' ? this.redoHistory : this.undoHistory;
    const entry = from.at(-1); if (!entry) return false;
    const changes = direction === 'undo' ? entry.inverse : entry.original;
    if ((await conflictingSharedCells(this.visible, changes)).length) { this.update({ error: 'A teammate changed this element after your edit. Undo would overwrite their work.' }); return false; }
    const id = crypto.randomUUID(); from.pop(); to.push(entry); this.historyIntent.set(id, direction);
    this.pending.push({ id, clientId: this.clientId, label: direction === 'undo' ? 'Undid my edit' : 'Redid my edit', changes });
    this.visible = applySharedChanges(this.visible, changes); this.emitRevision(this.visible); this.update({}); await this.journal(); void this.sync(); return true;
  }
  canUndo() { return this.undoHistory.length > 0; }
  canRedo() { return this.redoHistory.length > 0; }
  pointer(cursor: PeerPresence['cursor']) {
    this.local.cursor = cursor;this.queuePresence(cursor===null);
  }
  private queuePresence(immediate=false) {
    clearTimeout(this.pointerTimer);
    const remaining = 40 - (Date.now() - this.lastPointer);
    const publish = () => { this.pointerTimer=undefined;this.lastPointer=Date.now();this.publishPresence(); };
    // Always deliver the final position of a burst, even when the pointer stops
    // between throttle slots. Heartbeats are not a cursor animation clock.
    if(!immediate&&remaining>0)this.pointerTimer=setTimeout(publish,remaining);else publish();
  }
  view(view:PeerView) {
    if(!validPeerView(view))return;
    const before=this.local.view;if(before&&before.x===view.x&&before.y===view.y&&before.width===view.width&&before.height===view.height)return;
    this.local.view={x:view.x,y:view.y,width:view.width,height:view.height};this.queuePresence();
  }
  follow(clientId?:string):boolean {
    if(clientId!==undefined){
      if(!clientId||clientId.length>80||clientId===this.clientId||!this.peers.has(clientId))return false;
      const visited=new Set([this.clientId]);let next:string|undefined=clientId;
      while(next){if(visited.has(next))return false;visited.add(next);next=this.peers.get(next)?.following;}
    }
    if(this.local.following!==clientId){this.local.following=clientId;this.publishPresence();}
    return true;
  }
  selection(selection: PeerSelection[], mode: PeerPresence['mode'], activity: PeerPresence['activity']) {
    this.local.selection = selection.slice(0, 24); this.local.mode = mode; this.local.activity = activity;
    this.publishPresence();
    const ids = selection.map(item => encodeSharedId(item.nodeId));
    if (this.writable && ids.join('|') !== this.claims.join('|')) void this.claim(ids);
  }
  motion(motion?: PeerSelection[]) { this.local.motion = motion?.slice(0, 24); if (Date.now() - this.lastPointer >= 40 || !motion) { this.lastPointer = Date.now(); this.publishPresence(); } }
  private async claim(ids: string[]) {
    this.claims = ids; this.lastClaim = Date.now();
    try { const result = await this.transport.claim(this.clientId, ids); this.update({ busyObjects: result.busy.map(id => { try { return decodeURIComponent(id); } catch { return id; } }) }); }
    catch { /* Durable CAS remains authoritative during a transient disconnect. */ }
  }
  private publishPresence() { if (!this.enabled || this.closed || this.status.phase === 'blocked') return; this.local.sequence++; this.local.at = Date.now(); this.lastHeartbeat = Date.now(); this.transport.presence({ ...this.local }); }
  private emitPresence() { for (const listener of this.presenceListeners) listener(); }
  expirePresence(now = Date.now()) { let changed = false; for (const [id, peer] of this.peers) if (now - peer.at > 12000) { this.peers.delete(id); changed = true; } if (changed) this.emitPresence(); }
  retainLocalRevision(revision: CanvasV2ArtifactRevision, label: string) {
    const previous=this.status.recovery;
    const alternatives=previous?[...previous.alternatives??[],{label:previous.label,revision:previous.revision,changes:previous.changes,at:previous.at}]:[];
    this.update({ recovery: { revision, label, at: Date.now(),...(alternatives.length?{alternatives}:{}) } }); void this.journal();
  }
  dismissRecovery() { this.update({ recovery: undefined, error: undefined }); void this.journal(); }
  close() { this.closed = true; clearTimeout(this.pointerTimer); clearInterval(this.timer); this.watchStop?.(); this.watchStop = undefined; void this.transport.claim(this.clientId, []).catch(() => {}); this.peers.clear(); this.emitPresence(); }
}
