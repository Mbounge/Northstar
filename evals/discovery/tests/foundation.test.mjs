import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, readJSON, digest, reviewDigest, validateSchema, containedFile, loadBenchmark, prepare, startRun,
  nextEvents, deliverEvent, recordCheckpoint, currentRun, grade, saveGrade } from '../runner/core.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'northstar-eval-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'dataset'); fs.cpSync(ROOT, root, { recursive: true });
  return { root, dir, run: path.join(dir, 'run') };
}
function update(root, relative, mutate) {
  const p = path.join(root, relative); const data = readJSON(p); mutate(data);
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
}
function rehash(root, key) {
  update(root, 'cases/ikea-breakfast/case.json', c => { c[key].sha256 = digest(fs.readFileSync(path.join(root, c[key].path))); });
}
const config = { schemaVersion: 1, caseId: 'ikea-breakfast', appRevision: 'test-only', model: 'test-only',
  modelConfig: {}, tools: ['test'], budget: { maxSeconds: 600, maxUsd: 5 }, track: 'manual-live' };
function begin(f) { return startRun(config, f.run, { root: f.root, allowDraft: true }); }
function receipt(f, id, status = 'completed') {
  const run = readJSON(path.join(f.run, 'run.json'));
  const name = `observation-${id}.txt`; const content = 'Synthetic calibration observation; not a real canvas run.';
  fs.writeFileSync(path.join(f.run, name), content);
  return { schemaVersion: 1, runId: run.runId, checkpointId: id, terminalStatus: status,
    artifactFiles: [{ path: name, sha256: digest(content) }], observedAt: new Date().toISOString(),
    note: 'Synthetic test only', privateRepairs: 0, costUsd: 0, elapsedSeconds: 1 };
}
function finish(f) {
  recordCheckpoint(f.run, receipt(f, 'initial'), f.root);
  while (nextEvents(f.run, f.root).length) {
    const e = nextEvents(f.run, f.root)[0]; deliverEvent(f.run, e.id, f.root);
    recordCheckpoint(f.run, receipt(f, e.checkpoint), f.root);
  }
}
function judgments(f) {
  const { run, c } = currentRun(f.run, f.root);
  return { schemaVersion: 1, runId: run.runId, reviewer: 'test fixture', reviewerKind: 'calibration', graderVersion: 'test-1',
    inputDigest: run.caseDigest, rubricDigest: run.rubricDigest,
    criteria: c.rubric.criteria.map(c => ({ id: c.id, verdict: 'pass', rationale: 'Synthetic harness test', observations: ['synthetic'], evidenceIds: c.evidenceIds })),
    gates: c.rubric.gates.map(g => ({ id: g.id, verdict: 'pass', rationale: 'Synthetic harness test' })) };
}

