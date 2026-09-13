import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv({ allErrors: true, jsonPointers: true });
const validators = new Map();
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJSON = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
const runnerDigest = () => digest(['core.mjs', 'cli.mjs'].map(name => fs.readFileSync(path.join(ROOT, 'runner', name), 'utf8')).join('\n'));
const requireThat = (value, message) => { if (!value) throw new Error(message); };

export function validateSchema(name, data, root = ROOT) {
  const schemaBytes = fs.readFileSync(path.join(root, 'schemas', `${name}.schema.json`));
  const key = `${root}:${name}:${digest(schemaBytes)}`;
  if (!validators.has(key)) validators.set(key, ajv.compile(JSON.parse(schemaBytes)));
  const validate = validators.get(key);
  requireThat(validate(data), `${name}: ${ajv.errorsText(validate.errors)}`);
  return data;
}

// Resolve existing files through realpath: traversal, absolute paths and symlink escapes fail closed.
export function containedFile(root, relative) {
  requireThat(typeof relative === 'string' && relative.length && !path.isAbsolute(relative), 'Expected a relative file path');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  requireThat(file.startsWith(`${base}${path.sep}`) && fs.statSync(file).isFile(), `File escapes root: ${relative}`);
  return file;
}

function checkArtifact(root, artifact) {
  const file = containedFile(root, artifact.path);
  requireThat(digest(fs.readFileSync(file)) === artifact.sha256, `Artifact hash mismatch: ${artifact.path}`);
  return file;
}

function unique(items, label) {
  requireThat(new Set(items).size === items.length, `Duplicate ${label}`);
}

// Reviews approve the exact case contents, excluding the approval records themselves.
export function reviewDigest(task) {
  const subject = { ...task };
  delete subject.status;
  delete subject.reviews;
  return digest(JSON.stringify(subject));
}

