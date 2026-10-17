import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import type { RetainedFixtureManifest } from '../../mixed-fixture.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const host = request.headers.get('host') ?? '';
  const path = process.env.NORTHSTAR_MIXED_FIXTURE_PATH;
  if (process.env.NORTHSTAR_E2E !== '1' || !path || !isAbsolute(path)
    || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)
    || process.env.NODE_ENV === 'production' && process.env.NORTHSTAR_LOCAL_PRODUCTION_PROBE !== '1') return new Response(null, { status: 404 });
  const { key } = await params;
  if (!/^[a-f0-9]{64}$/.test(key)) return new Response(null, { status: 404 });
  try {
    const manifest = JSON.parse(await readFile(join(dirname(path), 'retained-manifest.json'), 'utf8')) as RetainedFixtureManifest;
    const entry = Object.values(manifest).find(value => value.key === key);
    if (!entry || !/^image\/(png|jpeg|webp|gif|avif|svg\+xml)$/.test(entry.mimeType)) return new Response(null, { status: 404 });
    const imagePath = join(dirname(path), 'retained', key);
    const info = await stat(imagePath);
    if (!info.isFile() || info.size !== entry.bytes || info.size > 8 * 1024 * 1024) return new Response(null, { status: 404 });
    const bytes = await readFile(imagePath);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) return new Response(null, { status: 404 });
    return new Response(bytes, { headers: { 'Content-Type': entry.mimeType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}