test('dataset validates and stays draft with explicit empty held-out splits', () => {
  const b = loadBenchmark(); assert.equal(b.cases[0].task.status, 'draft');
  assert.equal(b.splits.find(s => s.name === 'holdout').caseIds.length, 0);
});
test('unknown schema fields are rejected', () => {
  assert.throws(() => validateSchema('runConfig', { ...config, fabricatedSuccess: true }), /additional/);
});
test('input changes invalidate pinned data', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'cases/ikea-breakfast/input.md'), 'Changed');
  assert.throws(() => loadBenchmark(f.root), /hash mismatch/);
});
test('path traversal and symlink escape fail closed', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'secret'), 'outside');
  assert.throws(() => containedFile(f.root, '../secret'), /escapes/);
  fs.symlinkSync(path.join(f.dir, 'secret'), path.join(f.root, 'link'));
  assert.throws(() => containedFile(f.root, 'link'), /escapes/);
});
test('drafts require explicit preparation and cannot leak future events or references', t => {
  const f = fixture(t), out = path.join(f.dir, 'bundle');
  assert.throws(() => prepare('ikea-breakfast', out, { root: f.root }), /not reviewed/);
  assert.equal(fs.existsSync(out), false);
  const b = prepare('ikea-breakfast', out, { root: f.root, allowDraft: true }); assert.equal(b.eligible, false);
  const files = fs.readdirSync(out); assert.equal(files.length, 4);
  assert.ok(!files.some(n => /comment|rubric|reference|episode|evidence/.test(n)));
  assert.throws(() => prepare('ikea-breakfast', out, { root: f.root, allowDraft: true }), /exists/);
});
test('case cannot promote itself without independent approval', t => {
  const f = fixture(t); update(f.root, 'cases/ikea-breakfast/case.json', c => { c.status = 'ready'; });
  assert.throws(() => loadBenchmark(f.root), /author approval/);
});
test('same reviewer cannot impersonate independence in the review record', t => {
  const f = fixture(t); update(f.root, 'cases/ikea-breakfast/case.json', c => {
    c.status = 'ready'; c.reviews = ['author','independent-human'].map(role => ({ role, reviewer: 'same', at: new Date().toISOString(), decision: 'approved', subjectDigest: reviewDigest(c) }));
  }); assert.throws(() => loadBenchmark(f.root), /independent/);
});
test('missing and unverified reference evidence cannot back required criteria', t => {
  const f = fixture(t); update(f.root, 'references/ikea-breakfast/rubric.json', r => { r.criteria[0].evidenceIds = ['canada-margins-lead']; });
  rehash(f.root, 'rubric'); assert.throws(() => loadBenchmark(f.root), /unverified/);
});
test('cycles and unknown checkpoint dependencies are rejected', t => {
  const f = fixture(t); update(f.root, 'cases/ikea-breakfast/episode.json', e => { e.events[0].after = ['resumed']; });
  rehash(f.root, 'episode'); assert.throws(() => loadBenchmark(f.root), /cycle|unreachable/);
});
test('split assignments cannot duplicate a case', t => {
  const f = fixture(t); update(f.root, 'splits/holdout.json', s => { s.caseIds = ['ikea-breakfast']; });
  assert.throws(() => loadBenchmark(f.root), /multiply assigned/);
});
test('holdout cannot be exported through the development runner', t => {
  const f = fixture(t); update(f.root, 'splits/development.json', s => { s.caseIds = s.caseIds.filter(id => id !== 'ikea-breakfast'); });
  update(f.root, 'splits/holdout.json', s => { s.caseIds = ['ikea-breakfast']; });
  assert.throws(() => prepare('ikea-breakfast', path.join(f.dir, 'out'), { root: f.root, allowDraft: true }), /isolated runner/);
});
test('unsupported execution tracks cannot be mislabelled as implemented', t => {
  const f = fixture(t); assert.throws(() => startRun({ ...config, track: 'controlled-model' }, f.run, { root: f.root, allowDraft: true }), /not implemented/);
});
test('episode releases events after prerequisites and survives controller restart', t => {
  const f = fixture(t); const m = begin(f); assert.equal(m.status, 'unexecuted');
  assert.equal(nextEvents(f.run, f.root).length, 0);
  assert.throws(() => deliverEvent(f.run, 'revisit-margin', f.root), /not ready/);
  finish(f); const s = currentRun(f.run, f.root);
  assert.equal(s.checkpoints.length, s.c.episode.checkpoints.length); assert.equal(nextEvents(f.run, f.root).length, 0);
  assert.throws(() => recordCheckpoint(f.run, receipt(f, 'initial'), f.root), /already recorded/);
});
test('checkpoint cannot be recorded without delivery', t => {
  const f = fixture(t); begin(f); recordCheckpoint(f.run, receipt(f, 'initial'), f.root);
  assert.throws(() => recordCheckpoint(f.run, receipt(f, 'deferred'), f.root), /delivered/);
});
test('failed prerequisite cannot release later events', t => {
  const f = fixture(t); begin(f); recordCheckpoint(f.run, receipt(f, 'initial', 'failed'), f.root);
  assert.equal(nextEvents(f.run, f.root).length, 0);
});
test('recorded observation integrity is checked again during grading', t => {
  const f = fixture(t); begin(f); finish(f); const j = judgments(f);
  fs.appendFileSync(path.join(f.run, 'observation-initial.txt'), 'altered');
  assert.throws(() => grade(f.run, j, f.root), /hash mismatch/);
});
test('missing judgments cannot be counted as a pass', t => {
  const f = fixture(t); begin(f); finish(f); const j = judgments(f); j.criteria.pop();
  assert.throws(() => grade(f.run, j, f.root), /Every criterion/);
});
test('all-pass judgments on incomplete runs do not pass', t => {
  const f = fixture(t); begin(f); const r = grade(f.run, judgments(f), f.root);
  assert.equal(r.outcome, 'incomplete'); assert.equal(r.acceptance, 'not-certified');
});
test('draft and calibration results never become benchmark acceptance', t => {
  const f = fixture(t); begin(f); finish(f); const r = grade(f.run, judgments(f), f.root);
  assert.equal(r.outcome, 'passed'); assert.equal(r.eligible, false); assert.equal(r.acceptance, 'not-certified');
});
test('critical gate failures cannot be averaged away', t => {
  const f = fixture(t); begin(f); finish(f); const j = judgments(f); j.gates[0].verdict = 'fail';
  assert.equal(grade(f.run, j, f.root).outcome, 'needs-review');
});
test('cannot-assess remains unresolved and affects required acceptance', t => {
  const f = fixture(t); begin(f); finish(f); const j = judgments(f); j.criteria[0].verdict = 'cannot-assess';
  const r = grade(f.run, j, f.root); assert.equal(r.outcome, 'needs-review'); assert.equal(r.cannotAssess, 1);
});
test('unknown costs prevent budget verification', t => {
  const f = fixture(t); begin(f); const r = receipt(f, 'initial'); r.costUsd = null;
  recordCheckpoint(f.run, r, f.root);
  while (nextEvents(f.run, f.root).length) {
    const e = nextEvents(f.run, f.root)[0]; deliverEvent(f.run, e.id, f.root); recordCheckpoint(f.run, receipt(f, e.checkpoint), f.root);
  }
  assert.equal(grade(f.run, judgments(f), f.root).outcome, 'budget-unverified-or-exceeded');
});
test('regrading appends a new record without overwriting old judgments', t => {
  const f = fixture(t); begin(f); finish(f);
  const a = saveGrade(f.run, judgments(f), f.root), b = saveGrade(f.run, judgments(f), f.root);
  assert.notEqual(a.filename, b.filename); assert.ok(fs.existsSync(path.join(f.run, a.filename)));
});
test('reference or case changes invalidate existing runs', t => {
  const f = fixture(t); begin(f); update(f.root, 'cases/ikea-breakfast/case.json', c => { c.version = '9.9.9'; });
  assert.throws(() => currentRun(f.run, f.root), /Dataset changed/);
});


