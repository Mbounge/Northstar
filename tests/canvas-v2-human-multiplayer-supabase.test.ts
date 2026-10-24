import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
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
  let directory: {data: unknown; error: null | {message: string; code?: string}} = {data: [], error: null};
  const db = {
    rpc: async (name: string, args: unknown) => { calls.push({name,args}); return response; },
    channel: (name: string, config: unknown) => { const channel = new Channel(); channels.push(channel); configs.push({name,config}); return channel; },
    removeChannel: async (channel: Channel) => { removed.push(channel); },
    from: (table: string) => ({ select: (columns: string) => ({ eq: async (key: string, value: string) => { calls.push({name: 'select', args: {table,columns,key,value}}); return directory; } }) }),
  };
  const transport = new SupabaseCanvasTransport(sid, db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  return { db, transport, calls, channels, configs, removed, respondMembers(data: unknown) { directory = { data, error: null }; }, respond(data: unknown, error: typeof response.error = null) { response = {data,error}; } };
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

/** Native timeout semantics without version-specific Node MockTimers APIs. */
function timeouts(context: TestContext) {
  let now = 0, next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  context.mock.method(globalThis, 'setTimeout', ((callback: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) => {
    const id = next++; pending.set(id, { at: now + delay, run: () => callback(...args) }); return id;
  }) as unknown as typeof setTimeout);
  context.mock.method(globalThis, 'clearTimeout', ((id: unknown) => { pending.delete(Number(id)); }) as typeof clearTimeout);
  return { tick(ms: number) {
    const target = now + ms;
    for (;;) {
      const first = [...pending].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!first || first[1].at > target) break;
      now = first[1].at; pending.delete(first[0]); first[1].run();
    }
    now = target;
  } };
}


