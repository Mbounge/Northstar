import { resolve } from 'node:path';
import { listImageGenerationRequests, claimImageGeneration } from './northstar-imagegen-protocol.mjs';
async function main(){
  const args=process.argv.slice(2);
  if(args[0]==='--claim'){
    if(!args[1]||!args[2])throw new Error('Usage: --claim JOB_PATH EXPECTED_REQUEST_HASH');
    console.log(JSON.stringify(await claimImageGeneration(resolve(args[1]),args[2]),null,2));
  }else console.log(JSON.stringify(await listImageGenerationRequests(args[0]?resolve(args[0]):undefined),null,2));
}
main().catch(error=>{console.error(`northstar-imagegen-pending: ${error.message}`);process.exitCode=1;});