test('approvals are bound to the exact reviewed case', t => {
  const f = fixture(t);
  update(f.root, 'cases/ikea-breakfast/case.json', c => {
    c.status = 'ready';
    c.reviews = ['author', 'independent-human'].map(role => ({ role, reviewer: role,
      at: new Date().toISOString(), decision: 'approved', subjectDigest: reviewDigest(c) }));
  });
  assert.equal(loadBenchmark(f.root).cases[0].task.status, 'ready');
  update(f.root, 'cases/ikea-breakfast/case.json', c => { c.version = '9.9.9'; });
  assert.throws(() => loadBenchmark(f.root), /author approval/);
});
test('split metadata changes invalidate an existing run', t => {
  const f = fixture(t); begin(f);
  update(f.root, 'splits/development.json', s => { s.caseIds = s.caseIds.filter(id => id !== 'ikea-breakfast'); });
  update(f.root, 'splits/validation.json', s => { s.caseIds = ['ikea-breakfast']; });
  assert.throws(() => currentRun(f.run, f.root), /Dataset changed/);
});
test('schema changes invalidate an existing run', t => {
  const f = fixture(t); begin(f);
  update(f.root, 'schemas/benchmark.schema.json', s => { s.description = 'Changed schema version'; });
  assert.throws(() => currentRun(f.run, f.root), /Dataset changed/);
});
test('forks may be explored in either order but restart waits for both branches', t => {
  const f = fixture(t); begin(f); recordCheckpoint(f.run, receipt(f, 'initial'), f.root);
  assert.deepEqual(new Set(nextEvents(f.run, f.root).map(e => e.id)), new Set(['defer-margin', 'promotion-update']));
  deliverEvent(f.run, 'promotion-update', f.root); recordCheckpoint(f.run, receipt(f, 'updated'), f.root);
  assert.throws(() => deliverEvent(f.run, 'restart', f.root), /not ready/);
  deliverEvent(f.run, 'defer-margin', f.root); recordCheckpoint(f.run, receipt(f, 'deferred'), f.root);
  deliverEvent(f.run, 'add-human-note', f.root); recordCheckpoint(f.run, receipt(f, 'human-edit'), f.root);
  assert.equal(nextEvents(f.run, f.root)[0].id, 'restart');
});