test('production transport uses exact durable SQL RPC argument and JSON contracts', async () => {
  const f = fixture();
  f.respond({version: 7, cells: {'document:html':'[]'}, seed, ownerId: 'user', role: 'editor', members: []});
  f.respondMembers([{user_id:'user',display_name:'Owner',role:'editor',joined_at:'2026-10-20T00:00:00Z'}]);
  const initial = await f.transport.read();
  assert.equal(initial?.cells.get('document:html'), '[]');
  assert.equal(initial?.members[0].joinedAt, '2026-10-20T00:00:00Z');
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
    {name:'select',args:{table:'northstar_canvas_members',columns:'user_id,display_name,role,joined_at',key:'session_id',value:sid}},
    {name:'northstar_canvas_enable',args:{sid,initial_cells:{'document:html':'[]'},initial_seed:seed}},
    {name:'select',args:{table:'northstar_canvas_members',columns:'user_id,display_name,role,joined_at',key:'session_id',value:sid}},
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
  const f=fixture(); f.respondMembers([{user_id:'member',display_name:'Teammate',role:'viewer',joined_at:'2026-10-20T10:00:00Z'}]);
  assert.deepEqual(await f.transport.members(),[{userId:'member',name:'Teammate',role:'viewer',joinedAt:'2026-10-20T10:00:00Z'}]);
  assert.deepEqual(f.calls,[{name:'select',args:{table:'northstar_canvas_members',columns:'user_id,display_name,role,joined_at',key:'session_id',value:sid}}]);
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

test('thirty seconds of cursor traffic and idle heartbeats stay within the presence track budget',async(context)=>{
  let now=10000; context.mock.method(Date,'now',()=>now);
  const f=fixture(); const stop=f.transport.watch(clientId,()=>{}); await settle();
  const channel=f.channels[0]; channel.status?.('SUBSCRIBED');
  for(let sequence=1;sequence<=1000;sequence++) {
    now=10000+sequence*30;
    f.transport.presence({...presence(sequence),at:now});
  }
  assert.equal(now,40000,'exercise a complete thirty-second presence quota window');
  assert.equal(channel.tracked.length,1,'cursor movement registers membership once, never retracks changing awareness');
  assert.equal(channel.sent.length,1000,'all cursor updates use broadcast');
  for(let heartbeat=1;heartbeat<=8;heartbeat++) {
    now+=4000;
    f.transport.presence({...presence(1000+heartbeat),cursor:{x:1000,y:20},at:now});
  }
  assert.equal(channel.tracked.length,1,'idle heartbeat broadcasts must not spend presence quota');
  assert.deepEqual(channel.sent.at(-1),{type:'broadcast',event:'awareness',payload:{...presence(1008),cursor:{x:1000,y:20},at:72000}});
  stop();
});

test('late join sees membership immediately and fresh awareness on the next idle broadcast',async()=>{
  const sender=fixture(); sender.transport.presence(presence(1));
  const stopSender=sender.transport.watch(clientId,()=>{}); await settle();
  const source=sender.channels[0]; source.status?.('SUBSCRIBED');
  sender.transport.presence({...presence(2),selection:[{nodeId:'object:latest',x:10,y:20,width:100,height:40}],mode:'design' as const});
  const receiver=fixture(),signals:unknown[]=[];
  const stopReceiver=receiver.transport.watch('late-peer',value=>signals.push(value)); await settle();
  const target=receiver.channels[0]; target.status?.('SUBSCRIBED');
  target.state={[clientId]:source.tracked}; target.emit('presence','sync');
  assert.deepEqual(signals.at(-1),{kind:'presence',value:presence(1)},'track state is membership, not a continuously refreshed cursor');
  const heartbeat={...presence(3),selection:[{nodeId:'object:latest',x:10,y:20,width:100,height:40}],mode:'design' as const,at:4000};
  sender.transport.presence(heartbeat);
  const broadcast=source.sent.at(-1) as {type:string;event:string;payload:PeerPresence};
  target.emit(broadcast.type,broadcast.event,{payload:broadcast.payload});
  assert.deepEqual(signals.at(-1),{kind:'presence',value:heartbeat},'a late peer receives the current selection/cursor on the next four-second heartbeat');
  assert.equal(source.tracked.length,1);
  stopSender(); stopReceiver();
});

test('SDK error and resubscribe tracks exactly the newest queued presence once per join',async()=>{
  const f=fixture(); f.transport.presence(presence(1));
  const stop=f.transport.watch(clientId,()=>{}); await settle(); const channel=f.channels[0];
  channel.status?.('SUBSCRIBED'); f.transport.presence(presence(2));
  channel.status?.('CHANNEL_ERROR');
  f.transport.presence(presence(3)); f.transport.presence(presence(4));
  assert.equal(channel.sent.length,1,'unavailable channel retains latest awareness without sending');
  assert.deepEqual(channel.tracked,[presence(1)]);
  channel.status?.('SUBSCRIBED');
  assert.deepEqual(channel.tracked,[presence(1),presence(4)],'one track for each successful subscription, using the latest offline state');
  f.transport.presence(presence(5)); f.transport.presence(presence(6));
  assert.equal(channel.tracked.length,2,'awareness after rejoin must continue using broadcast');
  assert.deepEqual(channel.sent.at(-1),{type:'broadcast',event:'awareness',payload:presence(6)});
  stop();
});

test('replaced watch ignores stale channel status and cleanup',async()=>{
  const f=fixture(); const oldSignals: unknown[]=[];
  const stopOld=f.transport.watch(clientId,event=>oldSignals.push(event)); await settle(); f.channels[0].status?.('SUBSCRIBED');
  const stopNew=f.transport.watch(clientId,()=>{}); await settle(); f.channels[1].status?.('SUBSCRIBED');
  stopOld(); f.channels[0].status?.('CLOSED'); f.transport.presence(presence(1)); f.transport.notify();
  assert.equal(f.channels[1].sent.length,2,'old cleanup must not suppress the active watch');
  const count=oldSignals.length; f.channels[0].emit('broadcast','changed'); assert.equal(oldSignals.length,count,'old listeners must not signal after teardown'); stopNew();
});

test('replacement waits for asynchronous teardown because Supabase reuses a closing same-topic channel',async()=>{
  const f=fixture(), create=f.db.channel;
  let release:()=>void=()=>{};
  const teardown=new Promise<void>(resolve=>{release=resolve;}); let closed=false;
  f.db.channel=(name,config)=>f.channels.length&&!closed?f.channels[0]:create(name,config);
  f.db.removeChannel=async(channel)=>{await teardown;closed=true;f.removed.push(channel);};
  const stop=f.transport.watch(clientId,()=>{}); await settle(); f.channels[0].status?.('SUBSCRIBED');
  stop(); const stopNew=f.transport.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'a closing channel cannot be subscribed a second time');
  release(); await settle(); assert.equal(f.channels.length,2,'create a fresh same-topic channel after unsubscribe settles');
  f.channels[1].status?.('SUBSCRIBED'); f.transport.presence(presence(1));
  assert.equal(f.channels[1].sent.length,1); stopNew();
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
  const stopNew=replacement.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'new transport must not reuse its predecessor’s closing same-topic channel');
  release(); await settle(); assert.equal(f.channels.length,2);
  f.channels[1].status?.('SUBSCRIBED'); replacement.presence(presence(2));
  assert.deepEqual(f.channels[1].tracked.at(-1),presence(2)); stopNew();
});