export function loadCase(caseFile, root = ROOT) {
  const task = validateSchema('case', readJSON(containedFile(root, caseFile)), root);
  const inputFiles = [task.input, task.initialCanvas, ...task.assets];
  const privateFiles = [task.episode, task.rubric, task.evidence, ...task.referenceAssets, ...task.reviewedArtifacts];
  const allFiles = [...inputFiles, ...privateFiles];
  unique(allFiles.map(a => a.path), 'artifact path');
  for (const artifact of allFiles) checkArtifact(root, artifact);
  for (const a of inputFiles) requireThat(a.path.startsWith(`cases/${task.id}/`), 'Agent input must be in its case directory');
  for (const a of [task.rubric, task.evidence, ...task.referenceAssets, ...task.reviewedArtifacts]) {
    const sharedGuide = task.reviewedArtifacts.some(g => g.path === a.path)
      && ['SCORING.md', 'calibration/discussion.md'].includes(a.path);
    requireThat(a.path.startsWith(`references/${task.id}/`) || sharedGuide,
      'Grading material must be in references or an explicit shared review guide');
    requireThat(!inputFiles.some(i => i.sha256 === a.sha256), 'Reference bytes cannot be an agent input');
  }
  const mediaArtifact = task.assets.find(a => a.path.endsWith('/media.json'));
  if (mediaArtifact) {
    const media = validateSchema('media', readJSON(containedFile(root, mediaArtifact.path)), root);
    unique(media.items.map(m => m.file), 'media filename');
    for (const item of media.items) {
      const asset = task.assets.find(a => a.path === `cases/${task.id}/assets/${item.file}`);
      requireThat(asset && asset.sha256 === item.sha256, 'Media manifest does not match a pinned input asset');
      const bytes = fs.readFileSync(checkArtifact(root, asset));
      const valid = item.kind === 'gif' ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
        : item.kind === 'video' ? bytes.subarray(4, 8).toString() === 'ftyp'
        : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      requireThat(valid, `Media signature does not match declared kind: ${item.file}`);
      requireThat(item.kind === 'image' || item.durationSeconds > 0, 'Playable media needs an inspected duration');
    }
  }
  const initial = readJSON(containedFile(root, task.initialCanvas.path));
  requireThat(initial.schemaVersion === 1 && initial.mode === 'empty', 'Foundation adapter supports only an explicitly empty initial canvas');
  const episode = validateSchema('episode', readJSON(containedFile(root, task.episode.path)), root);
  const eventFiles = episode.events.flatMap(e => (e.assets || []).map(a => ({ event: e.id, artifact: a })));
  unique([...allFiles.map(a => a.path), ...eventFiles.map(e => e.artifact.path)], 'artifact path');
  for (const { event, artifact } of eventFiles) {
    requireThat(artifact.path.startsWith(`cases/${task.id}/events/${event}/`), 'Event artifact must belong to its case and event');
    checkArtifact(root, artifact);
    requireThat(!inputFiles.some(a => a.sha256 === artifact.sha256), 'Future event bytes cannot be initial inputs');
  }
  const rubric = validateSchema('rubric', readJSON(containedFile(root, task.rubric.path)), root);
  requireThat(episode.caseId === task.id && rubric.caseId === task.id, 'Case identity mismatch');
  const evidence = fs.readFileSync(containedFile(root, task.evidence.path), 'utf8').trim().split('\n').filter(Boolean)
    .map(line => validateSchema('evidence', JSON.parse(line), root));
  unique(evidence.map(e => e.id), 'evidence ID');
  unique(episode.checkpoints.map(c => c.id), 'checkpoint ID');
  unique(episode.events.map(e => e.id), 'event ID');
  unique(episode.events.map(e => e.checkpoint), 'event checkpoint');
  unique(rubric.criteria.map(c => c.id), 'criterion ID');
  unique(rubric.gates.map(g => g.id), 'gate ID');
  const checkpoints = new Set(episode.checkpoints.map(c => c.id));
  requireThat(checkpoints.has('initial'), 'Episode requires an initial checkpoint');
  const reached = new Set(['initial']);
  let pending = [...episode.events];
  while (pending.length) {
    const ready = pending.filter(e => e.after.length && e.after.every(id => reached.has(id)));
    requireThat(ready.length, 'Episode contains a cycle or unreachable checkpoint');
    for (const event of ready) {
      requireThat(checkpoints.has(event.checkpoint) && event.checkpoint !== 'initial', 'Unknown or reserved event checkpoint');
      reached.add(event.checkpoint);
    }
    pending = pending.filter(e => !ready.includes(e));
  }
  requireThat(reached.size === checkpoints.size, 'Checkpoint has no producing event');
  for (const criterion of rubric.criteria) {
    requireThat(checkpoints.has(criterion.checkpoint), `Unknown criterion checkpoint: ${criterion.id}`);
    for (const id of criterion.evidenceIds) {
      const record = evidence.find(e => e.id === id);
      requireThat(record && record.status !== 'unverified-lead', `Criterion uses missing/unverified evidence: ${id}`);
    }
  }
  const subjectDigest = reviewDigest(task);
  if (task.status === 'ready') {
    const reviews = task.reviews.filter(r => r.subjectDigest === subjectDigest);
    requireThat(reviews.some(r => r.role === 'author' && r.decision === 'approved'), 'Ready case requires author approval');
    requireThat(reviews.some(r => r.role === 'independent-human' && r.decision === 'approved'
      && !task.reviews.some(a => a.role === 'author' && a.reviewer === r.reviewer)), 'Ready case requires independent human approval');
    requireThat(!task.reviews.some(r => r.decision === 'revise'), 'Unresolved revision request');
  }
  // All source/reference bytes are already pinned in task. Any metadata or content change changes this digest.
  return { task, episode, rubric, evidence, caseDigest: digest(JSON.stringify(task)), reviewDigest: subjectDigest, root };
}