test('only a complete reviewed case with human judgments can be accepted', t => {
  const f = fixture(t);
  update(f.root, 'cases/ikea-breakfast/case.json', c => {
    c.status = 'ready';
    c.reviews = ['author', 'independent-human'].map(role => ({ role, reviewer: `synthetic-${role}`,
      at: new Date().toISOString(), decision: 'approved', subjectDigest: reviewDigest(c) }));
  });
  begin(f); finish(f); const j = judgments(f);
  assert.equal(grade(f.run, j, f.root).acceptance, 'not-certified');
  j.reviewerKind = 'model'; assert.equal(grade(f.run, j, f.root).acceptance, 'not-certified');
  j.reviewerKind = 'human'; assert.equal(grade(f.run, j, f.root).acceptance, 'accepted');
});
test('recorded budget overruns block acceptance', t => {
  const f = fixture(t); begin(f);
  const initial = receipt(f, 'initial'); initial.costUsd = 6;
  recordCheckpoint(f.run, initial, f.root);
  while (nextEvents(f.run, f.root).length) {
    const e = nextEvents(f.run, f.root)[0]; deliverEvent(f.run, e.id, f.root);
    recordCheckpoint(f.run, receipt(f, e.checkpoint), f.root);
  }
  assert.equal(grade(f.run, judgments(f), f.root).outcome, 'budget-unverified-or-exceeded');
});
test('calibration examples cannot silently reference obsolete criteria', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', c => { c.examples[0].expectedFailure = ['not-a-criterion']; });
  assert.throws(() => loadBenchmark(f.root), /unknown criterion/);
});

test('four distinct development families have full rubrics, episodes and calibration', () => {
  const b = loadBenchmark(); assert.equal(b.cases.length, 4);
  assert.equal(new Set(b.cases.map(c => c.task.family)).size, 4);
  for (const c of b.cases) {
    assert.ok(c.rubric.criteria.length >= 10);
    assert.ok(c.episode.checkpoints.length >= 5);
    assert.ok(c.evidence.filter(e => e.status === 'inspected').length >= 3);
    assert.equal(c.task.status, 'draft');
  }
});
test('all four input bundles omit references and later event files', t => {
  const f = fixture(t), b = loadBenchmark(f.root);
  for (const c of b.cases) {
    const out = path.join(f.dir, c.task.id);
    const bundle = prepare(c.task.id, out, { root: f.root, allowDraft: true });
    const expected = [c.task.input, c.task.initialCanvas, ...c.task.assets].map(a => a.sha256).sort();
    assert.deepEqual(bundle.artifacts.map(a => a.sha256).sort(), expected);
    assert.ok(!fs.existsSync(path.join(out, 'events')));
  }
});
test('delayed pilot files are exported only when both branches complete', t => {
  const f = fixture(t);
  startRun({ ...config, caseId: 'gymshark-creator-strategy' }, f.run, { root: f.root, allowDraft: true });
  recordCheckpoint(f.run, receipt(f, 'initial'), f.root);
  assert.throws(() => deliverEvent(f.run, 'pilot', f.root), /not ready/);
  assert.equal(fs.existsSync(path.join(f.run, 'event-input')), false);
  for (const [event, checkpoint] of [['app-update','updated'],['signup-goal','annotated']]) {
    deliverEvent(f.run, event, f.root); recordCheckpoint(f.run, receipt(f, checkpoint), f.root);
  }
  const d = deliverEvent(f.run, 'pilot', f.root); assert.equal(d.artifacts.length, 2);
  assert.match(fs.readFileSync(path.join(f.run, d.artifacts[0].path), 'utf8'), /creator_story,10000,300,12,600/);
  assert.throws(() => deliverEvent(f.run, 'pilot', f.root), /already delivered/);
  fs.appendFileSync(path.join(f.run, d.artifacts[0].path), 'corruption');
  assert.throws(() => currentRun(f.run, f.root), /hash mismatch/);
});
test('future event bytes cannot be smuggled into an initial input', t => {
  const f = fixture(t), id = 'gymshark-creator-strategy';
  const source = `cases/${id}/events/pilot/pilot.csv`, target = `cases/${id}/assets/leaked.csv`;
  fs.copyFileSync(path.join(f.root, source), path.join(f.root, target));
  update(f.root, `cases/${id}/case.json`, c => {
    c.assets.push({ path: target, sha256: digest(fs.readFileSync(path.join(f.root, target))) });
  });
  assert.throws(() => loadBenchmark(f.root), /Future event bytes/);
});
test('event files are transitively pinned through the episode digest', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'cases/emio-launch-clues/events/reveal/reveal-note.md'), 'changed');
  assert.throws(() => loadBenchmark(f.root), /hash mismatch/);
});
test('all four synthetic controller episodes reach completion without model calls', t => {
  const f = fixture(t);
  for (const c of loadBenchmark(f.root).cases) {
    const trial = { ...f, run: path.join(f.dir, `trial-${c.task.id}`) };
    startRun({ ...config, caseId: c.task.id }, trial.run, { root: f.root, allowDraft: true });
    finish(trial);
    assert.equal(currentRun(trial.run, f.root).checkpoints.length, c.episode.checkpoints.length);
    assert.equal(grade(trial.run, judgments(trial), f.root).acceptance, 'not-certified');
  }
});
test('media provenance cannot point at different bytes', t => {
  const f = fixture(t), id = 'slack-clips-design';
  update(f.root, `cases/${id}/assets/media.json`, m => { m.items[0].sha256 = '0'.repeat(64); });
  update(f.root, `cases/${id}/case.json`, c => {
    c.assets.find(a => a.path.endsWith('/media.json')).sha256 = digest(fs.readFileSync(path.join(f.root, `cases/${id}/assets/media.json`)));
  });
  assert.throws(() => loadBenchmark(f.root), /Media manifest/);
});
test('pilot denominator and cost anchors match the stored scenario', () => {
  const csv = fs.readFileSync(path.join(ROOT, 'cases/gymshark-creator-strategy/events/pilot/pilot.csv'), 'utf8');
  const rows = csv.trim().split('\n').slice(1).map(line => line.split(','));
  const metrics = rows.map(([,impressions,clicks,signups,spend]) => [Number(clicks)/Number(impressions), Number(signups)/Number(clicks), Number(spend)/Number(signups)]);
  assert.deepEqual(metrics, [[0.03,0.04,50],[0.02,0.08,25]]);
});

