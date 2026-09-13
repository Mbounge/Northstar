import { createHmac, timingSafeEqual } from 'node:crypto';

export const WORKER_GRANT_SECONDS = 300;
export interface WorkerGrant { sub: string; aud: string; origin: string; iat: number; exp: number; scope: 'northstar:codex'; }
export function workerOrigin(value: string, development = false): string {
  const url = new URL(value);
  const local = development && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure an HTTPS worker/app origin without a path.');
  return url.origin;
}
export function requireWorkerSecret(secret: string): string {
  if (Buffer.byteLength(secret) < 32) throw new Error('Configure NORTHSTAR_WORKER_SECRET with at least 32 random bytes.');
  return secret;
}
export function issueWorkerGrant(owner: string, origin: string, audience: string, secret: string, now = Date.now()) {
  requireWorkerSecret(secret);
  if (!owner || owner.length > 256) throw new Error('Invalid account identity.');
  const iat = Math.floor(now / 1000);
  const grant: WorkerGrant = { sub: owner, origin, aud: audience, iat, exp: iat + WORKER_GRANT_SECONDS, scope: 'northstar:codex' };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return { accessToken: `${header}.${payload}.${signature}`, expiresAt: grant.exp * 1000 };
}
export function verifyWorkerGrant(token: string, origin: string, audience: string, secret: string, now = Date.now()): WorkerGrant {
  requireWorkerSecret(secret);
  try {
    if (token.length > 4096) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const h = JSON.parse(Buffer.from(header, 'base64url').toString());
    const g = JSON.parse(Buffer.from(payload, 'base64url').toString()) as WorkerGrant;
    const seconds = Math.floor(now / 1000);
    if (h.alg !== 'HS256' || h.typ !== 'JWT' || g.scope !== 'northstar:codex' || g.origin !== origin || g.aud !== audience || typeof g.sub !== 'string' || !g.sub || g.sub.length > 256 || !Number.isInteger(g.exp) || !Number.isInteger(g.iat) || g.iat > seconds + 10 || g.exp <= seconds || g.exp - g.iat !== WORKER_GRANT_SECONDS) throw new Error();
    return g;
  } catch { throw new Error('Your worker access has expired or is invalid. Reconnect through Northstar.'); }
}