export function loadBenchmark(root = ROOT) {
  const manifest = validateSchema('benchmark', readJSON(path.join(root, 'benchmark.json')), root);
  const cases = manifest.cases.map(file => loadCase(file, root));
  unique(cases.map(c => c.task.id), 'case ID');
  const splits = manifest.splitFiles.map(file => validateSchema('split', readJSON(containedFile(root, file)), root));
  unique(splits.map(s => s.name), 'split name');
  requireThat(['development', 'validation', 'holdout'].every(n => splits.some(s => s.name === n)), 'All three splits must be explicit');
  const assigned = new Map();
  const familySplit = new Map();
  for (const split of splits) for (const id of split.caseIds) {
    const c = cases.find(c => c.task.id === id);
    requireThat(c && !assigned.has(id), `Unknown or multiply assigned case: ${id}`);
    requireThat(!familySplit.has(c.task.family) || familySplit.get(c.task.family) === split.name, 'Case family leaks across splits');
    assigned.set(id, split.name); familySplit.set(c.task.family, split.name);
  }
  requireThat(assigned.size === cases.length, 'Every case requires a split');
  const calibration = fs.readdirSync(path.join(root, 'calibration')).filter(n => n.endsWith('.json')).sort().map(name => {
    const data = validateSchema('calibration', readJSON(containedFile(root, `calibration/${name}`)), root);
    const c = cases.find(c => c.task.id === data.caseId);
    requireThat(c, 'Calibration references unknown case');
    unique(data.examples.map(e => e.id), 'calibration example ID');
    for (const e of data.examples) {
      requireThat(c.episode.checkpoints.some(p => p.id === e.checkpoint), 'Calibration references unknown checkpoint');
      for (const id of e.expectedFailure) {
        const criterion = c.rubric.criteria.find(c => c.id === id);
        requireThat(criterion, 'Calibration references unknown criterion');
        requireThat(criterion.checkpoint === e.checkpoint, 'Calibration failure belongs to another checkpoint');
      }
      unique(e.judgments.map(j => j.id), 'calibration judged criterion');
      for (const j of e.judgments) {
        const criterion = c.rubric.criteria.find(c => c.id === j.id);
        requireThat(criterion, 'Calibration judgment references unknown criterion');
        requireThat(criterion.checkpoint === e.checkpoint, 'Calibration judgment belongs to another checkpoint');
      }
      const failures = e.judgments.filter(j => j.verdict === 'fail').map(j => j.id).sort();
      requireThat(JSON.stringify(failures) === JSON.stringify([...e.expectedFailure].sort()),
        'Calibration failure index must match explicit fail judgments');
    }
    return data;
  });
  const schemas = fs.readdirSync(path.join(root, 'schemas')).filter(n => n.endsWith('.schema.json')).sort()
    .map(name => [name, digest(fs.readFileSync(path.join(root, 'schemas', name)))]);
  const benchmarkDigest = digest(JSON.stringify({ manifest, splits, schemas, calibration, cases: cases.map(c => c.caseDigest) }));
  return { manifest, cases, splits, assigned, benchmarkDigest };
}

export function prepare(caseId, output, { allowDraft = false, root = ROOT } = {}) {
  const benchmark = loadBenchmark(root);
  const c = benchmark.cases.find(c => c.task.id === caseId);
  requireThat(c, `Unknown case: ${caseId}`);
  requireThat(benchmark.assigned.get(caseId) === 'development', 'Foundation preparation only supports development cases; held-out access needs an isolated runner');
  requireThat(c.task.status === 'ready' || (allowDraft && c.task.status === 'draft'), 'Case is not reviewed and ready; use --allow-draft for a labelled preparation only');
  requireThat(!fs.existsSync(output), 'Output already exists; never overwrite a bundle');
  fs.mkdirSync(output, { recursive: true });
  const artifacts = [c.task.input, c.task.initialCanvas, ...c.task.assets].map((a, i) => {
    const name = `${i}-${path.basename(a.path)}`;
    fs.copyFileSync(containedFile(root, a.path), path.join(output, name), fs.constants.COPYFILE_EXCL);
    return { path: name, sha256: a.sha256 };
  });
  const bundle = { schemaVersion: 1, caseId, caseDigest: c.caseDigest, benchmarkDigest: benchmark.benchmarkDigest,
    eligible: c.task.status === 'ready', route: '/canvas', artifacts,
    warning: c.task.status === 'draft' ? 'DRAFT: no benchmark eligibility or performance claim.' : 'References and future events are withheld.' };
  writeJSON(path.join(output, 'bundle.json'), bundle);
  return bundle;
}