test('curator media observations cannot enter candidate-visible provenance', t => {
  const f = fixture(t), id = 'slack-clips-design';
  const rel = `cases/${id}/assets/media.json`;
  update(f.root, rel, m => { m.items[0].inspection = 'Grader answer hint'; });
  update(f.root, `cases/${id}/case.json`, c => {
    c.assets.find(a => a.path === rel).sha256 = digest(fs.readFileSync(path.join(f.root, rel)));
  });
  assert.throws(() => loadBenchmark(f.root), /additional/);
});
test('creator input contains full media and timestamped stills without later pilot data', t => {
  const f = fixture(t), out = path.join(f.dir, 'creator-input');
  const b = prepare('gymshark-creator-strategy', out, { root: f.root, allowDraft: true });
  for (const name of ['creator-story.mp4','creator-frame-0010.jpg','creator-frame-0030.jpg','source-context.md']) {
    assert.ok(b.artifacts.some(a => a.path.endsWith(`-${name}`)));
  }
  assert.ok(!b.artifacts.some(a => /pilot|measurement|reviewer/.test(a.path)));
});
test('calibration failures must belong to their declared checkpoint', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', d => { d.examples[0].checkpoint = 'resumed'; });
  assert.throws(() => loadBenchmark(f.root), /another checkpoint/);
});
test('calibration checkpoint identities are validated', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', d => { d.examples[0].checkpoint = 'invented-stage'; });
  assert.throws(() => loadBenchmark(f.root), /unknown checkpoint/);
});
test('model preservation is assessed after the operator note, not at its creation', () => {
  const b = loadBenchmark();
  for (const [id, criterion, checkpoint] of [
    ['emio-launch-clues','preserve-prediction','updated'],
    ['gymshark-creator-strategy','human-constraint','decided'],
    ['slack-clips-design','human-constraint','constrained'],
  ]) {
    assert.equal(b.cases.find(c => c.task.id === id).rubric.criteria.find(c => c.id === criterion).checkpoint, checkpoint);
  }
});
test('every allowed branch order completes and rejects premature delayed inputs', t => {
  const f = fixture(t);
  const orders = (events, done = new Set(['initial'])) => {
    if (!events.length) return [[]];
    return events.filter(e => e.after.every(id => done.has(id))).flatMap(e =>
      orders(events.filter(x => x !== e), new Set([...done, e.checkpoint])).map(tail => [e, ...tail]));
  };
  let count = 0;
  for (const c of loadBenchmark(f.root).cases) for (const order of orders(c.episode.events)) {
    const trial = { ...f, run: path.join(f.dir, `order-${count++}`) };
    startRun({ ...config, caseId: c.task.id }, trial.run, { root: f.root, allowDraft: true });
    recordCheckpoint(trial.run, receipt(trial, 'initial'), f.root);
    const done = new Set(['initial']);
    for (const e of order) {
      for (const blocked of c.episode.events.filter(x => !done.has(x.checkpoint) && !x.after.every(p => done.has(p)))) {
        assert.throws(() => deliverEvent(trial.run, blocked.id, f.root), /not ready/);
        assert.equal(fs.existsSync(path.join(trial.run, 'event-input', blocked.id)), false);
      }
      deliverEvent(trial.run, e.id, f.root);
      recordCheckpoint(trial.run, receipt(trial, e.checkpoint), f.root);
      done.add(e.checkpoint);
    }
    assert.equal(currentRun(trial.run, f.root).checkpoints.length, c.episode.checkpoints.length);
    assert.equal(grade(trial.run, judgments(trial), f.root).acceptance, 'not-certified');
  }
  assert.equal(count, 9); // Three IKEA orders and two orders in each other family.
});

