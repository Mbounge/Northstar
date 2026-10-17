import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const helper = join(process.cwd(), 'scripts/northstar-subagent-pending.mjs');
const poll = async (path?: string, env?: NodeJS.ProcessEnv) => JSON.parse((await run(process.execPath, [helper, ...(path === undefined ? [] : [path])], { env })).stdout);

async function fixture() {
  // A relay root can itself have a session-prefixed name; its child sessions
  // still identify a root scan rather than a single-session request.
  const root = await mkdtemp(join(tmpdir(), 'session-pending-cli-root-'));
  const session = join(root, 'session-author');
  await mkdir(session);
  const inbox = { kind: 'turn', exchangeId: 'author-exchange', effort: 'high', responsePath: join(session, 'author-exchange.response.json'), input: [{ type: 'text', text: 'Repair the screen behavior' }] };
  await writeFile(join(session, 'inbox.json'), JSON.stringify(inbox));
  await writeFile(join(session, 'configuration.json'), JSON.stringify({ dynamicTools: [{ name: 'canvas_screen' }] }));
  return { root, session, inbox, close: () => rm(root, { recursive: true, force: true }) };
}

test('relay root and explicit session polling identify the same author exchange', async () => {
  const t = await fixture();
  try {
    await mkdir(join(t.root, 'session-incomplete'));
    const rootJobs = await poll(t.root), sessionJobs = await poll(t.session);
    assert.equal(rootJobs.length, 1, 'root scans tolerate an incompletely written child');
    assert.equal(sessionJobs.length, 1, 'a session path must not silently report an empty queue');
    for (const jobs of [rootJobs, sessionJobs]) {
      assert.equal(jobs[0].path, t.session); assert.equal(jobs[0].session, 'session-author');
      assert.equal(jobs[0].exchangeId, t.inbox.exchangeId); assert.equal(jobs[0].role, 'author');
      assert.equal(jobs[0].submitted, false); assert.equal(jobs[0].kind, 'turn');
    }
    const { ageSeconds: rootAge, ...rootIdentity } = rootJobs[0];
    const { ageSeconds: sessionAge, ...sessionIdentity } = sessionJobs[0];
    assert.deepEqual(rootIdentity, sessionIdentity); assert.ok(rootAge >= 0 && sessionAge >= rootAge);
  } finally { await t.close(); }
});

test('a submitted author stays visible while its separate initial reviewer is pending', async () => {
  const t = await fixture();
  try {
    await writeFile(t.inbox.responsePath, JSON.stringify({ exchangeId: t.inbox.exchangeId, action: { type: 'tool', name: 'canvas_screen' } }));
    const reviewer = join(t.root, 'session-reviewer'); await mkdir(reviewer);
    await writeFile(join(reviewer, 'configuration.json'), JSON.stringify({ dynamicTools: [] }));
    await writeFile(join(reviewer, 'inbox.json'), JSON.stringify({ kind: 'turn', exchangeId: 'review-exchange', responsePath: join(reviewer, 'review-exchange.response.json'), input: [{ type: 'text', text: JSON.stringify({ reviewStage: 'initial_appearance' }) }] }));
    const jobs = await poll(t.root), author = jobs.find((job: { role: string }) => job.role === 'author'), review = jobs.find((job: { role: string }) => job.role === 'initial');
    assert.equal(jobs.length, 2); assert.equal(author.submitted, true); assert.equal(review.submitted, false);
    assert.equal((await poll(t.session))[0].submitted, true);
    assert.equal((await poll(reviewer))[0].exchangeId, 'review-exchange');
  } finally { await t.close(); }
});

test('an explicitly unavailable path fails clearly instead of returning an empty queue', async () => {
  const t = await fixture();
  try {
    await assert.rejects(run(process.execPath, [helper, join(t.root, 'nonexistent')]), (error: unknown) => {
      const failure = error as { code: number; stdout: string; stderr: string };
      assert.equal(failure.code, 1); assert.equal(failure.stdout, '');
      assert.match(failure.stderr, /Cannot read relay root or session directory/);
      assert.match(failure.stderr, /Pass an existing relay root or session path/); return true;
    });
  } finally { await t.close(); }
});

test('invalid explicit sessions report required files; a completed valid session is empty', async () => {
  const t = await fixture();
  try {
    const invalid = join(t.root, 'session-incomplete'); await mkdir(invalid);
    await assert.rejects(run(process.execPath, [helper, invalid]), /A session needs readable inbox.json and configuration.json/);
    await writeFile(join(t.session, 'inbox.json'), JSON.stringify({ ...t.inbox, kind: 'completed' }));
    assert.deepEqual(await poll(t.session), []);
  } finally { await t.close(); }
});

test('the not-yet-created default relay root remains an empty queue', async () => {
  const t = await fixture();
  try {
    assert.deepEqual(await poll(undefined, { ...process.env, TMPDIR: t.root, TMP: t.root, TEMP: t.root }), []);
  } finally { await t.close(); }
});