export function startRun(config, output, { allowDraft = false, root = ROOT } = {}) {
  validateSchema('runConfig', config, root);
  requireThat(config.track === 'manual-live', 'Controlled retrieval and fixture execution adapters are not implemented; refusing to label a run incorrectly');
  requireThat(!fs.existsSync(output), 'Run directory already exists');
  const benchmark = loadBenchmark(root);
  const c = benchmark.cases.find(c => c.task.id === config.caseId);
  requireThat(c, 'Unknown case');
  // Prepare validates review status and split before any run state is created.
  const bundle = prepare(config.caseId, path.join(output, 'agent-input'), { allowDraft, root });
  const manifest = { schemaVersion: 1, runId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    config, caseDigest: c.caseDigest, rubricDigest: c.task.rubric.sha256,
    benchmarkVersion: benchmark.manifest.version, benchmarkDigest: benchmark.benchmarkDigest,
    eligible: bundle.eligible, route: '/canvas', adapter: 'manual-import', status: 'unexecuted',
    independentDiscoveryCertified: false, runnerDigest: runnerDigest(), nodeVersion: process.version };
  writeJSON(path.join(output, 'run.json'), manifest);
  fs.mkdirSync(path.join(output, 'checkpoints'));
  fs.mkdirSync(path.join(output, 'deliveries'));
  return manifest;
}

export function currentRun(runDir, root = ROOT) {
  const run = readJSON(path.join(runDir, 'run.json'));
  validateSchema('runConfig', run.config, root);
  const benchmark = loadBenchmark(root);
  const c = benchmark.cases.find(c => c.task.id === run.config.caseId);
  requireThat(c && c.caseDigest === run.caseDigest && benchmark.benchmarkDigest === run.benchmarkDigest, 'Dataset changed; start a new run rather than silently reusing results');
  const checkpoints = fs.readdirSync(path.join(runDir, 'checkpoints')).filter(n => n.endsWith('.json')).map(n => {
    const r = validateSchema('checkpoint', readJSON(path.join(runDir, 'checkpoints', n)), root);
    requireThat(r.runId === run.runId && c.episode.checkpoints.some(p => p.id === r.checkpointId), 'Checkpoint identity mismatch');
    r.artifactFiles.forEach(a => checkArtifact(runDir, a));
    return r;
  });
  unique(checkpoints.map(c => c.checkpointId), 'recorded checkpoint');
  for (const e of c.episode.events) {
    const file = path.join(runDir, 'deliveries', `${e.id}.json`);
    if (!fs.existsSync(file)) continue;
    const delivered = readJSON(file);
    requireThat(delivered.id === e.id && delivered.payload === e.payload && delivered.kind === e.kind
      && delivered.delivery === e.delivery && delivered.instructions === e.instructions, 'Event delivery changed');
    const artifacts = delivered.artifacts || [];
    requireThat(artifacts.length === (e.assets || []).length, 'Event asset delivery incomplete');
    artifacts.forEach((a, i) => {
      requireThat(a.path === `event-input/${e.id}/${i}-${path.basename(e.assets[i].path)}`
        && a.sha256 === e.assets[i].sha256, 'Event asset identity mismatch');
      checkArtifact(runDir, a);
    });
  }
  return { run, c, checkpoints };
}

export function nextEvents(runDir, root = ROOT) {
  const { c, checkpoints } = currentRun(runDir, root);
  const done = new Set(checkpoints.filter(p => p.terminalStatus === 'completed').map(p => p.checkpointId));
  return c.episode.events.filter(e => !checkpoints.some(p => p.checkpointId === e.checkpoint) && e.after.every(id => done.has(id)));
}

