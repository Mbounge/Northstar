import { CANVAS_V2_ARTIFACT_SCHEMA } from '../types';
import { encodeSnapshot, decodeSnapshotBlob } from './snapshot';
import type { NorthstarSnapshot } from './types';
import type { PrivateCanvasWorkspace } from './collaboration-local';

export type PrivateCanvasHistory = Omit<PrivateCanvasWorkspace, 'viewport'>;
const memories = new WeakMap<NonNullable<NorthstarSnapshot['memory']>, NonNullable<NorthstarSnapshot['memory']>>();
const CARRIER_ID = 'northstar-private-history-v1';
const CARRIER_HTML = '<template data-canvas-v2-node-id="private-history" data-canvas-v2-workspace-root="true"></template>';

/** Explicitly choose personal fields. Shared source, evidence, camera and future
 * snapshot metadata must never accidentally enter a private history upload. */
export function privateCanvasHistory(value: PrivateCanvasWorkspace | NorthstarSnapshot | PrivateCanvasHistory): PrivateCanvasHistory {
  const memory=value.memory;
  let personal=memory?memories.get(memory):undefined;
  if(memory&&!personal){personal={conversationEditTargets:memory.conversationEditTargets,assets:[],accountPackets:memory.accountPackets,accountFlows:memory.accountFlows,sourceMedia:memory.sourceMedia,sourcePages:memory.sourcePages,compositionHistory:memory.compositionHistory,compositionSequence:memory.compositionSequence,screenVersions:memory.screenVersions,productIdentities:memory.productIdentities,artifacts:memory.artifacts,accountFlowSummaries:memory.accountFlowSummaries,referenceRailFlowIds:memory.referenceRailFlowIds,accountHandles:memory.accountHandles};memories.set(memory,personal);}
  return {turns:value.turns,draft:value.draft,attachments:value.attachments,model:value.model,effort:value.effort,
    ...(personal?{memory:personal}:{})};
}

export async function encodePrivateCanvasHistory(history: PrivateCanvasHistory): Promise<Blob> {
  // Use the existing off-thread, compressed snapshot codec and retained blob
  // materialization. The carrier contains no shared artwork or source bytes.
  return encodeSnapshot({...privateCanvasHistory(history),schema:1,
    revision:{schema:CANVAS_V2_ARTIFACT_SCHEMA,id:CARRIER_ID,state:'committed',createdAt:'2026-10-20T00:00:00.000Z',document:{html:CARRIER_HTML,css:''},evidence:[]},
    viewport:{x:0,y:0,scale:1}});
}

export async function decodePrivateCanvasHistory(blob: Blob): Promise<PrivateCanvasHistory> {
  const value=await decodeSnapshotBlob(blob);
  if(value.revision.id!==CARRIER_ID||value.revision.document.html!==CARRIER_HTML||value.revision.document.css!==''||value.revision.evidence.length)
    throw new Error('This is not a private canvas conversation. It has not replaced your history.');
  return privateCanvasHistory(value);
}
