import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, appendFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import type { CodexTransport } from '@/lib/canvas-v2/codex-app-server/rpc.server';
import { NorthstarCreativeRuntime } from '@/lib/canvas-v2/creative/runtime.server';
import type { CreativeContext, CreativeTool, CreativeJob } from '@/lib/canvas-v2/creative/types';
import { prepareSubagentAsset } from './local-crop';
import { runSubagentImageGeneration, type SubagentImageOptions } from './image-job-relay';

export const SUBAGENT_TEST_KEY = 'northstar-subagent-no-api';
export const SUBAGENT_TEST_MODEL = 'gpt-5.6-luna';
export const SUBAGENT_RELAY_ROOT = join(tmpdir(), 'northstar-subagent-relay');

/** Local exchange only. This transport never imports a model SDK or starts Codex CLI.
 * A Codex subagent reads inbox.json and atomically writes <exchangeId>.response.json.
 * The normal Northstar host/client still owns tool execution, mutations and reviews.
 */
export class SubagentCodexTransport implements CodexTransport {
  private receive: (message: JsonObject) => void = () => {};
  private ended: (error: Error) => void = () => {};
  private threadId = randomUUID();
  private turnId = '';
  private configuration: JsonObject = {};
  private toolNames = new Set<string>();
  private exchangeId = '';
  private pending?: { id: string; callId: string; tool: string; arguments: JsonObject };
  private steerInput: unknown[] = [];
  private closed = false;
  private active = false;
  private polling = false;
  private writes: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval>;

