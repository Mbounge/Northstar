import { CodexSessionHost } from '@/lib/canvas-v2/codex-app-server/server';
import { readCanvasV2PublicMedia } from '@/lib/canvas-v2/source-media.server';
import { readNorthstarSource } from '@/lib/canvas-v2/agent-source.server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
import { fixtureCodex } from '../fixture';
export const dynamic = 'force-dynamic';
const fixture = globalThis as typeof globalThis & { northstarCodexFixtureHost?: CodexSessionHost; northstarCodexFixtureFactory?: typeof fixtureCodex; northstarCodexFixtureVersion?: number };
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, { status: 404 });
  // Replace the pre-hot-reload factory once; subsequent module reloads update
  // the factory indirection while already-running fixture sessions stay intact.
  if (fixture.northstarCodexFixtureVersion !== 5) {
    fixture.northstarCodexFixtureHost?.dispose(); fixture.northstarCodexFixtureHost = undefined;
    fixture.northstarCodexFixtureVersion = 5;
  }
  fixture.northstarCodexFixtureFactory = fixtureCodex;
  try { return await (fixture.northstarCodexFixtureHost ??= new CodexSessionHost(() => fixture.northstarCodexFixtureFactory!(new URL(request.url).origin), (action, signal) => readNorthstarSource(action, signal, async url => {
    // Explicit real-source integration case; ordinary fixtures remain local and deterministic.
    if (url === 'https://www.abrielle.ca/menus' || ['https://images.squarespace-cdn.com', 'https://static1.squarespace.com', 'http://static1.squarespace.com'].includes(new URL(url).origin)) return readCanvasV2PublicMedia(url, signal);
    const base = new URL(request.url).origin + '/canvas-v2-e2e/codex/media/';
    if (url === base + 'article') return { url, mimeType: 'text/html', bytes: Buffer.from(`<h1>A source with useful media</h1><p>Compare a still reference with a short motion demonstration.</p><img src="${base}reference.png" alt="Reference diagram"><img src="${base}motion.gif" alt="Animated reference"><video src="${base}demo.mp4" title="Motion demonstration"></video>`) };
    const name = url.slice(base.length);
    if (!url.startsWith(base) || !['reference.png','motion.gif'].includes(name)) throw new Error('Fixture allows only its known source page and images.');
    return { url, mimeType: name.endsWith('.gif') ? 'image/gif' : 'image/png', bytes: await readFile(join(process.cwd(),'app/canvas-v2-e2e/codex/media-assets',name)) };
  }))).handle(object(await request.json()), { owner: 'fixture', key: 'not-a-real-key', signal: request.signal }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Fixture failed' }, { status: 400 }); }
}