test('related variants cannot be separated into development and validation', t => {
  const f = fixture(t), id = 'gymshark-creator-strategy';
  update(f.root, `cases/${id}/case.json`, c => { c.family = 'retail-meal-economics'; });
  update(f.root, 'splits/development.json', s => { s.caseIds = s.caseIds.filter(c => c !== id); });
  update(f.root, 'splits/validation.json', s => { s.caseIds = [id]; });
  assert.throws(() => loadBenchmark(f.root), /family leaks/);
});

test('calibration cannot disagree with its own explicit failure judgments', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', d => { d.examples[0].judgments[0].verdict = 'pass'; });
  assert.throws(() => loadBenchmark(f.root), /failure index must match/);
});

test('calibration pass judgments cannot reference nonexistent or wrong-stage criteria', t => {
  const f = fixture(t);
  const rel = 'calibration/ikea-examples.json';
  update(f.root, rel, d => { d.examples[0].judgments.push({ id: 'invented', verdict: 'pass', rationale: 'Invalid target' }); });
  assert.throws(() => loadBenchmark(f.root), /judgment references unknown criterion/);
  update(f.root, rel, d => { d.examples[0].judgments.at(-1).id = 'deferral'; });
  assert.throws(() => loadBenchmark(f.root), /judgment belongs to another checkpoint/);
});

test('calibration cannot judge one criterion twice', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', d => { d.examples[0].judgments.push({ ...d.examples[0].judgments[0] }); });
  assert.throws(() => loadBenchmark(f.root), /Duplicate calibration judged criterion/);
});

test('calibration requires observation context rather than silently grading an excerpt as a full run', t => {
  const f = fixture(t);
  update(f.root, 'calibration/ikea-examples.json', d => { delete d.examples[0].context; });
  assert.throws(() => loadBenchmark(f.root), /context/);
});

test('shared guidance changes invalidate pinned case review material', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'SCORING.md'), '\nAltered scoring contract.\n');
  assert.throws(() => loadBenchmark(f.root), /hash mismatch/);
});

test('shared-guide allowance does not admit arbitrary files outside case references', t => {
  const f = fixture(t), rel = 'arbitrary-grader-guide.md';
  fs.writeFileSync(path.join(f.root, rel), 'Unapproved shared location.');
  update(f.root, 'cases/ikea-breakfast/case.json', c => {
    c.reviewedArtifacts.find(a => a.path === 'SCORING.md').path = rel;
    c.reviewedArtifacts.find(a => a.path === rel).sha256 = digest(fs.readFileSync(path.join(f.root, rel)));
  });
  assert.throws(() => loadBenchmark(f.root), /explicit shared review guide/);
});

test('new scoring and discussion material cannot enter any initial candidate bundle', t => {
  const f = fixture(t);
  for (const c of loadBenchmark(f.root).cases) {
    const bundle = prepare(c.task.id, path.join(f.dir, `${c.task.id}-input`), { root: f.root, allowDraft: true });
    const expected = [c.task.input, c.task.initialCanvas, ...c.task.assets].map(a => a.sha256).sort();
    assert.deepEqual(bundle.artifacts.map(a => a.sha256).sort(), expected);
    assert.ok(!bundle.artifacts.some(a => /SCORING|discussion|calibration|reviewer|rubric/.test(a.path)));
  }
});
