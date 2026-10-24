'use client';
import { createClient } from '@/lib/supabase/client';
import type { CanvasV2ArtifactRevision } from '../types';
import type { AcceptedOperation, SharedCells, SharedOperation } from './collaboration-document';
import type { CanvasMember, CollaborationTransport, PeerPresence, SharedRoom } from './collaboration-client';

type Database = ReturnType<typeof createClient>;
// Browser auth clients are singletons; StrictMode creates transport instances
// independently, so their same-topic teardown must share one lifecycle gate.
const channelTeardowns = new WeakMap<object, Map<string, Promise<unknown>>>();
const channelOwners = new WeakMap<object, Map<string, () => void>>();
function failure(error: { message: string; code?: string }): Error { return new Error(error.message); }
function room(value: unknown): SharedRoom | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('The shared canvas returned an invalid state.');
  const input = value as { version: number; cells: Record<string, string>; seed: CanvasV2ArtifactRevision; ownerId: string; role: SharedRoom['role']; members: CanvasMember[] };
  if (!Number.isSafeInteger(input.version) || !input.cells || typeof input.cells !== 'object' || !['owner', 'editor', 'viewer'].includes(input.role) || !input.seed) throw new Error('The shared canvas returned an invalid state.');
  return { ...input, cells: new Map(Object.entries(input.cells)) };
}
/** Private, authenticated realtime carries awareness and sequence hints only.
 * Every document read/write is separately authorized by the durable RPCs. */
