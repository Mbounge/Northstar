import { readFile } from 'node:fs/promises';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null, {status:404});
  const root = '/Users/mbounge/Documents/Codex/2026-09-05/do-x20/outputs/northstar-discovery-improvements';
  const current = JSON.parse(await readFile(`${root}/codex-ikea-live-02.current.json`, 'utf8'));
  const first = JSON.parse((await readFile(`${root}/codex-ikea-live-02.events.jsonl`, 'utf8')).split('\n')[0]);
  return Response.json({ ...current, prompt: first.prompt, startedAt: first.startedAt }, {headers:{'Cache-Control':'no-store'}});
}
