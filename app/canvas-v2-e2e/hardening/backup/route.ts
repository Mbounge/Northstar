import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {HARDENING_BACKUP_MAX_BYTES,inspectHardeningBackup} from '../backup-archive';
export const runtime='nodejs';
export const dynamic='force-dynamic';

/** DEV-only, same-origin loopback copy of an explicitly prepared UI archive.
 * The client cannot choose a directory or filename; existing backups survive. */
export async function POST(request:Request){
  const url=new URL(request.url),host=request.headers.get('host')??'';
  if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1'||!/^(localhost|127\.0\.0\.1):\d+$/.test(host)||request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return new Response(null,{status:404});
  const advertised=Number(request.headers.get('content-length'));
  if(advertised>HARDENING_BACKUP_MAX_BYTES)return new Response('Snapshot exceeds 128 MiB.',{status:413});
  const reader=request.body?.getReader();if(!reader)return new Response('Missing prepared snapshot.',{status:400});
  try{
    const chunks:Uint8Array[]=[];let total=0;
    for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>HARDENING_BACKUP_MAX_BYTES){await reader.cancel();return new Response('Snapshot exceeds 128 MiB.',{status:413})}chunks.push(next.value)}
    const bytes=Buffer.concat(chunks),inspection=await inspectHardeningBackup(bytes),directory=join(process.cwd(),'outputs','designer-workspace-hardening-20261018');
    const basename='main-board-backup-'+new Date().toISOString().replaceAll(':','-')+'-'+inspection.sha256.slice(0,12)+'-'+randomUUID().slice(0,8)+'.json',path=join(directory,basename);
    const onDiskSourceHashes:Record<string,string>={};for(const file of ['components/canvas-v2/interactive-screen.tsx','components/canvas-v2/canvas-v2-workspace.tsx','lib/canvas-v2/screen-design-edit.ts'])onDiskSourceHashes[file]=createHash('sha256').update(await readFile(join(process.cwd(),file))).digest('hex');
    const receipt={...inspection,path,origin:url.origin,mode:'development',savedAt:new Date().toISOString(),onDiskSourceHashes,sourceIdentityBoundary:'On-disk source hashes at backup time; not a claim about a production build or finished HMR.'};
    await mkdir(directory,{recursive:true});await writeFile(path,bytes,{flag:'wx',mode:0o600});await writeFile(path+'.receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    return Response.json(receipt,{headers:{'cache-control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not validate and back up this prepared snapshot.'},{status:400})}finally{reader.releaseLock()}
}
