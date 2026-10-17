import { readFile, writeFile, link, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

/** The model supplies only the action; this helper owns exchange/turn IDs. */
export async function submitSubagentAction(sessionPath, expectedExchangeId, actionPath, acknowledgementMs = 5000) {
  if (!Number.isInteger(acknowledgementMs) || acknowledgementMs < 50 || acknowledgementMs > 10000) throw new Error('Use an acknowledgement deadline between 50 and 10000 ms.');
  const cwd = resolve(sessionPath), inboxPath = join(cwd, 'inbox.json');
  const packet = JSON.parse(await readFile(inboxPath, 'utf8'));
  if (!['turn', 'steer', 'continue', 'tool_result'].includes(packet.kind) || packet.exchangeId !== expectedExchangeId) throw new Error('The exchange is stale or stopped; read the current inbox before responding.');
  if (packet.responsePath !== join(cwd, `${packet.exchangeId}.response.json`)) throw new Error('Invalid relay response path.');
  const action = JSON.parse(await readFile(actionPath, 'utf8'));
  if (!['tool', 'message', 'finish'].includes(action.type)) throw new Error('Unknown action.');
  if (action.type !== 'tool' && (typeof action.text !== 'string' || action.text.length > 1_000_000)) throw new Error('Message and finish actions require a text string, not message or summary.');
  if (action.type === 'tool' && (!action.arguments || typeof action.arguments !== 'object' || Array.isArray(action.arguments))) throw new Error('Tool actions require an arguments object.');
  const configuration = JSON.parse(await readFile(join(cwd, 'configuration.json'), 'utf8'));
  if (action.type === 'tool' && !(configuration.dynamicTools ?? []).some(tool => tool.name === action.name)) throw new Error('Tool is not registered for this session.');
  const receipt = async () => {
    const ledger = await readFile(join(cwd, 'transcript.jsonl'), 'utf8').catch(() => '');
    return ledger.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(entry => entry.direction === 'from-subagent' && entry.exchangeId === packet.exchangeId && entry.turnId === packet.turnId);
  };
  const verifyExisting = async () => {
    const existing = JSON.parse(await readFile(packet.responsePath, 'utf8'));
    if (existing.exchangeId !== packet.exchangeId || existing.turnId !== packet.turnId || !isDeepStrictEqual(existing.action, action)) throw new Error('An action is already submitted for this exchange. Do not replace it while its tool or review is running.');
  };
  const alreadyConsumed = await receipt();
  if (alreadyConsumed && !isDeepStrictEqual(alreadyConsumed.action, action)) throw new Error('This exchange already consumed a different action. Wait for a new exchange; tool execution and review may still be running.');
  const temporary = join(cwd, `.${randomUUID()}.response.tmp`);
  await writeFile(temporary, JSON.stringify({ exchangeId: packet.exchangeId, turnId: packet.turnId, action }), { mode: 0o600 });
  try {
    const current = JSON.parse(await readFile(inboxPath, 'utf8'));
    if (current.exchangeId !== packet.exchangeId || current.turnId !== packet.turnId) throw new Error('The exchange changed before submission.');
    try { await link(temporary, packet.responsePath); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await verifyExisting(); // An identical retry is idempotent; never overwrite.
    }
  } finally { await rm(temporary, { force: true }); }
  const deadline = Date.now() + acknowledgementMs;
  while (Date.now() < deadline) {
    const consumed = await receipt();
    if (consumed) return { status: 'consumed', exchangeId: packet.exchangeId, actionType: action.type, responsePath: packet.responsePath, note: 'Model reply consumed. Tool execution and quality approval are separate.' };
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const latest = JSON.parse(await readFile(inboxPath, 'utf8'));
  throw new Error(`Reply was written but not consumed by the transport (inbox: ${latest.kind}). Do not claim completion or approval.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , sessionPath, expectedExchangeId, actionPath] = process.argv;
  if (!sessionPath || !expectedExchangeId || !actionPath) throw new Error('Usage: node scripts/northstar-subagent-reply.mjs SESSION EXPECTED_EXCHANGE ACTION_JSON');
  console.log(JSON.stringify(await submitSubagentAction(sessionPath, expectedExchangeId, actionPath, process.argv[5] ? Number(process.argv[5]) : 5000)));
}
