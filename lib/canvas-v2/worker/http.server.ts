import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { object, type JsonObject } from '../managed-agent/protocol';
import { requireWorkerSecret, verifyWorkerGrant, workerOrigin } from './auth.server';

export interface WorkerConfig { publicOrigin: string; allowedOrigins: Set<string>; secret: string; apiKey: string; maxBodyBytes: number; }
export interface WorkerHost { handle(body: JsonObject, options: { owner: string; key: string; signal: AbortSignal }): Promise<Response>; dispose(): void; }
export function workerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const development = env.NODE_ENV !== 'production';
  const publicOrigin = workerOrigin(env.NORTHSTAR_WORKER_PUBLIC_URL || (env.RENDER_EXTERNAL_URL ?? ''), development);
  const allowedOrigins = new Set((env.NORTHSTAR_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => workerOrigin(s, development)));
  if (!allowedOrigins.size) throw new Error('Configure NORTHSTAR_ALLOWED_ORIGINS with exact Northstar app origins.');
  if (!env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY in the worker secrets.');
  return { publicOrigin, allowedOrigins, secret: requireWorkerSecret(env.NORTHSTAR_WORKER_SECRET || ''), apiKey: env.OPENAI_API_KEY, maxBodyBytes: 12_000_000 };
}
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function readBody(request: IncomingMessage, max: number): Promise<JsonObject> {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Send JSON content.');
  if (Number(request.headers['content-length']) > max) throw new HttpError(413, 'Message is too large.');
  const parts: Buffer[] = []; let size = 0;
  for await (const part of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part); size += bytes.length;
    if (size > max) throw new HttpError(413, 'Message is too large.');
    parts.push(bytes);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return object(parsed);
  } catch { throw new HttpError(400, 'Invalid request.'); }
}
export function createWorkerServer(host: WorkerHost, config: WorkerConfig) {
  let stopping = false;
  let active = 0;
  const connections = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    response.on('close', disconnect);
    const json = (status: number, body: unknown) => {
      if (response.headersSent || response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = (request.url || '').split('?')[0];
    if (request.method === 'GET' && ['/healthz', '/readyz'].includes(path)) { json(stopping ? 503 : 200, { ready: !stopping }); return; }
    if (path !== '/v1/codex') { json(404, { error: 'Not found.' }); return; }
    const origin = request.headers.origin || '';
    if (!config.allowedOrigins.has(origin)) { json(403, { error: 'Invalid origin.' }); return; }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      const headers = (request.headers['access-control-request-headers'] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' || headers.some(h => !['authorization', 'content-type'].includes(h))) { json(403, { error: 'Invalid preflight.' }); return; }
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }); response.end(); return;
    }
    if (request.method !== 'POST') { json(405, { error: 'Method not allowed.' }); return; }
    if (stopping || active >= 64) { response.setHeader('Retry-After', '5'); json(503, { error: 'The discovery worker is busy. Try again shortly.' }); return; }
    let owner: string;
    try { owner = verifyWorkerGrant((request.headers.authorization || '').replace(/^Bearer /, ''), origin, config.publicOrigin, config.secret).sub; }
    catch { json(401, { error: 'Reconnect through Northstar to authorize the worker.' }); return; }
    active++; connections.add(response);
    const bodyTimeout = setTimeout(() => request.destroy(), 15_000); bodyTimeout.unref();
    try {
      const body = await readBody(request, config.maxBodyBytes); clearTimeout(bodyTimeout);
      const result = await host.handle(body, { owner, key: config.apiKey, signal: controller.signal });
      if (response.destroyed) { await result.body?.cancel(); return; }
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.setHeader('Cache-Control', 'no-store, no-transform');
      response.writeHead(result.status); response.flushHeaders();
      if (result.body) await pipeline(Readable.fromWeb(result.body as NodeReadableStream<Uint8Array>), response);
      else response.end();
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message.replaceAll(config.apiKey, '[redacted]').replaceAll(config.secret, '[redacted]') : 'The discovery worker could not complete this request.';
      json(error instanceof HttpError ? error.status : 400, { error: message });
      if (response.headersSent && !response.writableEnded) response.destroy();
    } finally { clearTimeout(bodyTimeout); active--; connections.delete(response); response.off('close', disconnect); }
  });
  server.requestTimeout = 20_000; server.headersTimeout = 10_000;
  // Response streams are long-lived. Heartbeats and explicit disconnects control their lifetime.
  server.timeout = 0;
  const shutdown = () => {
    stopping = true; host.dispose();
    for (const response of connections) response.end();
    server.close(); server.closeIdleConnections();
  };
  return { server, shutdown };
}
