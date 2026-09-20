import type { CanvasV2EvidenceAsset } from "../types";

export const CREATIVE_TOOLS = [
  "workspace_run",
  "workspace_export",
  "generate_image",
] as const;
export type CreativeTool = (typeof CREATIVE_TOOLS)[number];
export function isCreativeTool(name: unknown): name is CreativeTool {
  return CREATIVE_TOOLS.includes(name as CreativeTool);
}

/** Durable bytes and provenance; provider container URLs are never persisted as assets. */
export interface NorthstarArtifact {
  id: string;
  name: string;
  label: string;
  mimeType: string;
  dataUrl: string;
  bytes: number;
  workspacePath?: string;
  origin: "generated" | "computed";
  createdAt: string;
  inputAssetIds: string[];
}
export interface CreativeInput {
  reference: string;
  id: string;
  label: string;
  dataUrl: string;
}
export interface CreativeContext {
  inputs: CreativeInput[];
  canvas?: {
    revisionId: string;
    document: { html: string; css: string };
    nodes: unknown[];
    measurementRevisionId?: string;
    connectors?: unknown;
    viewport?: unknown;
  };
}
export interface CreativeResult {
  summary: string;
  artifacts: NorthstarArtifact[];
  assets: CanvasV2EvidenceAsset[];
  execution?: {
    commands: string[];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    workspace: string;
    canvasRevision?: string;
  };
  warnings?: string[];
}
export type CreativeJob =
  | { status: "running" }
  | { status: "completed"; result: CreativeResult }
  | { status: "failed"; error: string };

export function artifactMetadata({
  dataUrl: _bytes,
  ...metadata
}: NorthstarArtifact) {
  void _bytes;
  return metadata;
}
