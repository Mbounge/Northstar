import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadBenchmark, prepare, startRun, currentRun, nextEvents, deliverEvent, recordCheckpoint, saveGrade, readJSON } from './core.mjs';

export function main(args) {
  const [command, ...rest] = args;
  const draft = rest.includes('--allow-draft');
  const positional = rest.filter(a => a !== '--allow-draft');
  const arity = n => { if (positional.length !== n || (draft && !['prepare', 'start'].includes(command))) throw new Error('Invalid arguments; run help'); };
  if (!command || command === 'help') return `Northstar discovery evaluation foundation
  validate                            Validate schemas, sources, assets, splits and episode dependencies
  prepare CASE OUTPUT [--allow-draft]  Export ONLY initial agent inputs; no model calls
  start CONFIG OUTPUT [--allow-draft]  Create an unexecuted manual /canvas episode run
  status RUN                          Show recorded checkpoints and available events
  deliver RUN EVENT                   Release one eligible event to the operator
  record RUN RECEIPT                   Import a checkpoint with hashed artifacts
  grade RUN JUDGMENTS                  Save a new review record; never overwrite history

Drafts and calibration are never certified. No command launches a model or a browser.
The runner refuses unsupported controlled/fixture tracks rather than claiming coverage.
Budgets are recorded and checked after manual execution; this tool cannot stop external API spend.
See evals/discovery/README.md for the operator workflow.`;
  if (command === 'validate') {
    arity(0); const b = loadBenchmark();
    return { benchmark: b.manifest.id, version: b.manifest.version,
      cases: b.cases.map(c => ({ id: c.task.id, status: c.task.status, split: b.assigned.get(c.task.id), digest: c.caseDigest, reviewDigest: c.reviewDigest })),
      note: 'Validation establishes dataset integrity, not research quality or model performance.' };
  }
  if (command === 'prepare') { arity(2); return prepare(positional[0], path.resolve(positional[1]), { allowDraft: draft }); }
  if (command === 'start') { arity(2); return startRun(readJSON(positional[0]), path.resolve(positional[1]), { allowDraft: draft }); }
  if (command === 'status') {
    arity(1); const { run, checkpoints } = currentRun(positional[0]);
    return { runId: run.runId, eligible: run.eligible, checkpoints, availableEvents: nextEvents(positional[0]).map(e => ({ id: e.id, kind: e.kind })) };
  }
  if (command === 'deliver') { arity(2); return deliverEvent(...positional); }
  if (command === 'record') { arity(2); return recordCheckpoint(positional[0], readJSON(positional[1])); }
  if (command === 'grade') { arity(2); return saveGrade(positional[0], readJSON(positional[1])); }
  throw new Error(`Unknown command ${command}. Run help. Dataset: ${ROOT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = main(process.argv.slice(2)); console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