test('overlapping workspace boots supersede an active singleton channel before subscribing again',async()=>{
  const f=fixture(), create=f.db.channel;
  let release:()=>void=()=>{};
  const teardown=new Promise<void>(resolve=>{release=resolve;}); let closed=false;
  f.db.channel=(name,config)=>f.channels.length&&!closed?f.channels[0]:create(name,config);
  f.db.removeChannel=async(channel)=>{await teardown;closed=true;f.removed.push(channel);};
  const stopOld=f.transport.watch(clientId,()=>{}); await settle(); f.channels[0].status?.('SUBSCRIBED');
  const replacement=new SupabaseCanvasTransport(sid,f.db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  const stopNew=replacement.watch(clientId,()=>{}); await settle();
  assert.equal(f.channels[0].subscriptions,1,'overlapping connect completions must not subscribe an already-active same-topic channel');
  release(); await settle(); assert.equal(f.channels.length,2);
  stopOld(); f.channels[1].status?.('SUBSCRIBED'); replacement.presence(presence(2));
  assert.deepEqual(f.channels[1].tracked.at(-1),presence(2),'late disposal of the superseded boot must not close the current channel'); stopNew();
});


test('unexpected CLOSED waits for teardown before retrying and tracks newest awareness once',async(context)=>{
  const timers=timeouts(context);
  const f=fixture(); let release:()=>void=()=>{};
  const pending=new Promise<void>(resolve=>{release=resolve;});
  f.db.removeChannel=async channel=>{await pending;f.removed.push(channel);};
  f.transport.presence(presence(1));
  const stop=f.transport.watch(clientId,()=>{}); const first=f.channels[0]; first.status?.('SUBSCRIBED');
  first.status?.('CLOSED'); f.transport.presence(presence(2));
  timers.tick(999); await settle(); assert.equal(f.channels.length,1);
  timers.tick(1); await settle(); assert.equal(f.channels.length,1,'elapsed retry delay cannot bypass in-flight same-topic removal');
  release(); await settle(); assert.equal(f.channels.length,2);
  const second=f.channels[1]; second.status?.('SUBSCRIBED');
  assert.deepEqual(second.tracked,[presence(2)]);
  first.status?.('CLOSED'); first.status?.('SUBSCRIBED');
  f.transport.presence(presence(3));
  assert.equal(second.tracked.length,1); assert.equal(second.sent.length,1,'old callbacks cannot disturb replacement channel');
  stop(); timers.tick(60000); await settle(); assert.equal(f.channels.length,2);
});

test('stopping or superseding a CLOSED watch cancels its delayed restart',async(context)=>{
  const timers=timeouts(context);
  const f=fixture(); const stop=f.transport.watch(clientId,()=>{}); f.channels[0].status?.('SUBSCRIBED');
  f.channels[0].status?.('CLOSED'); stop();
  timers.tick(60000); await settle(); assert.equal(f.channels.length,1,'disposed watcher must never resurrect');
  const stopAgain=f.transport.watch(clientId,()=>{}); await settle(); const old=f.channels[1]; old.status?.('SUBSCRIBED'); old.status?.('CLOSED');
  const replacement=new SupabaseCanvasTransport(sid,f.db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  const stopNew=replacement.watch(clientId,()=>{}); await settle(); const current=f.channels[2]; current.status?.('SUBSCRIBED');
  timers.tick(60000); await settle(); assert.equal(f.channels.length,3,'superseded retry must not recreate an overlapping channel');
  stopAgain(); replacement.presence(presence(9)); assert.deepEqual(current.tracked,[presence(9)]);
  stopNew();
});

test('repeated terminal closures use bounded backoff and reset after a stable subscription',async(context)=>{
  const timers=timeouts(context);
  const f=fixture(); const stop=f.transport.watch(clientId,()=>{});
  for(const delay of [1000,2000,4000,8000,16000,30000,30000]) {
    const channel=f.channels.at(-1)!; channel.status?.('SUBSCRIBED'); const count=f.channels.length;
    channel.status?.('CLOSED'); await settle();
    timers.tick(delay-1); await settle(); assert.equal(f.channels.length,count);
    timers.tick(1); await settle(); assert.equal(f.channels.length,count+1);
  }
  const stable=f.channels.at(-1)!; stable.status?.('SUBSCRIBED'); timers.tick(30000);
  stable.status?.('CLOSED'); await settle(); const count=f.channels.length;
  timers.tick(1000); await settle(); assert.equal(f.channels.length,count+1,'thirty-second stable connection resets retry delay');
  stop();
});
