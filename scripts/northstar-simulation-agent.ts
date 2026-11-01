#!/usr/bin/env -S node --import tsx
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareSimulation, runSimulation, withRunLock, unlock } from './simulation-agent/agent';
import { submitReply } from './simulation-agent/model';

export async function main(argv = process.argv.slice(2)) {
  const command = argv.shift();
  if (!['prepare','run','reply','status','unlock'].includes(command ?? '')) throw new Error('Commands: prepare, run, reply, status, unlock. See docs/app-simulation-agent.md');
  const { values } = parseArgs({ args: argv, options: {
    session: { type: 'string' }, 'related-session': { type: 'string', multiple: true }, output: { type: 'string' }, manifest: { type: 'string' }, 'assets-dir': { type: 'string' }, select: { type: 'string', multiple: true }, width: { type: 'string' }, height: { type: 'string' },
    provider: { type: 'string', default: 'exchange' }, model: { type: 'string' }, 'max-rounds': { type: 'string', default: '3' }, 'max-calls': { type: 'string', default: '24' }, request: { type: 'string' }, response: { type: 'string' },
  } });
  const session = values.session ? resolve(values.session) : undefined;
  const output = values.output ? resolve(values.output) : session ? join(session, 'simulation') : undefined;
  if (command === 'reply') {
    if (!values.request || !values.response) throw new Error('reply requires --request request.json --response authored-response.json');
    await submitReply(resolve(values.request), JSON.parse(await readFile(resolve(values.response), 'utf8'))); return { stage: 'response_recorded' };
  }
  if (!output) throw new Error('Supply --session CAPTURE_DIR or --output PREPARED_SIMULATION_DIR');
  if (command === 'status') return JSON.parse(await readFile(join(output, 'status.json'), 'utf8'));
  if (command === 'unlock') { await unlock(output); return { stage: 'unlocked' }; }
  return withRunLock(output, async () => {
    if (command === 'prepare') {
      if (!session) throw new Error('prepare requires --session');
      return prepareSimulation(session, output, { relatedSessions: values['related-session'], manifest: values.manifest, assetsDir: values['assets-dir'], select: values.select, width: values.width ? Number(values.width) : undefined, height: values.height ? Number(values.height) : undefined });
    }
    if (command !== 'run') throw new Error('Commands: prepare, run, reply, status, unlock. Preparation never calls a model. run defaults to the subscription-agent file exchange.');
    if (!['exchange', 'openai'].includes(values.provider)) throw new Error('Choose provider exchange or openai explicitly');
    const maxRounds = Number(values['max-rounds']), maxCalls = Number(values['max-calls']);
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5 || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100) throw new Error('Repair rounds must be 1–5; model-call budget 1–100');
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      return await runSimulation(output, { provider: values.provider as 'exchange' | 'openai', model: values.model ?? process.env.MOBILESPY_SIMULATION_MODEL ?? process.env.MOBILESPY_PROCESSING_MODEL ?? 'gpt-6-luna', maxRounds, maxCalls, signal: controller.signal });
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => { console.log(JSON.stringify(result, null, 2)); if (['failed', 'needs_review', 'interrupted'].includes(result.stage)) process.exitCode = 1; }).catch(error => { console.error(JSON.stringify({ stage: 'failed', error: error instanceof Error ? error.message : 'Simulation failed' })); process.exitCode = 1; });
}
