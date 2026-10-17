import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, { status: 404 });
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || request.headers.get('origin') !== url.origin) return new Response(null, { status: 403 });
  const type = request.headers.get('content-type') || '';
  if (!/^video\/(mp4|webm)(;|$)/.test(type)) return Response.json({ error: 'Video take required' }, { status: 415 });
  const expectedLength = Number(request.headers.get('content-length') || 0);
  if (expectedLength > 256_000_000) return Response.json({ error: 'Take is too large; save a shorter recording' }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 256_000_000 || (expectedLength && expectedLength !== bytes.length)) return Response.json({ error: 'Take size is invalid or incomplete' }, { status: 413 });
  const directory = resolve(process.cwd(), '../../outputs/northstar-studio-film/2026-10-16/captures');
  await mkdir(directory, { recursive: true });
  const take = url.searchParams.get('take');
  if (take) {
    const part = Number(url.searchParams.get('part'));
    const parts = Number(url.searchParams.get('parts'));
    if (!/^[a-f0-9-]{36}$/.test(take) || !Number.isInteger(part) || !Number.isInteger(parts) || parts < 1 || parts > 16 || part < 0 || part >= parts || bytes.length > 24_000_000) return new Response(null, { status: 400 });
    const staging = resolve(directory, `.parts-${take}`);
    await mkdir(staging, { recursive: true });
    await writeFile(resolve(staging, `${part}`), bytes, { flag: 'wx' });
    if (part < parts - 1) return Response.json({ part });
    const buffers = await Promise.all(Array.from({ length: parts }, (_, index) => readFile(resolve(staging, `${index}`))));
    if (buffers.reduce((sum, buffer) => sum + buffer.length, 0) > 256_000_000) return new Response(null, { status: 413 });
    const name = `studio-native-${Date.now()}-${take.slice(0, 8)}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    await writeFile(resolve(directory, name), Buffer.concat(buffers), { flag: 'wx' });
    await rm(staging, { recursive: true });
    return Response.json({ name });
  }
  const name = `studio-native-${Date.now()}-${randomUUID().slice(0, 8)}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
  await writeFile(resolve(directory, name), bytes, { flag: 'wx' });
  return Response.json({ name });
}
