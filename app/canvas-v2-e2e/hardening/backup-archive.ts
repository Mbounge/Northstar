import { createHash } from 'node:crypto';
import { importSubagentSnapshotBlob, SUBAGENT_SNAPSHOT_MAX_BYTES } from '../codex-subagent/snapshot';
export { SUBAGENT_SNAPSHOT_MAX_BYTES as HARDENING_BACKUP_MAX_BYTES };

/** Validate the same portable archive accepted by the visible Import UI.
 * Return bounded metadata, never media bytes or a replacement live state. */
export async function inspectHardeningBackup(bytes: Uint8Array) {
  const snapshot=await importSubagentSnapshotBlob(new Blob([new Uint8Array(bytes)],{type:'application/json'}));
  const html=snapshot.revision.document.html,ids=new Set([...html.matchAll(/data-canvas-v2-node-id\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]));ids.delete('canvas');
  const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
  return {sha256:hash(bytes),bytes:bytes.byteLength,revisionId:snapshot.revision.id,title:snapshot.revision.summary??'',objectCount:ids.size,screenCount:[...html.matchAll(/data-canvas-v2-screen\s*=/g)].length,evidenceCount:snapshot.revision.evidence.length,productIdentityCount:snapshot.memory?.productIdentities?.length??0,turnCount:snapshot.turns.length,documentHTMLSHA256:hash(html),documentCSSSHA256:hash(snapshot.revision.document.css),roundTripValidated:true,validation:'Validated through the same archive decoder as Import saved canvas; no live board/storage mutation.'};
}
