import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
async function readJob(path) {
    const inbox=JSON.parse(await readFile(join(path,'inbox.json'),'utf8'));
    const config=JSON.parse(await readFile(join(path,'configuration.json'),'utf8'));
    if(!['turn','tool_result','steer'].includes(inbox.kind)||!inbox.exchangeId)return;
    if(typeof inbox.responsePath!=='string'||!inbox.responsePath)throw new Error('The pending inbox has no responsePath.');
    const text=(Array.isArray(inbox.input)?inbox.input:[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
    let stage;try{stage=JSON.parse(text).reviewStage;}catch{}
    const reviewer=Array.isArray(config.dynamicTools)&&!config.dynamicTools.length;
    const ageSeconds=Math.round((Date.now()-(await stat(join(path,'inbox.json'))).mtimeMs)/1000);
    const submitted=Boolean(await stat(inbox.responsePath).catch(()=>null));
    return {session:basename(path),path,role:reviewer?(stage==='initial_appearance'?'initial':'final'):'author',effort:inbox.effort??config.config?.model_reasoning_effort,exchangeId:inbox.exchangeId,kind:inbox.kind,ageSeconds,submitted};
}

async function main() {
  const explicit=process.argv[2]!==undefined;
  const root=explicit?resolve(process.argv[2]):join(tmpdir(),'northstar-subagent-relay');
  let names;
  try { names=await readdir(root); }
  catch(error) {
    // A fresh machine has no default relay yet. An explicitly supplied missing
    // path is a polling mistake and must never look like an empty queue.
    if(!explicit&&error.code==='ENOENT') { process.stdout.write('[]\n'); return; }
    throw new Error(`Cannot read relay root or session directory ${root}: ${error.message}. Pass an existing relay root or session path.`);
  }
  const jobs=[];
  const hasSessionChildren=names.some(name=>name.startsWith('session-'));
  if(explicit&&(names.includes('inbox.json')||names.includes('configuration.json')||basename(root).startsWith('session-')&&!hasSessionChildren)) {
    try { const job=await readJob(root); if(job)jobs.push(job); }
    catch(error) { throw new Error(`Invalid relay session ${root}: ${error.message}. A session needs readable inbox.json and configuration.json; pass its parent relay root to scan all sessions.`); }
  } else {
    for(const name of names) {
      if(!name.startsWith('session-'))continue;
      try { const job=await readJob(join(root,name)); if(job)jobs.push(job); }
      catch { /* A root scan tolerates an incomplete or removed child session. */ }
    }
  }
  jobs.sort((a,b)=>a.ageSeconds-b.ageSeconds);
  process.stdout.write(JSON.stringify(jobs,null,2)+'\n');
}

main().catch(error=>{process.stderr.write(`northstar-subagent-pending: ${error.message}\n`);process.exitCode=1;});