export class SupabaseCanvasTransport implements CollaborationTransport {
  private channel?: ReturnType<Database['channel']>;
  private joined = false;
  private latest?: PeerPresence;
  private tracked = false;
  private teardown?: Promise<unknown>;
  constructor(readonly sessionId: string, private db: Database = createClient()) {}
  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.db.rpc(name, args); if (result.error) throw failure(result.error); return result.data as T;
  }
  async read() {
    try {
      const value = room(await this.rpc('northstar_canvas_read', { sid: this.sessionId }));
      return value ? { ...value, members: await this.members() } : null;
    }
    catch (error) { if (error instanceof Error && /Could not find the function|does not exist.*northstar_canvas_read/i.test(error.message)) return null; throw error; }
  }
  async enable(cells: SharedCells, seed: CanvasV2ArtifactRevision) {
    const value = room(await this.rpc('northstar_canvas_enable', { sid: this.sessionId, initial_cells: Object.fromEntries(cells), initial_seed: seed }))!;
    return { ...value, members: await this.members() };
  }
  commit(operation: SharedOperation) { return this.rpc<{ ok: boolean; version: number; conflicts?: string[] }>('northstar_canvas_commit', { sid: this.sessionId, oid: operation.id, cid: operation.clientId, edits: operation.changes, summary: operation.label }); }
  since(version: number) { return this.rpc<AcceptedOperation[]>('northstar_canvas_operations_since', { sid: this.sessionId, since_version: version }); }
  claim(clientId: string, objectIds: string[]) { return this.rpc<{ busy: string[] }>('northstar_canvas_claim', { sid: this.sessionId, cid: clientId, objects: objectIds }); }
  async members(): Promise<CanvasMember[]> {
    const result = await this.db.from('northstar_canvas_members').select('user_id,display_name,role,joined_at').eq('session_id', this.sessionId);
    if (result.error) throw failure(result.error);
    return (result.data ?? []).map(member => ({ userId: member.user_id, name: member.display_name, role: member.role, ...(member.joined_at ? { joinedAt: member.joined_at } : {}) }));
  }
  watch(clientId: string, onSignal: Parameters<CollaborationTransport['watch']>[1]) {
    let owned: ReturnType<Database['channel']> | undefined, cancelled = false;
    let retryTimer:ReturnType<typeof setTimeout>|undefined,stableTimer:ReturnType<typeof setTimeout>|undefined,retries=0;
    const retire=(channel:ReturnType<Database['channel']>)=>{
      if(owned===channel)owned=undefined;
      if(this.channel===channel){this.joined=false;this.channel=undefined;}
      const teardown=Promise.resolve(this.db.removeChannel(channel)).catch(()=>{});
      this.teardown=teardown;
      let topics=channelTeardowns.get(this.db);if(!topics){topics=new Map();channelTeardowns.set(this.db,topics);}
      topics.set(this.sessionId,teardown);
      void teardown.finally(()=>{if(this.teardown===teardown)this.teardown=undefined;if(topics.get(this.sessionId)===teardown)topics.delete(this.sessionId);});
      return teardown;
    };
    const start = () => {
      if (cancelled) return;
      const channel = this.db.channel(`northstar-canvas:${this.sessionId}`, { config: { private: true, presence: { key: clientId }, broadcast: { self: false, ack: false } } });
      owned = channel; this.channel = channel; this.joined = false; this.tracked = false;
      const current = () => !cancelled && this.channel === channel;
      channel.on('broadcast', { event: 'changed' }, () => { if(current())onSignal({ kind: 'changed' }); });
      channel.on('broadcast', { event: 'awareness' }, ({ payload }) => { if(current())onSignal({ kind: 'presence', value: payload }); });
      channel.on('presence', { event: 'sync' }, () => {
        if(!current())return;
        for (const states of Object.values(channel.presenceState())) for (const state of states) onSignal({ kind: 'presence', value: state });
      });
      channel.on('presence', { event: 'leave' }, ({ key }) => { if(current())onSignal({ kind: 'leave', clientId: key }); });
      channel.subscribe(status => {
        if (!current()) return;
        this.joined = status === 'SUBSCRIBED';
        if (this.joined) {
          clearTimeout(stableTimer);stableTimer=setTimeout(()=>{retries=0;},30000);
          if (this.latest) { this.tracked = true; void channel.track(this.latest); }
          onSignal({ kind: 'changed' });
        } else {
          clearTimeout(stableTimer);
          // The SDK retries channel errors, but an unexpected CLOSED channel
          // is removed permanently. Recreate it with bounded backoff and the
          // same teardown gate; deliberate cleanup must never resurrect it.
          if(status==='CLOSED'&&!retryTimer){
            const pending=retire(channel);
            retryTimer=setTimeout(()=>{retryTimer=undefined;void pending.then(()=>{if(!cancelled)start();});},Math.min(30000,1000*2**Math.min(retries++,5)));
          }
        }
      });
    };
    let owners=channelOwners.get(this.db);
    if(!owners){owners=new Map();channelOwners.set(this.db,owners);}
    const stop = () => {
      if(cancelled)return;
      cancelled=true;
      clearTimeout(retryTimer);clearTimeout(stableTimer);
      if(owners.get(this.sessionId)===stop)owners.delete(this.sessionId);
      if(!owned)return;
      void retire(owned);
    };
    // Async StrictMode boots can overlap before the old boot notices disposal.
    // Supersede its subscription before the SDK can reuse an active topic.
    owners.get(this.sessionId)?.();owners.set(this.sessionId,stop);
    // realtime-js reuses a channel with the same topic until unsubscribe ends.
    const pending=channelTeardowns.get(this.db)?.get(this.sessionId)??this.teardown;
    if(pending)void pending.then(start,start);else start();
    return stop;
  }
  presence(value: PeerPresence) {
    this.latest = value;
    if (!this.joined || !this.channel) return;
    // Register membership once per subscription. Hosted Presence has a much
    // lower per-client budget than Broadcast; even a periodic track heartbeat
    // closes the channel. Broadcast carries all changing awareness/heartbeats.
    if (!this.tracked) { this.tracked = true; void this.channel.track(value); }
    void this.channel.send({ type: 'broadcast', event: 'awareness', payload: value });
  }
  notify() { if (this.joined) void this.channel?.send({ type: 'broadcast', event: 'changed', payload: { updated: true } }); }
  invite(role: 'viewer' | 'editor') { return this.rpc<{ id: string; token: string }>('northstar_canvas_invite', { sid: this.sessionId, access_role: role }); }
  removeMember(userId: string) { return this.rpc<void>('northstar_canvas_remove_member', { sid: this.sessionId, member_id: userId }); }
  revokeInvite(id: string) { return this.rpc<void>('northstar_canvas_revoke_invite', { sid: this.sessionId, invite_id: id }); }
  async redeem(token: string) { return this.rpc<string>('northstar_canvas_join', { token }); }
}

/** The recovery journal is per account, room and tab; never a shared snapshot. */
export function canvasCollaborationJournal(key: string) {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('northstar-collaboration-recovery', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('journals'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return {
    loadJournal: async () => {
      const db = await open();
      return new Promise<import('./collaboration-client').CollaborationJournal | undefined>((resolve, reject) => {
        const transaction = db.transaction('journals', 'readonly'), request = transaction.objectStore('journals').get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close(); transaction.onerror = () => { db.close(); reject(transaction.error); };
      });
    },
    saveJournal: async (journal: import('./collaboration-client').CollaborationJournal) => {
      const db = await open();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('journals', 'readwrite');
        if (!journal.pending.length && !journal.recovery) transaction.objectStore('journals').delete(key); else transaction.objectStore('journals').put(journal, key);
        transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { db.close(); reject(transaction.error); }; transaction.onabort = () => { db.close(); reject(transaction.error); };
      });
    },
  };
}
