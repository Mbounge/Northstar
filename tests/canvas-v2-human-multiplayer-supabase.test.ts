import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseCanvasTransport } from '../lib/canvas-v2/sessions/collaboration-supabase';
import type { PeerPresence } from '../lib/canvas-v2/sessions/collaboration-client';
import type { CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';

const sid = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const seed = { schema: 1, id: 'seed', state: 'committed', createdAt: 1, document: { html: '', css: '' }, evidence: [] } as unknown as CanvasV2ArtifactRevision;
const presence = (sequence: number): PeerPresence => ({ clientId, userId: 'user', name: 'Peer', sequence, cursor: { x: sequence, y: 20 }, selection: [], mode: 'design', activity: 'editing', at: sequence });
class Channel {
  handlers: Array<{type: string; event: string; callback: (payload: never) => void}> = [];
  status?: (status: string) => void;
  subscriptions = 0;
  tracked: PeerPresence[] = [];
  sent: unknown[] = [];
  state: Record<string, PeerPresence[]> = {};
  on(type: string, filter: {event: string}, callback: (payload: never) => void) { this.handlers.push({type, event: filter.event, callback}); return this; }
  subscribe(callback: (status: string) => void) { this.subscriptions++; this.status = callback; return this; }
  track(value: PeerPresence) { this.tracked.push(structuredClone(value)); return Promise.resolve('ok'); }
  send(value: unknown) { this.sent.push(value); return Promise.resolve('ok'); }
  presenceState() { return this.state; }
  emit(type: string, event: string, value: unknown = {}) { for (const handler of this.handlers) if (handler.type === type && handler.event === event) handler.callback(value as never); }
}
function fixture() {
  const calls: Array<{name: string; args: unknown}> = [], channels: Channel[] = [], configs: unknown[] = [], removed: Channel[] = [];
  let response: {data: unknown; error: null | {message: string; code?: string}} = { data: null, error: null };
  const db = {
    rpc: async (name: string, args: unknown) => { calls.push({name,args}); return response; },
    channel: (name: string, config: unknown) => { const channel = new Channel(); channels.push(channel); configs.push({name,config}); return channel; },
    removeChannel: async (channel: Channel) => { removed.push(channel); },
    from: (table: string) => ({ select: (columns: string) => ({ eq: async (key: string, value: string) => { calls.push({name: 'select', args: {table,columns,key,value}}); return response; } }) }),
  };
  const transport = new SupabaseCanvasTransport(sid, db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  return { db, transport, calls, channels, configs, removed, respond(data: unknown, error: typeof response.error = null) { response = {data,error}; } };
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('production transport uses exact durable SQL RPC argument and JSON contracts', async () => {
  const f = fixture();
  f.respond({version: 7, cells: {'document:html':'[]'}, seed, ownerId: 'user', role: 'editor', members: []});
  assert.equal((await f.transport.read())?.cells.get('document:html'), '[]');
  assert.equal((await f.transport.enable(new Map([['document:html','[]']]), seed)).version, 7);
  const operation = {id: 'op', clientId, label: 'Edit', changes: [{key:'document:css',before:null,after:'body{}'}]};
  f.respond({ok:true,version:8}); assert.deepEqual(await f.transport.commit(operation), {ok:true,version:8});
  f.respond([]); await f.transport.since(7);
  f.respond({busy:['encoded']}); assert.deepEqual(await f.transport.claim(clientId,['encoded']),{busy:['encoded']});
  f.respond({id:'invitation',token:'token'}); await f.transport.invite('viewer');
  f.respond(null); await f.transport.removeMember('member'); await f.transport.revokeInvite('invitation');
  f.respond(sid); assert.equal(await f.transport.redeem('token'),sid);
  assert.deepEqual(f.calls,[
    {name:'northstar_canvas_read',args:{sid}},
    {name:'northstar_canvas_enable',args:{sid,initial_cells:{'document:html':'[]'},initial_seed:seed}},
    {name:'northstar_canvas_commit',args:{sid,oid:'op',cid:clientId,edits:operation.changes,summary:'Edit'}},
    {name:'northstar_canvas_operations_since',args:{sid,since_version:7}},
    {name:'northstar_canvas_claim',args:{sid,cid:clientId,objects:['encoded']}},
    {name:'northstar_canvas_invite',args:{sid,access_role:'viewer'}},
    {name:'northstar_canvas_remove_member',args:{sid,member_id:'member'}},
    {name:'northstar_canvas_revoke_invite',args:{sid,invite_id:'invitation'}},
    {name:'northstar_canvas_join',args:{token:'token'}},
  ]);
});

test('legacy missing RPC is optional while authentication and database errors remain visible', async () => {
  const f=fixture();
  f.respond(null,{message:'Could not find the function public.northstar_canvas_read(sid) in the schema cache',code:'PGRST202'});
  assert.equal(await f.transport.read(),null);
  for (const message of ['Canvas access denied','JWT expired','Connection interrupted']) {
    f.respond(null,{message}); await assert.rejects(f.transport.read(),{message});
  }
});

test('membership rows map SQL column names into authenticated member identities',async()=>{
  const f=fixture(); f.respond([{user_id:'member',display_name:'Teammate',role:'viewer'}]);
  assert.deepEqual(await f.transport.members(),[{userId:'member',name:'Teammate',role:'viewer'}]);
  assert.deepEqual(f.calls,[{name:'select',args:{table:'northstar_canvas_members',columns:'user_id,display_name,role',key:'session_id',value:sid}}]);
});

test('realtime uses private per-room channel and only awareness or refresh signals',async()=>{
  const f=fixture(), signals: unknown[]=[];
  f.transport.presence(presence(1));
  const stop=f.transport.watch(clientId,signal=>signals.push(signal)); await settle(); const channel=f.channels[0];
  assert.deepEqual(f.configs,[{name:`northstar-canvas:${sid}`,config:{config:{private:true,presence:{key:clientId},broadcast:{self:false,ack:false}}}}]);
  channel.status?.('SUBSCRIBED'); assert.deepEqual(channel.tracked,[presence(1)]);
  channel.emit('broadcast','changed',{payload:{document:'must not be trusted'}});
  channel.emit('broadcast','awareness',{payload:presence(2)});
  channel.state={peer:[presence(3)]}; channel.emit('presence','sync');
  channel.emit('presence','leave',{key:'peer'});
  assert.deepEqual(signals,[{kind:'changed'},{kind:'changed'},{kind:'presence',value:presence(2)},{kind:'presence',value:presence(3)},{kind:'leave',clientId:'peer'}]);
  stop(); f.transport.notify(); await settle(); assert.deepEqual(f.removed,[channel]); assert.equal(channel.sent.length,0);
});

test('presence refresh makes the current cursor and selection available to a newly joining peer',async(context)=>{
  let now=10000; context.mock.method(Date,'now',()=>now);
  const f=fixture(); f.transport.watch(clientId,()=>{}); await settle(); const channel=f.channels[0]; channel.status?.('SUBSCRIBED');
  f.transport.presence(presence(1)); now+=2100; f.transport.presence(presence(2));
  assert.deepEqual(channel.tracked.at(-1),presence(2),'presenceState must retain the current state, not the first state');
  channel.status?.('CHANNEL_ERROR'); f.transport.presence(presence(3)); channel.status?.('SUBSCRIBED');
  assert.deepEqual(channel.tracked.at(-1),presence(3),'rejoining must track the newest offline presence');
});

test('replaced watch ignores stale channel status and cleanup',async()=>{
  const f=fixture(); const oldSignals: unknown[]=[];
  const stopOld=f.transport.watch(clientId,event=>oldSignals.push(event)); await settle(); f.channels[0].status?.('SUBSCRIBED');
  f.transport.watch(clientId,()=>{}); await settle(); f.channels[1].status?.('SUBSCRIBED');
  stopOld(); f.channels[0].status?.('CLOSED'); f.transport.presence(presence(1)); f.transport.notify();
  assert.equal(f.channels[1].sent.length,2,'old cleanup must not suppress the active watch');
  const count=oldSignals.length; f.channels[0].emit('broadcast','changed'); assert.equal(oldSignals.length,count,'old listeners must not signal after teardown');
});

test('replacement waits for asynchronous teardown because Supabase reuses a closing same-topic channel',async()=>{
  const f=fixture(), create=f.db.channel;
  let release:()=>void=()=>{};
  const teardown=new Promise<void>(resolve=>{release=resolve;}); let closed=false;
  f.db.channel=(name,config)=>f.channels.length&&!closed?f.channels[0]:create(name,config);
  f.db.removeChannel=async(channel)=>{await teardown;closed=true;f.removed.push(channel);};
  const stop=f.transport.watch(clientId,()=>{}); await settle(); f.channels[0].status?.('SUBSCRIBED');
  stop(); f.transport.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'a closing channel cannot be subscribed a second time');
  release(); await settle(); assert.equal(f.channels.length,2,'create a fresh same-topic channel after unsubscribe settles');
  f.channels[1].status?.('SUBSCRIBED'); f.transport.presence(presence(1));
  assert.equal(f.channels[1].sent.length,1);
});

test('a remounted workspace transport also waits for the singleton database channel teardown',async()=>{
  const f=fixture(), create=f.db.channel;
  let release:()=>void=()=>{};
  const teardown=new Promise<void>(resolve=>{release=resolve;}); let closed=false;
  f.db.channel=(name,config)=>f.channels.length&&!closed?f.channels[0]:create(name,config);
  f.db.removeChannel=async(channel)=>{await teardown;closed=true;f.removed.push(channel);};
  const stop=f.transport.watch(clientId,()=>{}); await settle(); f.channels[0].status?.('SUBSCRIBED');
  stop();
  const replacement=new SupabaseCanvasTransport(sid,f.db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  replacement.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'new transport must not reuse its predecessor’s closing same-topic channel');
  release(); await settle(); assert.equal(f.channels.length,2);
  f.channels[1].status?.('SUBSCRIBED'); replacement.presence(presence(2));
  assert.deepEqual(f.channels[1].tracked.at(-1),presence(2));
});

test('overlapping workspace boots supersede an active singleton channel before subscribing again',async()=>{
  const f=fixture(), create=f.db.channel;
  let release:()=>void=()=>{};
  const teardown=new Promise<void>(resolve=>{release=resolve;}); let closed=false;
  f.db.channel=(name,config)=>f.channels.length&&!closed?f.channels[0]:create(name,config);
  f.db.removeChannel=async(channel)=>{await teardown;closed=true;f.removed.push(channel);};
  const stopOld=f.transport.watch(clientId,()=>{}); await settle(); f.channels[0].status?.('SUBSCRIBED');
  const replacement=new SupabaseCanvasTransport(sid,f.db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  replacement.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'overlapping connect completions must not subscribe an already-active same-topic channel');
  release(); await settle(); assert.equal(f.channels.length,2);
  stopOld(); f.channels[1].status?.('SUBSCRIBED'); replacement.presence(presence(2));
  assert.deepEqual(f.channels[1].tracked.at(-1),presence(2),'late disposal of the superseded boot must not close the current channel');
});
