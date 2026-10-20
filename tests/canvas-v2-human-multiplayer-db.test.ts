import assert from 'node:assert/strict';
import { spawn, execFile as execFileCallback, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, test } from 'node:test';

const execFile = promisify(execFileCallback);
const pgBin = [process.env.NORTHSTAR_TEST_PG_BIN, '/opt/homebrew/opt/postgresql@18/bin', '/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin']
  .find((candidate): candidate is string => !!candidate && existsSync(path.join(candidate, 'postgres')) && existsSync(path.join(candidate, 'initdb')));
if (!pgBin && process.env.NORTHSTAR_REQUIRE_TEST_PG === '1') throw new Error('Supply NORTHSTAR_TEST_PG_BIN with PostgreSQL server tools for mandatory DB tests.');
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const owner = '00000000-0000-4000-8000-000000000001', editor = '00000000-0000-4000-8000-000000000002';
const viewer = '00000000-0000-4000-8000-000000000003', stranger = '00000000-0000-4000-8000-000000000004';
const invitee = '00000000-0000-4000-8000-000000000005';
const ownerClient = '00000000-0000-4000-8000-000000000011', editorClient = '00000000-0000-4000-8000-000000000012';
type Change = { key: string; before: string | null; after: string | null };
type Commit = { ok: boolean; version: number; conflicts?: string[] };
type Room = { version: number; role: string; ownerId: string; cells: Record<string, string>; members: Array<{ userId: string; role: string; name: string }> };
type PrivateState = {version:number;path:string|null;updatedAt:string};
type PrivateSave = {ok:boolean;version:number;path:string|null};

/** Executes actual production SQL in a fresh cluster, never environment DB URLs.
 * Synthetic platform schemas cover DB authority, not hosted Auth/Storage/WS. */
