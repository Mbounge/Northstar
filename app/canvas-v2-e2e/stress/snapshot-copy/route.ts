import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const maximumBytes = 128 * 1024 * 1024;

/** Dev-only escape hatch for Chrome extensions that cannot save a prepared blob.
 * It copies to one fixed temporary fixture path, never to an arbitrary filename.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? '';
  if (process.env.NORTHSTAR_E2E !== '1' || process.env.NODE_ENV === 'production'
    || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)
    || request.headers.get('origin') !== url.origin
    || !['application/json', 'application/gzip'].includes(request.headers.get('content-type')?.split(';')[0] ?? '')) {
    return new Response(null, { status: 404 });
  }
  const advertised = Number(request.headers.get('content-length'));
  if (advertised > maximumBytes) return new Response('Fixture exceeds 128 MiB.', { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('Missing snapshot.', { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); return new Response('Fixture exceeds 128 MiB.', { status: 413 }); }
      chunks.push(next.value);
    }
    const body = Buffer.concat(chunks);
    const text = (request.headers.get('content-type') === 'application/gzip'
      ? gunzipSync(body, { maxOutputLength: maximumBytes }) : body).toString('utf8');
    const snapshot = JSON.parse(text);
    if (snapshot?.schema !== 1 || snapshot.revision?.state !== 'committed'
      || typeof snapshot.revision.document?.html !== 'string' || !Array.isArray(snapshot.revision.evidence)) {
      return new Response('Expected a prepared Northstar snapshot.', { status: 400 });
    }
    const directory = join(tmpdir(), 'northstar-mixed-board-fixture');
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `${randomUUID()}.json`);
    try {
      await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(directory, 'snapshot.json'));
    } finally { await unlink(temporary).catch(() => {}); }
    return Response.json({ copied: true, bytes: Buffer.byteLength(text), transferredBytes: bytes });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not copy the prepared snapshot.' }, { status: 400 });
  } finally { reader.releaseLock(); }
}
