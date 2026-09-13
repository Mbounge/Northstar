import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function GET(_request: Request, context: { params: Promise<{name:string}> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') return new Response(null,{status:404});
  const {name} = await context.params;
  if (name === 'article') return new Response('<h1>Media fixture source</h1><p>Generated test patterns for browser verification.</p>',{headers:{'Content-Type':'text/html'}});
  const types: Record<string,string> = {'reference.png':'image/png','motion.gif':'image/gif','demo.mp4':'video/mp4'};
  if (!types[name]) return new Response(null,{status:404});
  return new Response(await readFile(join(process.cwd(),'app/canvas-v2-e2e/codex/media-assets',name)),{headers:{'Content-Type':types[name]}});
}