describe('durable human multiplayer PostgreSQL authority', { skip: !pgBin ? 'Install PostgreSQL server tools or set NORTHSTAR_TEST_PG_BIN; no remote database fallback.' : false, concurrency: false }, () => {
  let directory: string;
  let started = false;
  const releaseLocks = new Set<() => Promise<void>>();
  const environment: NodeJS.ProcessEnv = { ...process.env, PGCONNECT_TIMEOUT: '5' };
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS', 'PGDATABASE', 'PGUSER', 'PGPORT', 'PGHOST']) delete environment[key];
  const args = () => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', '55479', '-U', 'postgres', '-d', 'postgres'];
  const query = (sql: string) => new Promise<string>((resolve, reject) => {
    const child = spawn(path.join(pgBin!, 'psql'), args(), { env: environment });
    let output = '', errors = '';
    const timer = setTimeout(() => { errors += 'Local test query timed out.'; child.kill(); }, 15_000);
    child.stdout.on('data', chunk => { output += String(chunk); if (output.length > 5_000_000) { errors += 'Local test query output exceeded its budget.'; child.kill(); } });
    child.stderr.on('data', chunk => { errors += String(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(output.trim()); else reject(new Error(errors.trim() || `Local PostgreSQL query exited ${code}`)); });
    child.stdin.on('error', () => { /* A rejected SQL script can close the input pipe early; retain PostgreSQL's error. */ });
    child.stdin.end(sql);
  });
  const asUser = (user: string | null, sql: string, role = 'authenticated') => `begin; set local role ${role}; set local request.jwt.claims=${quote(JSON.stringify({ ...(user ? { sub: user } : {}), role, user_metadata: { full_name: `Test ${user?.slice(-1) ?? 'anonymous'}` } }))}; ${sql}; commit;`;
  const rpc = async <T>(user: string | null, expression: string, role = 'authenticated'): Promise<T> => JSON.parse(await query(asUser(user, `select to_jsonb(${expression})`, role))) as T;
  const read = (user: string, sid: string) => rpc<Room>(user, `public.northstar_canvas_read(${quote(sid)})`);
  const privateRead = (user:string|null,sid:string,role='authenticated')=>rpc<PrivateState|null>(user,`coalesce(public.northstar_canvas_private_read(${quote(sid)}),'null'::jsonb)`,role);
  const privatePath = (user:string,sid:string)=>`${user}/${sid}/private/${randomUUID()}.json`;
  const privateSave = (user:string|null,sid:string,version:number,path:string,role='authenticated')=>rpc<PrivateSave>(user,`public.northstar_canvas_private_save(${quote(sid)},${version},${quote(path)})`,role);
  const commit = (user: string, sid: string, changes: Change[], oid = randomUUID(), cid = user === owner ? ownerClient : editorClient, label = 'Synthetic database edit') => rpc<Commit>(user, `public.northstar_canvas_commit(${quote(sid)},${quote(oid)},${quote(cid)},${json(changes)},${quote(label)})`);
  const seedCells = () => ({
    'document:html': '[{"ref":"a"},{"ref":"b"}]', 'document:css': 'p{color:#382944}', 'document:javascript': 'null',
    'node:a:open': '<p data-canvas-v2-node-id="a">', 'node:a:body': '["A"]', 'node:a:close': '</p>',
    'node:b:open': '<p data-canvas-v2-node-id="b">', 'node:b:body': '["B"]', 'node:b:close': '</p>',
  });
  const room = async () => {
    const sid = randomUUID();
    await query(`insert into public.northstar_sessions(id,owner_id,title) values(${quote(sid)},${quote(owner)},'Disposable multiplayer test')`);
    await rpc(owner, `public.northstar_canvas_enable(${quote(sid)},${json(seedCells())},'{"schema":1,"purpose":"database tests"}'::jsonb)`);
    await query(`insert into public.northstar_canvas_members(session_id,user_id,role,display_name) values(${quote(sid)},${quote(editor)},'editor','Editor'),(${quote(sid)},${quote(viewer)},'viewer','Viewer')`);
    return sid;
  };
  const change = (key: string, before: string | null, after: string | null): Change => ({ key, before: before === null ? null : hash(before), after });

  before(async () => {
    directory = await mkdtemp('/tmp/northstar-multiplayer-db-');
    await execFile(path.join(pgBin!, 'initdb'), ['-D', path.join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { env: environment });
    await execFile(path.join(pgBin!, 'pg_ctl'), ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'server.log'), '-w', '-t', '30', '-o', `-k ${directory} -p 55479 -c listen_addresses='' -F`, 'start'], { env: environment });
    started = true;
    for (const file of ['tests/fixtures/northstar-multiplayer-bootstrap.sql', 'db/migrations/20260915_northstar_sessions.sql', 'db/migrations/20261020_northstar_multiplayer.sql', 'db/migrations/20261020_northstar_private_workspaces.sql']) await query(await readFile(file, 'utf8'));
    await query(`insert into auth.users(id) values ${[owner, editor, viewer, stranger, invitee].map(id => `(${quote(id)})`).join(',')}`);
  });
  after(async () => {
    for (const release of releaseLocks) await release();
    if (started) await execFile(path.join(pgBin!, 'pg_ctl'), ['-D', path.join(directory, 'data'), '-w', '-t', '15', '-m', 'fast', 'stop'], { env: environment });
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const holdTransaction = async (statement: string) => {
    const child: ChildProcessWithoutNullStreams = spawn(path.join(pgBin!, 'psql'), args(), { env: environment });
    let output = '', errors = '', closed = false;
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { errors += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => child.on('exit', code => code === 0 ? resolve() : reject(new Error(errors || `Lock-holder exited ${code}`))));
    const waitFor = async (marker: string) => {
      const until = Date.now() + 5000;
      while (!output.includes(marker)) {
        if (Date.now() > until) throw new Error(`Lock-holder did not reach ${marker}: ${errors}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    child.stdin.write(`begin; ${statement};\n\\echo ROOM_LOCK_HELD\n`);
    const abort = async () => { if (closed) return; closed = true; child.stdin.end('rollback;\n'); await exited; releaseLocks.delete(abort); };
    releaseLocks.add(abort);
    await waitFor('ROOM_LOCK_HELD');
    return {
      release: async (beforeCommit = '') => { closed = true; child.stdin.end(`${beforeCommit}; commit;\n`); await exited; releaseLocks.delete(abort); },
      abort,
    };
  };
  const holdRoom = (sid: string) => holdTransaction(`select 1 from public.northstar_canvas_rooms where session_id=${quote(sid)} for update`);
  const waitForBlocked = async (oid: string) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await query(`select count(*) from pg_stat_activity where wait_event_type='Lock' and query like ${quote(`%${oid}%`)}`) !== '0') return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Concurrent operation never waited on the actual PostgreSQL room row lock.');
  };

  test('owner-only enable, RLS isolation, viewer reads and RPC/table write restrictions', async () => {
    const sid = await room();
    assert.equal((await read(owner, sid)).role, 'owner');
    assert.equal((await read(editor, sid)).role, 'editor');
    assert.equal((await read(viewer, sid)).role, 'viewer');
    for (const user of [stranger, null]) await assert.rejects(rpc(user, `public.northstar_canvas_read(${quote(sid)})`), /access denied/i);
    await assert.rejects(rpc(null, `public.northstar_canvas_read(${quote(sid)})`, 'anon'), /permission denied/i);
    for (const user of [editor, viewer, stranger]) await assert.rejects(rpc(user, `public.northstar_canvas_enable(${quote(sid)},'{}','{}')`), /Only the owner/);
    for (const user of [viewer, stranger]) await assert.rejects(commit(user, sid, [change('node:a:body', '["A"]', '["Not allowed"]')]), /access denied/i);
    for (const user of [owner, editor, viewer]) await assert.rejects(query(asUser(user, `update public.northstar_canvas_cells set value='forged' where session_id=${quote(sid)}`)), /permission denied/i);
    assert.equal(await query(asUser(stranger, 'select count(*) from public.northstar_canvas_cells')), '0');
    assert.equal(await query(asUser(stranger, 'select count(*) from public.northstar_sessions')), '0');
  });

  test('idempotent retries do not replay old changes and a reused operation identity cannot change actor, client or payload', async () => {
    const sid = await room(), oid = randomUUID();
    const first = [change('node:a:body', '["A"]', '["One"]')];
    assert.deepEqual(await commit(editor, sid, first, oid), { ok: true, version: 1 });
    await commit(owner, sid, [change('node:a:body', '["One"]', '["Later"]')]);
    assert.deepEqual(await commit(editor, sid, first, oid), { ok: true, version: 1 });
    assert.equal((await read(editor, sid)).cells['node:a:body'], '["Later"]');
    for (const attempt of [() => commit(owner, sid, first, oid, editorClient), () => commit(editor, sid, first, oid, ownerClient), () => commit(editor, sid, [change('node:a:body', '["Later"]', '["Hijacked"]')], oid)]) await assert.rejects(attempt(), /identity was reused/);
    const operations = await rpc<Array<{ actorId: string; version: number }>>(viewer, `public.northstar_canvas_operations_since(${quote(sid)},0)`);
    assert.deepEqual(operations.map(op => op.version), [1, 2]);
    assert.equal(operations[0].actorId, editor);
  });

  test('a stale field rolls back an entire multi-cell operation and does not append a log entry', async () => {
    const sid = await room();
    await commit(editor, sid, [change('node:a:body', '["A"]', '["New A"]')]);
    const rejected = await commit(owner, sid, [change('node:b:body', '["B"]', '["Must not commit"]'), change('node:a:body', '["A"]', '["Stale"]')]);
    assert.equal(rejected.ok, false); assert.ok(rejected.conflicts?.includes('node:a:body'));
    const state = await read(owner, sid);
    assert.equal(state.version, 1); assert.equal(state.cells['node:b:body'], '["B"]');
    assert.equal(await query(`select count(*) from public.northstar_canvas_operations where session_id=${quote(sid)}`), '1');
  });

  test('real concurrent connections accept one same-cell winner and both disjoint-object edits', async () => {
    for (const sameCell of [true, false]) {
      const sid = await room(), lock = await holdRoom(sid), firstId = randomUUID(), secondId = randomUUID();
      const first = commit(owner, sid, [change('node:a:body', '["A"]', '["Owner A"]')], firstId);
      const second = commit(editor, sid, [change(sameCell ? 'node:a:body' : 'node:b:body', sameCell ? '["A"]' : '["B"]', '["Editor value"]')], secondId);
      await Promise.all([waitForBlocked(firstId), waitForBlocked(secondId)]);
      await lock.release();
      const results = await Promise.all([first, second]);
      assert.equal(results.filter(result => result.ok).length, sameCell ? 1 : 2);
      const state = await read(owner, sid);
      assert.equal(state.version, sameCell ? 1 : 2);
      if (!sameCell) { assert.equal(state.cells['node:a:body'], '["Owner A"]'); assert.equal(state.cells['node:b:body'], '["Editor value"]'); }
    }
  });

  test('a writer revoked while waiting on the room lock is reauthorized after the wait', async () => {
    const sid = await room(), lock = await holdRoom(sid), oid = randomUUID();
    const pending = assert.rejects(commit(editor, sid, [change('node:a:body', '["A"]', '["Revoked write"]')], oid), /access denied/i);
    await waitForBlocked(oid);
    await lock.release(`delete from public.northstar_canvas_members where session_id=${quote(sid)} and user_id=${quote(editor)}`);
    await pending;
    assert.equal((await read(owner, sid)).version, 0);
    await assert.rejects(rpc(editor, `public.northstar_canvas_operations_since(${quote(sid)},0)`), /access denied/i);
    assert.equal(await query(asUser(editor, `select count(*) from public.northstar_canvas_cells where session_id=${quote(sid)}`)), '0');
  });

  test('object claims are client-specific, expire, and are cleared when a teammate is removed', async () => {
    const sid = await room();
    const claim = (user: string, cid: string, objects: string[]) => rpc<{ busy: string[] }>(user, `public.northstar_canvas_claim(${quote(sid)},${quote(cid)},array[${objects.map(quote).join(',')}]::text[])`);
    assert.deepEqual(await claim(editor, editorClient, ['a']), { busy: [] });
    assert.deepEqual(await claim(owner, ownerClient, ['a']), { busy: ['a'] });
    assert.equal((await commit(owner, sid, [change('node:a:body', '["A"]', '["Blocked"]')])).ok, false);
    assert.equal((await commit(editor, sid, [change('node:a:body', '["A"]', '["Own claim"]')])).ok, true);
    await query(`update public.northstar_canvas_claims set expires_at=clock_timestamp()-interval '1 second' where session_id=${quote(sid)}`);
    assert.deepEqual(await claim(owner, ownerClient, ['a']), { busy: [] });
    await claim(owner, ownerClient, []);
    assert.deepEqual(await claim(editor, editorClient, ['a', 'b']), { busy: [] });
    await rpc(owner, `public.northstar_canvas_remove_member(${quote(sid)},${quote(editor)})`);
    assert.equal(await query(`select count(*) from public.northstar_canvas_claims where session_id=${quote(sid)} and user_id=${quote(editor)}`), '0');
    await assert.rejects(claim(viewer, ownerClient, ['a']), /access denied/i);
  });

  test('signed-in invitation redemption respects role, expiry, revocation and owner-only administration', async () => {
    const sid = await room();
    const invite = (user: string, role: string) => rpc<{ id: string; token: string }>(user, `public.northstar_canvas_invite(${quote(sid)},${quote(role)})`);
    for (const user of [editor, viewer, stranger]) await assert.rejects(invite(user, 'editor'), /Only the owner/);
    await assert.rejects(invite(owner, 'owner'), /Invalid role/);
    const invitation = await invite(owner, 'viewer');
    assert.match(invitation.token, /^[a-f0-9]{64}$/);
    assert.equal(await query(`select token_hash from public.northstar_canvas_invites where id=${quote(invitation.id)}`), hash(invitation.token));
    assert.equal(await query(asUser(viewer, `select count(*) from public.northstar_canvas_invites where session_id=${quote(sid)}`)), '0');
    await assert.rejects(rpc(null, `public.northstar_canvas_join(${quote(invitation.token)})`), /Sign in/);
    assert.equal(await rpc(invitee, `public.northstar_canvas_join(${quote(invitation.token)})`), sid);
    assert.equal((await read(invitee, sid)).role, 'viewer');
    const upgrade = await invite(owner, 'editor');
    await rpc(invitee, `public.northstar_canvas_join(${quote(upgrade.token)})`);
    assert.equal((await read(invitee, sid)).role, 'editor', 'a fresh owner-issued editor link upgrades an existing viewer');
    await rpc(editor, `public.northstar_canvas_join(${quote(invitation.token)})`);
    assert.equal((await read(editor, sid)).role, 'editor', 'a viewer invitation must not downgrade an editor');
    await assert.rejects(rpc(editor, `public.northstar_canvas_revoke_invite(${quote(sid)},${quote(invitation.id)})`), /Only the owner/);
    await rpc(owner, `public.northstar_canvas_revoke_invite(${quote(sid)},${quote(invitation.id)})`);
    await assert.rejects(rpc(stranger, `public.northstar_canvas_join(${quote(invitation.token)})`), /expired|revoked/);
    const expired = await invite(owner, 'editor');
    await query(`update public.northstar_canvas_invites set expires_at=now()-interval '1 second' where id=${quote(expired.id)}`);
    await assert.rejects(rpc(stranger, `public.northstar_canvas_join(${quote(expired.token)})`), /expired|revoked/);
    const readmission = await invite(owner, 'viewer');
    await rpc(owner, `public.northstar_canvas_remove_member(${quote(sid)},${quote(invitee)})`);
    await assert.rejects(rpc(invitee, `public.northstar_canvas_join(${quote(readmission.token)})`), /expired|revoked/);
    const intentionalReadmission = await invite(owner, 'viewer');
    await rpc(invitee, `public.northstar_canvas_join(${quote(intentionalReadmission.token)})`);
    assert.equal((await read(invitee, sid)).role, 'viewer');
    await assert.rejects(rpc(owner, `public.northstar_canvas_remove_member(${quote(sid)},${quote(owner)})`), /Only the owner/);
  });

  test('legacy private snapshot blobs remain owner-only while room metadata and private Realtime follow membership', async () => {
    const sid = await room(), other = await room();
    const ownedPath = `${owner}/${sid}/retained.json`, unrelatedPath = `${owner}/${other}/unrelated.json`;
    await query(`insert into storage.objects(bucket_id,name) values('northstar-sessions',${quote(ownedPath)}),('northstar-sessions',${quote(unrelatedPath)})`);
    await query(`delete from public.northstar_canvas_members where session_id=${quote(other)} and user_id=${quote(viewer)}`);
    assert.equal(await query(asUser(viewer, `select count(*) from storage.objects where name=${quote(ownedPath)}`)), '0');
    assert.equal(await query(asUser(owner, `select count(*) from storage.objects where name=${quote(ownedPath)}`)), '1');
    assert.equal(await query(asUser(viewer, `select count(*) from storage.objects where name=${quote(unrelatedPath)}`)), '0');
    assert.equal(await query(asUser(stranger, 'select count(*) from storage.objects')), '0');
    const presence = (user: string, roomId: string) => query(asUser(user, `set local realtime.topic=${quote(`northstar-canvas:${roomId}`)}; insert into realtime.messages(topic,extension,payload) values(${quote(`northstar-canvas:${roomId}`)},'presence','{"cursor":{"x":1,"y":2}}')`));
    await presence(viewer, sid);
    await assert.rejects(presence(stranger, sid), /row-level security/i);
    await assert.rejects(presence(viewer, other), /row-level security/i);
    await rpc(owner, `public.northstar_canvas_remove_member(${quote(sid)},${quote(viewer)})`);
    await assert.rejects(presence(viewer, sid), /row-level security/i);
    assert.equal(await query(asUser(viewer, `select count(*) from storage.objects where name=${quote(ownedPath)}`)), '0');
  });

  test('malformed and duplicate edits cannot increment room sequence or append operations', async () => {
    const sid = await room();
    const valid = change('node:a:body', '["A"]', '["Next"]');
    for (const edits of [[], [valid, valid], [{ ...valid, key: 'viewport:x' }], [{ ...valid, key: 'draft' }], [{ ...valid, before: 'bad-hash' }], [{ key: valid.key, after: valid.after }], [{ ...valid, after: 42 }]]) {
      await assert.rejects(rpc(editor, `public.northstar_canvas_commit(${quote(sid)},${quote(randomUUID())},${quote(editorClient)},${json(edits)},'Malformed')`), /Invalid|Duplicate/i);
    }
    assert.equal((await read(owner, sid)).version, 0);
    assert.equal(await query(`select count(*) from public.northstar_canvas_operations where session_id=${quote(sid)}`), '0');
  });

  test('invalid shared graphs roll back every cell instead of poisoning the durable room', async () => {
    const sid = await room();
    for (const invalid of [
      change('document:html', seedCells()['document:html'], null),
      change('node:a:body', '["A"]', '{}'),
      change('node:a:body', '["A"]', '[{"ref":"missing"}]'),
      change('node:a:body', '["A"]', '[{"ref":"a"}]'),
      change('document:html', seedCells()['document:html'], '[{"ref":"a"},{"ref":"a"}]'),
      change('document:html', seedCells()['document:html'], '[{"ref":"a"}]'),
      change('document:javascript', 'null', '{"not":"script"}'),
    ]) {
      await assert.rejects(commit(editor, sid, [change('node:b:body', '["B"]', '["Must roll back"]'), invalid]), /Invalid|Missing|shared|graph|reference/i);
      const state = await read(owner, sid);
      assert.equal(state.version, 0); assert.equal(state.cells['node:b:body'], '["B"]');
    }
    assert.equal(await query(`select count(*) from public.northstar_canvas_operations where session_id=${quote(sid)}`), '0');
  });

  test('invalid room initialization leaves no partial room, members or cells, and enabling again cannot overwrite newer edits', async () => {
    const sid = randomUUID();
    await query(`insert into public.northstar_sessions(id,owner_id) values(${quote(sid)},${quote(owner)})`);
    for (const cells of [
      { ...seedCells(), 'document:html': '{}' },
      { ...seedCells(), 'document:html': '[{"ref":"missing"}]' },
      { ...seedCells(), 'node:a:body': '[{"ref":"a"}]' },
      { ...seedCells(), 'node:orphan:open': '<p>', 'node:orphan:body': '[]', 'node:orphan:close': '</p>' },
    ]) {
      await assert.rejects(rpc(owner, `public.northstar_canvas_enable(${quote(sid)},${json(cells)},'{}')`), /Invalid|Incomplete|Cyclic|orphaned|Duplicate/i);
      for (const table of ['rooms', 'members', 'cells']) assert.equal(await query(`select count(*) from public.northstar_canvas_${table} where session_id=${quote(sid)}`), '0');
    }
    await rpc(owner, `public.northstar_canvas_enable(${quote(sid)},${json(seedCells())},'{}')`);
    await commit(owner, sid, [change('node:a:body', '["A"]', '["Current shared work"]')]);
    const reopened = await rpc<Room>(owner, `public.northstar_canvas_enable(${quote(sid)},${json(seedCells())},'{"stale":true}')`);
    assert.equal(reopened.version, 1); assert.equal(reopened.cells['node:a:body'], '["Current shared work"]');
  });

  test('UTF-8 CAS and URI-encoded object identities agree with browser hashing and claims', async () => {
    const sid = await room();
    assert.equal((await commit(editor, sid, [change('node:a:body', '["A"]', '["é 🌊"]')])).ok, true);
    const staleNormalization = await commit(owner, sid, [change('node:a:body', '["é 🌊"]', '["Must conflict"]')]);
    assert.equal(staleNormalization.ok, false);
    assert.equal((await commit(owner, sid, [change('node:a:body', '["é 🌊"]', '["Exact UTF-8 bytes"]')])).ok, true);
    const rawId = "a:b/é's(idea)!", encoded = encodeURIComponent(rawId).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const encodedSession = randomUUID();
    const initial = { 'document:html': JSON.stringify([{ ref: rawId }]), 'document:css': '', 'document:javascript': 'null', [`node:${encoded}:open`]: `<p data-canvas-v2-node-id="${rawId}">`, [`node:${encoded}:body`]: '["Encoded"]', [`node:${encoded}:close`]: '</p>' };
    await query(`insert into public.northstar_sessions(id,owner_id) values(${quote(encodedSession)},${quote(owner)})`);
    const state = await rpc<Room>(owner, `public.northstar_canvas_enable(${quote(encodedSession)},${json(initial)},'{}')`);
    assert.equal(state.cells[`node:${encoded}:body`], '["Encoded"]');
    assert.deepEqual(await rpc(owner, `public.northstar_canvas_claim(${quote(encodedSession)},${quote(ownerClient)},array[${quote(encoded)}])`), { busy: [] });
  });

  test('every room snapshot observes one committed sequence across cells during concurrent commits', async () => {
    const sid = await room();
    const writer = async () => {
      for (let version = 1; version <= 12; version++) {
        const result = await commit(editor, sid, [change('document:css', version === 1 ? seedCells()['document:css'] : `/* sequence ${version - 1} */`, `/* sequence ${version} */`), change('node:b:body', version === 1 ? '["B"]' : JSON.stringify([String(version - 1)]), JSON.stringify([String(version)]))]);
        assert.equal(result.version, version);
      }
    };
    const reader = async () => {
      for (let attempt = 0; attempt < 24; attempt++) {
        const state = await read(viewer, sid);
        if (!state.version) continue;
        assert.equal(state.cells['document:css'], `/* sequence ${state.version} */`);
        assert.equal(state.cells['node:b:body'], JSON.stringify([String(state.version)]));
      }
    };
    await Promise.all([writer(), reader()]);
    assert.equal((await read(owner, sid)).version, 12);
  });

  test('database function grants and fixed search paths do not expose privileged helpers to untrusted callers', async () => {
    const metadata = JSON.parse(await query("select jsonb_agg(jsonb_build_object('name',p.proname,'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'definer',p.prosecdef,'config',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'northstar_canvas_%'")) as Array<{ name: string; anonExecute: boolean; definer: boolean; config: string[] }>;
    assert.ok(metadata.length >= 10);
    for (const fn of metadata) {
      assert.equal(fn.anonExecute, false, `${fn.name} is callable through PUBLIC or anon`);
      if (fn.definer) assert.ok(fn.config.includes('search_path=""'), `${fn.name} does not pin its privileged search path`);
    }
    assert.equal(await query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='public' and p.proname like 'northstar_canvas_%' and acl.grantee=0 and acl.privilege_type='EXECUTE'"),'0','no canvas function may retain inherited PUBLIC execution');
    for (const signature of ['public.northstar_canvas_validate(uuid)', 'public.northstar_canvas_encode_id(text)']) assert.equal(await query(`select has_function_privilege('authenticated',${quote(signature)},'EXECUTE')`), 'f');
  });

  test('evidence JSON remains hydratable and key-bound, with malformed changes rolling back the whole operation', async () => {
    const sid = await room(), asset = { id: 'licensed-image', url: 'data:image/png;base64,aA==', label: 'Synthetic retained asset' };
    const assetText = JSON.stringify(asset), key = 'evidence:licensed-image';
    assert.equal((await commit(editor, sid, [change(key, null, assetText)])).ok, true);
    assert.deepEqual(JSON.parse((await read(viewer, sid)).cells[key]), asset);
    for (const malformed of ['not JSON', '[]', '{}', JSON.stringify({ id: asset.id }), JSON.stringify({ id: asset.id, url: null }), JSON.stringify({ id: 'different-id', url: asset.url })]) {
      await assert.rejects(commit(editor, sid, [change('node:b:body', '["B"]', '["Must roll back"]'), change(key, assetText, malformed)]), /Invalid|evidence|JSON|loop|syntax/i, `Malformed evidence must be rejected: ${malformed}`);
      const state = await read(owner, sid);
      assert.equal(state.version, 1); assert.equal(state.cells['node:b:body'], '["B"]'); assert.equal(state.cells[key], assetText);
    }
    assert.equal(await query(`select count(*) from public.northstar_canvas_operations where session_id=${quote(sid)}`), '1');
  });

  test('member removal serializes with in-flight invitation redemption without deadlock or regranting access', async () => {
    const sid = await room();
    const invitation = await rpc<{ id: string; token: string }>(owner, `public.northstar_canvas_invite(${quote(sid)},'editor')`);
    await rpc(invitee, `public.northstar_canvas_join(${quote(invitation.token)})`);
    // Pause the real join after its invitation row lock, before its membership
    // upsert. This hook exists only in the disposable test database.
    await query(`create function public.pause_test_join() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(61801,42); return new; end $$; create trigger pause_test_join before insert on public.northstar_canvas_members for each row when (new.session_id=${quote(sid)}::uuid and new.user_id=${quote(invitee)}::uuid) execute function public.pause_test_join()`);
    const gate = await holdTransaction('select pg_advisory_xact_lock(61801,42)');
    try {
      const joining = rpc(invitee, `public.northstar_canvas_join(${quote(invitation.token)})`);
      await waitForBlocked(invitation.token);
      const removing = rpc(owner, `public.northstar_canvas_remove_member(${quote(sid)},${quote(invitee)})`);
      await waitForBlocked('northstar_canvas_remove_member');
      await gate.release();
      await Promise.all([joining, removing]);
      await assert.rejects(read(invitee, sid), /access denied/i);
      await assert.rejects(rpc(invitee, `public.northstar_canvas_join(${quote(invitation.token)})`), /expired|revoked/);
    } finally {
      await gate.abort();
      await query('drop trigger pause_test_join on public.northstar_canvas_members; drop function public.pause_test_join()');
    }
  });

  test('private cloud history is per authenticated account and canvas, including viewer saves and fresh-device reads',async()=>{
    const sid=await room(), ownerPath=privatePath(owner,sid), viewerPath=privatePath(viewer,sid);
    assert.equal(await privateRead(viewer,sid),null);
    assert.deepEqual(await privateSave(viewer,sid,0,viewerPath),{ok:true,version:1,path:viewerPath});
    assert.deepEqual(await privateSave(owner,sid,0,ownerPath),{ok:true,version:1,path:ownerPath});
    // Every helper starts a separate PostgreSQL connection: no device-local
    // cache or previous connection state can supply this fresh read.
    const restored=await privateRead(viewer,sid);
    assert.ok(restored);assert.equal(restored.path,viewerPath);assert.equal(restored.version,1);assert.ok(restored.updatedAt);
    assert.equal((await privateRead(owner,sid))?.path,ownerPath);
    for(const user of [owner,viewer]){
      assert.equal(await query(asUser(user,`select count(*) from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`)),'1');
      assert.equal(await query(asUser(user,`select user_id::text from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`)),user);
    }
    const other=await room();assert.equal(await privateRead(viewer,other),null);
    assert.equal((await privateRead(viewer,sid))?.path,viewerPath);
  });

  test('room ownership never grants access to another teammate private history or its Storage object',async()=>{
    const sid=await room(), path=privatePath(viewer,sid);await privateSave(viewer,sid,0,path);
    await query(`insert into storage.objects(bucket_id,name) values('northstar-sessions',${quote(path)})`);
    assert.equal(await privateRead(owner,sid),null);
    assert.equal(await query(asUser(owner,`select count(*) from public.northstar_canvas_private_workspaces where session_id=${quote(sid)} and user_id=${quote(viewer)}`)),'0');
    assert.equal(await query(asUser(owner,`select count(*) from storage.objects where name=${quote(path)}`)),'0');
    assert.equal(await query(asUser(editor,`select count(*) from storage.objects where name=${quote(path)}`)),'0');
    assert.equal(await query(asUser(viewer,`select count(*) from storage.objects where name=${quote(path)}`)),'1');
    await assert.rejects(privateSave(owner,sid,0,path),/path/i);
  });

  test('private workspace RPCs reject unauthenticated, outsider and revoked access without erasing retained private history',async()=>{
    const sid=await room(), path=privatePath(viewer,sid);
    for(const user of [null,stranger]){
      await assert.rejects(privateRead(user,sid),/access|auth|permission/i);
      await assert.rejects(privateSave(user,sid,0,path),/access|auth|permission/i);
    }
    await assert.rejects(privateRead(null,sid,'anon'),/permission/i);
    await assert.rejects(privateSave(null,sid,0,path,'anon'),/permission/i);
    await privateSave(viewer,sid,0,path);
    await rpc(owner,`public.northstar_canvas_remove_member(${quote(sid)},${quote(viewer)})`);
    await assert.rejects(privateRead(viewer,sid),/access/i);
    await assert.rejects(privateSave(viewer,sid,1,privatePath(viewer,sid)),/access/i);
    assert.equal(await query(asUser(viewer,`select count(*) from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`)),'0');
    assert.equal(await query(`select snapshot_path from public.northstar_canvas_private_workspaces where session_id=${quote(sid)} and user_id=${quote(viewer)}`),path,'revocation must not replace or leak retained private history');
  });

  test('private history CAS serializes first-device races and never overwrites newer cloud history with a stale device',async()=>{
    const sid=await room(), first=privatePath(viewer,sid),second=privatePath(viewer,sid),lock=await holdRoom(sid);
    const a=privateSave(viewer,sid,0,first),b=privateSave(viewer,sid,0,second);
    await Promise.all([waitForBlocked(first),waitForBlocked(second)]);await lock.release();
    const results=await Promise.all([a,b]);assert.equal(results.filter(value=>value.ok).length,1);
    const winner=results.find(value=>value.ok)!;assert.equal(winner.version,1);
    assert.equal((await privateRead(viewer,sid))?.path,winner.path);
    const latest=privatePath(viewer,sid);assert.equal((await privateSave(viewer,sid,1,latest)).ok,true);
    const stale=await privateSave(viewer,sid,1,privatePath(viewer,sid));assert.equal(stale.ok,false);assert.equal(stale.version,2);
    assert.deepEqual(await privateSave(viewer,sid,0,latest),{ok:true,version:2,path:latest},'retrying the current uploaded object after a lost response must not increment twice');
    assert.equal((await privateSave(viewer,sid,0,winner.path!)).ok,false,'a superseded upload must not overwrite a later device');
    assert.equal((await privateRead(viewer,sid))?.path,latest);
  });

  test('a private-history save revoked while waiting on the actual room lock is reauthorized after the wait',async()=>{
    const sid=await room(),path=privatePath(viewer,sid),lock=await holdRoom(sid);
    const pending=assert.rejects(privateSave(viewer,sid,0,path),/access/i);
    await waitForBlocked(path);
    await lock.release(`delete from public.northstar_canvas_members where session_id=${quote(sid)} and user_id=${quote(viewer)}`);
    await pending;
    assert.equal(await query(`select count(*) from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`),'0');
  });

  test('private cloud pointers require exact authenticated account, canvas and private UUID object namespace',async()=>{
    const sid=await room(),other=await room(),leaf=`${randomUUID()}.json`;
    for(const path of [privatePath(owner,sid),privatePath(viewer,other),`${viewer}/${sid}/${leaf}`,`${viewer}/${sid}/private/name.json`,`${viewer}/${sid}/private/../${leaf}`,`${viewer}/${sid}/private/${leaf}?token=bad`,`${viewer}/${sid}/private/${leaf}/extra`]){
      await assert.rejects(privateSave(viewer,sid,0,path),/path/i);
    }
    assert.equal(await query(`select count(*) from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`),'0');
    assert.equal((await privateSave(viewer,sid,0,privatePath(viewer,sid))).ok,true);
  });

  test('private workspace table has no direct write privilege and independent users cannot collide in one room',async()=>{
    const sid=await room();
    await Promise.all([privateSave(owner,sid,0,privatePath(owner,sid)),privateSave(editor,sid,0,privatePath(editor,sid)),privateSave(viewer,sid,0,privatePath(viewer,sid))]);
    for(const user of [owner,editor,viewer]){
      assert.equal((await privateRead(user,sid))?.version,1);
      for(const command of [`update public.northstar_canvas_private_workspaces set version=99 where session_id=${quote(sid)}`,`delete from public.northstar_canvas_private_workspaces where session_id=${quote(sid)}`,`insert into public.northstar_canvas_private_workspaces(session_id,user_id) values(${quote(sid)},${quote(stranger)})`])await assert.rejects(query(asUser(user,command)),/permission/i);
    }
    assert.equal(await query(asUser(stranger,`select count(*) from public.northstar_canvas_private_workspaces`)),'0');
  });

  test('Supabase inherited default grants cannot retain TRUNCATE, trigger or reference authority on new canvas tables',async()=>{
    for(const table of ['rooms','members','cells','operations','claims','invites','private_workspaces']){
      for(const role of ['anon','authenticated']){
        for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal(await query(`select has_table_privilege(${quote(role)},${quote(`public.northstar_canvas_${table}`)},${quote(privilege)})`),'f',`${role} retains ${privilege} on canvas_${table} from inherited defaults`);
      }
      assert.equal(await query(`select has_table_privilege('authenticated',${quote(`public.northstar_canvas_${table}`)},'SELECT')`),'t');
      assert.equal(await query(`select has_table_privilege('anon',${quote(`public.northstar_canvas_${table}`)},'SELECT')`),'f');
      assert.equal(await query(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where n.nspname='public' and c.relname=${quote(`northstar_canvas_${table}`)} and acl.grantee=0`),'0','PUBLIC table grants must also be revoked');
    }
  });

  test('hosted read-only catalog audit verifies every expected table, function and policy against reviewed source',async()=>{
    const sql=await readFile('tests/fixtures/northstar-multiplayer-postmigration.sql','utf8');
    assert.doesNotMatch(sql,/^\s*(insert|update|delete|create|alter|drop|grant|revoke|truncate|set)\b/im,'the hosted audit must never modify data or privileges');
    const audit=JSON.parse(await query(sql)) as {knownContractReady:boolean;functions:Array<{name:string;body_md5:string}>};
    assert.equal(audit.knownContractReady,true);
    const expected=new Map<string,string>();
    for(const file of ['db/migrations/20261020_northstar_multiplayer.sql','db/migrations/20261020_northstar_private_workspaces.sql']){
      const source=await readFile(file,'utf8');
      for(const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(northstar_canvas_[a-z_]+)\s*\([\s\S]*?\)\s*returns[\s\S]*?\bas\s*\$\$([\s\S]*?)\$\$/g))expected.set(match[1],createHash('md5').update(match[2]).digest('hex'));
    }
    assert.equal(expected.size,14);assert.equal(audit.functions.length,14);
    for(const fn of audit.functions)assert.equal(fn.body_md5,expected.get(fn.name),`${fn.name} deployed body must match its reviewed migration`);
  });
});
