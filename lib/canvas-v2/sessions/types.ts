import type { CanvasV2ArtifactRevision, CanvasV2EvidenceAsset, CanvasV2EvidencePacket } from '../types';
import type { CanvasV2ChatTurn } from '@/components/canvas-v2/use-canvas-v2-chat';
import type { CanvasV2ModelSelection, NorthstarEffort } from '../model-catalog';
import type { CanvasV2WorkspaceViewport } from '../workspace-coordinate-space';
import type { CodexCompositionPlan, CodexSourceMediaCandidate } from '../codex-composition';
import type { AppDataApp, AppDataFlow } from '@/lib/app-data/canvas-v2-catalog';
export interface NorthstarSnapshot {
  schema: 1; revision: CanvasV2ArtifactRevision; turns: CanvasV2ChatTurn[]; draft: string;
  attachments?: import("../chat-attachments").CanvasV2ChatAttachment[];
  model: CanvasV2ModelSelection; effort: NorthstarEffort; viewport: CanvasV2WorkspaceViewport;
  memory?: { assets: CanvasV2EvidenceAsset[]; accountPackets: CanvasV2EvidencePacket[];
    accountFlows: [string, {app: AppDataApp; flow: AppDataFlow}][]; sourceMedia: CodexSourceMediaCandidate[];
    sourcePages: string[]; compositionHistory: CodexCompositionPlan[]; compositionSequence: number; };
}
export interface NorthstarSession {
  id: string; owner_id: string; title: string; updated_at: string; snapshot_path: string | null; version: number;
  archived: boolean; model: string; effort: string;
}

export type SessionCommand =
  | {kind:'submit'; message:string; attachments:import('../chat-attachments').CanvasV2ChatAttachment[]; model:CanvasV2ModelSelection; effort:NorthstarEffort}
  | {kind:'stop'}
  | {kind:'title'; title:string}
  | {kind:'settings'; model:CanvasV2ModelSelection; effort:NorthstarEffort}
  | {kind:'canvas'; baseRevision:string; revision:CanvasV2ArtifactRevision};

export interface LiveSessionState { snapshot:NorthstarSnapshot; busy:boolean; title:string }
