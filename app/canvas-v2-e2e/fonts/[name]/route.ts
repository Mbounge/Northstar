import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function GET(_request:Request,{params}:{params:Promise<{name:string}>}){
 if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')return new Response(null,{status:404});
 const {name}=await params;
 if(!/^MonaSans-(Regular|Medium|SemiBold|Bold|ExtraBold|Black|BoldItalic)\.ttf$/.test(name))return new Response(null,{status:404});
 const bytes=await readFile(join(process.cwd(),'public','graet-replica','fonts',name));
 return new Response(bytes,{headers:{'content-type':'font/ttf','cache-control':'private, max-age=3600'}});
}
