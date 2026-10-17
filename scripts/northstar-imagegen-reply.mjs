import { resolve } from 'node:path';
import { submitImageGenerationArtifact } from './northstar-imagegen-protocol.mjs';
const [, ,jobPath,expectedHash,artifactPath]=process.argv;
if(!jobPath||!expectedHash||!artifactPath){console.error('Usage: node scripts/northstar-imagegen-reply.mjs JOB_PATH EXPECTED_REQUEST_HASH ACTUAL_TOOL_PNG');process.exitCode=1;}
else submitImageGenerationArtifact(resolve(jobPath),expectedHash,resolve(artifactPath)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(`northstar-imagegen-reply: ${error.message}`);process.exitCode=1;});
