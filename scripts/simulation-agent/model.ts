import { readFile, mkdir, open, rename, readdir, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha } from './evidence';
import { validateShape } from './contracts';

export async function atomicJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`, handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, path);
}
async function exclusiveJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await atomicJson(temporary, value); await link(temporary, path); }
  finally { await unlink(temporary).catch(() => undefined); }
}
function assertRequestIdentity(request: Record<string, any>) {
  const input: ModelRequest = { purpose: request.purpose, instructions: request.instructions, context: request.context, schema: request.schema, images: request.images };
  if (sha(JSON.stringify(input)) !== request.digest) throw new Error('Prepared agent request was modified');
}
export class AwaitingAgent extends Error { constructor(readonly request: string) { super('Awaiting an agent response'); } }
export type ModelRequest = { purpose: string; instructions: string; context: unknown; schema: object; images: Array<{ label: string; path: string; sha256: string }> };
export interface Model { json(request: ModelRequest): Promise<unknown> }

/** Every stage is checkpointed and keyed by its exact evidence, code and pixels.
 * Exchange mode uses a real external/subscription agent, not canned decisions.
 * Provider mode never retries an uncertain billable request automatically. */
export class CheckpointModel implements Model {
  private calls = 0;
  constructor(private options: { directory: string; provider: 'exchange' | 'openai'; model: string; maxCalls: number; signal: AbortSignal; fetcher?: typeof fetch; key?: string }) {}
  async json(input: ModelRequest) {
    this.options.signal.throwIfAborted();
    if (++this.calls > this.options.maxCalls) throw new Error('Model-call budget reached; retained draft remains unverified');
    if (!/^[a-z0-9_-]{1,70}$/.test(input.purpose)) throw new Error('Invalid model stage');
    const digest = sha(JSON.stringify(input)), directory = join(this.options.directory, `${input.purpose}-${digest.slice(0, 20)}`);
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const jobs = (await readdir(this.options.directory, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
    if (!jobs.includes(directory.slice(this.options.directory.length + 1)) && jobs.length >= this.options.maxCalls) throw new Error('Durable model-call budget reached; resuming cannot reset it');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const requestPath = join(directory, 'request.json'), responsePath = join(directory, 'response.json');
    let prior: Record<string, any> | undefined;
    try { prior = JSON.parse(await readFile(requestPath, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const request = prior ?? { version: 1, id: randomUUID(), digest, provider: this.options.provider, model: this.options.model, ...input };
    if (request.digest !== digest || request.provider !== this.options.provider || request.model !== this.options.model) throw new Error('Stage identity changed; use a new output directory');
    assertRequestIdentity(request);
    if (!prior) await atomicJson(requestPath, request);
    // Hash pixels even on exchange/cache resume, never accept stale evidence.
    for (const image of input.images) if (sha(await readFile(image.path)) !== image.sha256) throw new Error('Model image changed after its request was prepared');
    try {
      const response = JSON.parse(await readFile(responsePath, 'utf8'));
      if (response.requestId !== request.id || response.digest !== digest) throw new Error('Stale model response');
      validateShape(input.schema, response.value);
      return response.value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (this.options.provider === 'exchange') throw new AwaitingAgent(requestPath);
    const key = this.options.key ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is required only for explicitly selected OpenAI provider mode');
    const content: Record<string, unknown>[] = [{ type: 'input_text', text: JSON.stringify(input.context) }];
    let imageBytes = 0;
    for (const image of input.images) {
      const data = await readFile(image.path);
      imageBytes += data.length;
      if (imageBytes > 24_000_000 || input.images.length > 64) throw new Error('Model image budget exceeded; select a smaller captured scope without reducing fidelity');
      if (sha(data) !== image.sha256) throw new Error('Model image changed after its request was prepared');
      content.push({ type: 'input_text', text: image.label }, { type: 'input_image', image_url: `data:image/png;base64,${data.toString('base64')}`, detail: 'high' });
    }
    this.options.signal.throwIfAborted();
    const receipt = join(directory, 'provider-started.json');
    try { const handle = await open(receipt, 'wx', 0o600); await handle.writeFile(JSON.stringify({ requestId: request.id, startedAt: new Date().toISOString() })); await handle.close(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Previous provider request has an uncertain outcome. Recover its response or use a fresh run; it will not be replayed automatically.'); throw error; }
    const response = await (this.options.fetcher ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([this.options.signal, AbortSignal.timeout(180_000)]),
      body: JSON.stringify({ model: this.options.model, instructions: input.instructions, input: [{ role: 'user', content }], reasoning: { effort: 'high' }, max_output_tokens: 24000, text: { format: { type: 'json_schema', name: 'northstar_simulation', strict: true, schema: input.schema } }, store: false }),
    });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}; raw provider content is not logged`);
    const body = await response.json() as Record<string, any>;
    if (body.status !== 'completed') throw new Error('Model did not finish; partial code or a refusal cannot be approved');
    const raw = (body.output ?? []).flatMap((item: any) => item.type === 'message' ? (item.content ?? []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text) : []).join('');
    this.options.signal.throwIfAborted();
    const value = JSON.parse(raw); validateShape(input.schema, value);
    await atomicJson(responsePath, { requestId: request.id, digest, value, usage: body.usage ?? null });
    return value;
  }
}

/** A reply binds to one immutable request; it cannot approve a later candidate. */
export async function submitReply(requestPath: string, value: unknown) {
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  assertRequestIdentity(request);
  if (request.provider !== 'exchange') throw new Error('Only exchange requests accept submitted agent responses');
  validateShape(request.schema, value);
  for (const image of request.images) if (sha(await readFile(image.path)) !== image.sha256) throw new Error('Request image is stale');
  const responsePath = join(requestPath, '..', 'response.json');
  const output = { requestId: request.id, digest: request.digest, value };
  try { const old = JSON.parse(await readFile(responsePath, 'utf8')); if (JSON.stringify(old) !== JSON.stringify(output)) throw new Error('An agent response already exists for this request'); return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // The run lock prevents two coordinators. Exclusive response creation also
  // prevents two reviewers from silently replacing one another's decision.
  await exclusiveJson(responsePath, output);
}