  constructor(readonly cwd: string, pollMs = 100) {
    this.timer = setInterval(() => { void this.poll().catch(error => this.fail(error)); }, pollMs);
    this.timer.unref();
  }
  onMessage(handler: (message: JsonObject) => void) { this.receive = handler; }
  onClose(handler: (error: Error) => void) { this.ended = handler; }
  notify() { /* Handshake notification has no model side effect. */ }
  private emit(method: string, params: JsonObject, id?: string) {
    if (!this.closed) this.receive({ method, params: { threadId: this.threadId, ...params }, ...(id ? { id } : {}) });
  }
  private persist(name: string, value: unknown) {
    const work = this.writes.then(async () => {
      const temporary = join(this.cwd, `.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
      await rename(temporary, join(this.cwd, name));
    });
    this.writes = work.catch(() => undefined);
    return work;
  }
  private async packet(kind: string, content: JsonObject) {
    if (this.closed || !this.active) return;
    const exchangeId = randomUUID();
    this.exchangeId = exchangeId;
    const packet = {
      exchangeId, threadId: this.threadId, turnId: this.turnId, kind,
      configurationPath: join(this.cwd, 'configuration.json'),
      responsePath: join(this.cwd, `${exchangeId}.response.json`),
      ...content,
    };
    await this.persist('inbox.json', packet);
    await appendFile(join(this.cwd, 'transcript.jsonl'), JSON.stringify({ direction: 'to-subagent', ...packet }) + '\n', { mode: 0o600 });
  }
  private async content(parts: unknown): Promise<unknown[]> {
    const result: unknown[] = [];
    for (const raw of Array.isArray(parts) ? parts : []) {
      const part = object(raw);
      const data = string(part.imageUrl || (part.type === 'image' ? part.url : ''));
      const image = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data);
      if (image) {
        if (image[2].length > 14_000_000) throw new Error('Relay image exceeds the transfer limit.');
        const path = join(this.cwd, `${randomUUID()}.${image[1]}`);
        await writeFile(path, Buffer.from(image[2], 'base64'), { mode: 0o600 });
        result.push({ type: 'localImage', path, originalType: part.type });
      } else result.push(part);
    }
    return result;
  }
  async request(method: string, raw: unknown): Promise<JsonObject> {
    if (this.closed) throw new Error('Subagent relay closed.');
    const params = object(raw);
    if (method === 'initialize') return { userAgent: 'northstar-codex-subagent-relay' };
    if (method === 'account/login/start') {
      // Never retain, transmit or accept an actual API key in this mode.
      if (params.type !== 'apiKey' || params.apiKey !== SUBAGENT_TEST_KEY) throw new Error('Subagent tests require the no-API sentinel.');
      return {};
    }
    if (method === 'model/list') return { data: [{ model: SUBAGENT_TEST_MODEL, inputModalities: ['text', 'image'], supportedReasoningEfforts: ['medium', 'high'].map(reasoningEffort => ({ reasoningEffort })) }] };
    if (method === 'thread/start') {
      if (params.model !== SUBAGENT_TEST_MODEL) throw new Error('This relay requires the explicitly requested Luna model.');
      this.configuration = params;
      this.toolNames = new Set((Array.isArray(params.dynamicTools) ? params.dynamicTools : []).map(value => string(object(value).name)));
      await this.persist('configuration.json', { ...params, transport: 'codex-subagent', apiCalls: false, limitations: 'Native Codex instructions remain; API timing, token billing and provider failures are not emulated.' });
      return { thread: { id: this.threadId } };
    }
    if (method === 'turn/start') {
      if (this.active) throw new Error('A subagent turn is already active.');
      if (params.threadId !== this.threadId || params.model !== SUBAGENT_TEST_MODEL || !['medium', 'high'].includes(string(params.effort))) throw new Error('Subagent turn configuration mismatch.');
      this.turnId = randomUUID(); this.active = true;
      this.emit('turn/started', { turn: { id: this.turnId, status: 'inProgress' } });
      await this.packet('turn', { model: params.model, effort: params.effort, outputSchema: params.outputSchema, input: await this.content(params.input) });
      return { turn: { id: this.turnId } };
    }
    if (method === 'turn/steer') {
      if (!this.active || params.expectedTurnId !== this.turnId || params.threadId !== this.threadId) throw new Error('Stale subagent steering request.');
      const input = await this.content(params.input);
      if (this.pending) this.steerInput.push(...input);
      else await this.packet('steer', { input });
      return { turnId: this.turnId };
    }
    if (method === 'turn/interrupt') {
      if (params.threadId !== this.threadId || params.turnId !== this.turnId) throw new Error('Stale subagent interruption.');
      this.active = false; this.exchangeId = ''; this.pending = undefined; this.steerInput = [];
      await this.persist('inbox.json', { kind: 'interrupted', threadId: this.threadId, turnId: this.turnId });
      this.emit('turn/completed', { turn: { id: this.turnId, status: 'interrupted' } });
      return {};
    }
    throw new Error(`Subagent relay does not implement ${method}.`);
  }
  reply(id: string | number, result: unknown) {
    const pending = this.pending;
    if (!this.active || !pending || pending.id !== id) return;
    this.pending = undefined;
    const value = object(result), input = this.steerInput; this.steerInput = [];
    this.emit('item/completed', { turnId: this.turnId, item: { id: pending.callId, type: 'dynamicToolCall', tool: pending.tool, arguments: pending.arguments, status: value.success ? 'completed' : 'failed' } });
    void this.content(value.contentItems).then(contentItems => this.packet('tool_result', { callId: pending.callId, tool: pending.tool, success: value.success, contentItems, ...(input.length ? { additionalInput: input } : {}) })).catch(error => this.fail(error));
  }
  reject(id: string | number, message: string) { this.reply(id, { success: false, contentItems: [{ type: 'inputText', text: message }] }); }
  async poll() {
    if (this.polling || this.closed || !this.active || !this.exchangeId || this.pending) return;
    this.polling = true;
    try {
      const expected = this.exchangeId;
      let response: JsonObject;
      try { response = object(JSON.parse(await readFile(join(this.cwd, `${expected}.response.json`), 'utf8'))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return; throw error; }
      if (!this.active || this.closed || expected !== this.exchangeId) return;
      if (response.exchangeId !== expected || response.turnId !== this.turnId) throw new Error('Subagent response does not match the current exchange/turn.');
      const action = object(response.action);
      // Validate before consuming; failures cannot silently become tool executions.
      if (action.type === 'tool' && (!this.toolNames.has(string(action.name)) || !action.arguments || typeof action.arguments !== 'object' || Array.isArray(action.arguments))) throw new Error('Subagent requested an unregistered tool or invalid arguments.');
      if (!['tool', 'message', 'finish'].includes(string(action.type))) throw new Error('Unknown subagent response action.');
      if (action.type !== 'tool' && (typeof action.text !== 'string' || action.text.length > 1_000_000)) throw new Error('Subagent text is invalid.');
      this.exchangeId = '';
      await appendFile(join(this.cwd, 'transcript.jsonl'), JSON.stringify({ direction: 'from-subagent', ...response }) + '\n', { mode: 0o600 });
      if (this.closed || !this.active || response.turnId !== this.turnId) return;
      if (action.type === 'tool') {
        const id = randomUUID(), callId = randomUUID();
        this.pending = { id, callId, tool: string(action.name), arguments: object(action.arguments) };
        this.emit('item/started', { turnId: this.turnId, item: { id: callId, type: 'dynamicToolCall', tool: action.name, arguments: action.arguments, status: 'inProgress' } });
        this.emit('item/tool/call', { turnId: this.turnId, callId, tool: action.name, arguments: action.arguments }, id);
      } else {
        this.emit('item/completed', { turnId: this.turnId, item: { id: randomUUID(), type: 'agentMessage', phase: action.type === 'finish' ? 'final_answer' : 'commentary', text: action.text } });
        if (action.type === 'finish') {
          this.active = false;
          await this.persist('inbox.json', { kind: 'completed', threadId: this.threadId, turnId: this.turnId });
          this.emit('turn/completed', { turn: { id: this.turnId, status: 'completed' } });
        } else await this.packet('continue', {});
      }
    } finally { this.polling = false; }
  }
  private fail(error: unknown) {
    void this.persist('failure.json', { message: error instanceof Error ? error.message : 'Relay failed.', exchangeId: this.exchangeId, turnId: this.turnId, at: new Date().toISOString() }).catch(() => undefined);
    if (this.closed) return;
    const failure = error instanceof Error ? error : new Error('Subagent relay failed.');
    this.close(); this.ended(failure);
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.active = false; this.exchangeId = ''; this.pending = undefined;
    clearInterval(this.timer);
    void this.persist('inbox.json', { kind: 'closed', threadId: this.threadId, turnId: this.turnId }).catch(() => undefined);
  }
}

export async function subagentCodex(root = SUBAGENT_RELAY_ROOT) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const cwd = await mkdtemp(join(root, 'session-'));
  return new SubagentCodexTransport(cwd);
}

/** Crops use local Pillow; image requests use the real built-in tool relay.
 * Direct API-backed operations still fail closed. */
export class SubagentLocalCreativeRuntime extends NorthstarCreativeRuntime {
  private localJobs = new Map<string, { state: CreativeJob; controller: AbortController; signature: string }>();
  private localClosed = false;
  constructor(model: () => string, private python = process.env.NORTHSTAR_SUBAGENT_PYTHON, private imageOptions: Partial<SubagentImageOptions> = {}) {
    super(SUBAGENT_TEST_KEY, model, { fetcher: async () => { throw new Error('External API calls are disabled in subagent tests.'); } });
  }
  override job(id: string) { return this.localJobs.get(id)?.state; }
  override release(id: string) {
    this.localJobs.get(id)?.controller.abort(new Error('Creative job released.'));
    this.localJobs.delete(id);
  }
  override cancel() {
    for (const job of this.localJobs.values()) if (job.state.status === 'running') job.controller.abort(new Error('Creative work was stopped.'));
  }
  override dispose() { this.localClosed = true; this.cancel(); super.dispose(); }
  override start(id: string, tool: CreativeTool, args: JsonObject, context: CreativeContext): CreativeJob {
    if (!['prepare_asset', 'generate_image'].includes(tool)) throw new Error(`${tool} is disabled in subagent tests because it uses a separate API. Use retained assets or native frontend code.`);
    const signature = createHash('sha256').update(JSON.stringify({tool,args:Object.fromEntries(Object.entries(args).sort(([a],[b])=>a.localeCompare(b))),inputs:context.inputs})).digest('hex');
    const existing = this.localJobs.get(id);
    if (existing) { if(existing.signature !== signature) throw new Error('This creative call already has an immutable request.'); return existing.state; }
    if (this.localClosed) throw new Error('This execution workspace has closed.');
    if (this.localJobs.size >= 32) throw new Error('Too many unacknowledged creative operations.');
    const job = { state: { status: 'running' } as CreativeJob, controller: new AbortController(), signature };
    this.localJobs.set(id, job);
    const work = tool === 'generate_image' ? runSubagentImageGeneration(id, args, context, job.controller.signal, this.imageOptions) : prepareSubagentAsset(args, context, job.controller.signal, this.python);
    void work.then(result => {
      job.controller.signal.throwIfAborted();
      job.state = { status: 'completed', result };
    }).catch(error => { job.state = { status: 'failed', error: (error instanceof Error ? error.message : 'Creative operation failed.').slice(0, 800) }; });
    return job.state;
  }
}