export function deliverEvent(runDir, eventId, root = ROOT) {
  const event = nextEvents(runDir, root).find(e => e.id === eventId);
  requireThat(event, 'Event is not ready');
  const recordPath = path.join(runDir, 'deliveries', `${event.id}.json`);
  requireThat(!fs.existsSync(recordPath), 'Event already delivered');
  const delivery = { id: event.id, kind: event.kind, delivery: event.delivery, payload: event.payload,
    instructions: event.instructions, deliveredAt: new Date().toISOString() };
  if (event.assets?.length) {
    const target = path.join(runDir, 'event-input', event.id);
    requireThat(!fs.existsSync(target), 'Event input already exists');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const staging = fs.mkdtempSync(path.join(path.dirname(target), '.pending-'));
    try {
      delivery.artifacts = event.assets.map((a, i) => {
        const name = `${i}-${path.basename(a.path)}`;
        fs.copyFileSync(checkArtifact(root, a), path.join(staging, name), fs.constants.COPYFILE_EXCL);
        return { path: `event-input/${event.id}/${name}`, sha256: a.sha256 };
      });
      fs.renameSync(staging, target);
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  writeJSON(recordPath, delivery);
  return delivery;
}

export function recordCheckpoint(runDir, receipt, root = ROOT) {
  validateSchema('checkpoint', receipt, root);
  const { run, c, checkpoints } = currentRun(runDir, root);
  requireThat(receipt.runId === run.runId, 'Wrong run ID');
  requireThat(c.episode.checkpoints.some(p => p.id === receipt.checkpointId), 'Unknown checkpoint');
  requireThat(!checkpoints.some(p => p.checkpointId === receipt.checkpointId), 'Checkpoint already recorded; keep original attempts');
  const event = c.episode.events.find(e => e.checkpoint === receipt.checkpointId);
  if (event) {
    requireThat(nextEvents(runDir, root).some(e => e.id === event.id), 'Checkpoint dependencies not satisfied');
    requireThat(fs.existsSync(path.join(runDir, 'deliveries', `${event.id}.json`)), 'Event must be delivered before recording its result');
  }
  receipt.artifactFiles.forEach(a => checkArtifact(runDir, a));
  writeJSON(path.join(runDir, 'checkpoints', `${receipt.checkpointId}.json`), receipt);
  return receipt;
}

export function grade(runDir, judgments, root = ROOT) {
  validateSchema('judgments', judgments, root);
  const { run, c, checkpoints } = currentRun(runDir, root);
  requireThat(judgments.runId === run.runId && judgments.inputDigest === run.caseDigest
    && judgments.rubricDigest === run.rubricDigest, 'Judgments reference the wrong run or rubric');
  unique(judgments.criteria.map(j => j.id), 'judged criterion');
  unique(judgments.gates.map(j => j.id), 'judged gate');
  requireThat(judgments.criteria.length === c.rubric.criteria.length
    && judgments.criteria.every(j => c.rubric.criteria.some(c => c.id === j.id)), 'Every criterion must have exactly one judgment');
  requireThat(judgments.gates.length === c.rubric.gates.length
    && judgments.gates.every(j => c.rubric.gates.some(g => g.id === j.id)), 'Every gate must have exactly one judgment');
  for (const j of judgments.criteria) for (const id of j.evidenceIds) {
    requireThat(c.evidence.some(e => e.id === id && e.status !== 'unverified-lead'), 'Judgment cites unknown or unverified reference evidence');
  }
  const required = judgments.criteria.filter(j => c.rubric.criteria.find(c => c.id === j.id).required);
  const complete = checkpoints.length === c.episode.checkpoints.length && checkpoints.every(c => c.terminalStatus === 'completed');
  const elapsedSeconds = checkpoints.reduce((n, c) => n + c.elapsedSeconds, 0);
  const costUsd = checkpoints.some(c => c.costUsd === null) ? null : checkpoints.reduce((n, c) => n + c.costUsd, 0);
  const budgetVerified = costUsd !== null && costUsd <= run.config.budget.maxUsd && elapsedSeconds <= run.config.budget.maxSeconds;
  const substantivePass = required.every(j => j.verdict === 'pass') && judgments.gates.every(j => j.verdict === 'pass');
  return { schemaVersion: 1, runId: run.runId, caseId: c.task.id, caseVersion: c.task.version,
    caseDigest: run.caseDigest, benchmarkDigest: run.benchmarkDigest,
    executionRunnerDigest: run.runnerDigest, gradingRunnerDigest: runnerDigest(),
    eligible: run.eligible && c.task.status === 'ready' && judgments.reviewerKind !== 'calibration',
    outcome: !complete ? 'incomplete' : !budgetVerified ? 'budget-unverified-or-exceeded' : substantivePass ? 'passed' : 'needs-review',
    acceptance: run.eligible && c.task.status === 'ready' && judgments.reviewerKind === 'human' && complete && budgetVerified && substantivePass ? 'accepted' : 'not-certified',
    requiredPassed: required.filter(j => j.verdict === 'pass').length, requiredTotal: required.length,
    cannotAssess: [...judgments.criteria, ...judgments.gates].filter(j => j.verdict === 'cannot-assess').length,
    privateRepairs: checkpoints.reduce((n, c) => n + c.privateRepairs, 0), costUsd, elapsedSeconds,
    judgments, observation: 'Imported operator receipts and review; no automated source-truth or browser certification implied.' };
}

export function saveGrade(runDir, judgments, root = ROOT) {
  const result = grade(runDir, judgments, root);
  const filename = `grade-${crypto.randomUUID()}.json`;
  writeJSON(path.join(runDir, filename), result);
  return { filename, result };
}
