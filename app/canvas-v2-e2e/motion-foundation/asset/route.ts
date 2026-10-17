import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function GET(){
 if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')return new Response('Not found',{status:404});
 const bytes=await readFile(path.join(process.cwd(),'public/northstar-test-media/stride-athlete.glb'));
 return new Response(bytes,{headers:{'content-type':'model/gltf-binary','cache-control':'no-store'}});
}
