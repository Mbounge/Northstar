import type { NorthstarLedgerFailure, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

export const NORTHSTAR_PROJECTION_STATE_SCHEMA = "northstar.projection-state.v1" as const;
export const NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA = "northstar.artboard-mutation-draft.v1" as const;
export const NORTHSTAR_PREPARED_PROJECTION_SCHEMA = "northstar.prepared-projection.v1" as const;
export const NORTHSTAR_PROJECTION_PROTOCOL_VERSION = 1 as const;

export type NorthstarProjectionNamespace = "html" | "svg";
export type NorthstarProjectionStylePriority = "" | "important";

export interface NorthstarProjectionStyleDeclaration {
  value: string;
  priority: NorthstarProjectionStylePriority;
}

export interface NorthstarProjectionTextNode {
  kind: "text";
  id: string;
  text: string;
}

export interface NorthstarProjectionElementNode {
  kind: "element";
  id: string;
  tag: string;
  namespace: NorthstarProjectionNamespace;
  attributes: Readonly<Record<string, string>>;
  classes: readonly string[];
  styles: Readonly<Record<string, NorthstarProjectionStyleDeclaration>>;
  children: readonly NorthstarProjectionNode[];
}

export type NorthstarProjectionNode =
  | NorthstarProjectionTextNode
  | NorthstarProjectionElementNode;

export interface NorthstarProjectionSpace {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface NorthstarProjectionState {
  schema: typeof NORTHSTAR_PROJECTION_STATE_SCHEMA;
  root: NorthstarProjectionElementNode;
  cssLayers: Readonly<Record<string, string>>;
  space: NorthstarProjectionSpace;
}

export type NorthstarProjectionOperation =
  | {
      type: "insert-node";
      parentId: string;
      index: number;
      node: NorthstarProjectionNode;
    }
  | {
      type: "remove-node";
      nodeId: string;
    }
  | {
      type: "move-node";
      nodeId: string;
      parentId: string;
      index: number;
    }
  | {
      type: "set-text";
      nodeId: string;
      text: string;
    }
  | {
      type: "set-attributes";
      nodeId: string;
      attributes: Readonly<Record<string, string>>;
    }
  | {
      type: "set-styles";
      nodeId: string;
      styles: Readonly<Record<string, NorthstarProjectionStyleDeclaration>>;
    }
  | {
      type: "set-classes";
      nodeId: string;
      classes: readonly string[];
    }
  | {
      type: "set-css-layer";
      layerId: string;
      cssText: string | null;
    }
  | {
      type: "set-space";
      space: NorthstarProjectionSpace;
    };

export interface NorthstarArtboardMutationDraft {
  schema: typeof NORTHSTAR_ARTBOARD_MUTATION_DRAFT_SCHEMA;
  operations: readonly NorthstarProjectionOperation[];
}

export interface NorthstarPreparedProjection {
  schema: typeof NORTHSTAR_PREPARED_PROJECTION_SCHEMA;
  baseStateHash: string;
  targetStateHash: string;
  operations: readonly NorthstarProjectionOperation[];
}

export type NorthstarProjectionPreparationOutcome =
  | {
      type: "prepared";
      preparedResult: NorthstarLedgerValue;
      stateSnapshot: NorthstarLedgerValue;
    }
  | {
      type: "failure";
      failure: NorthstarLedgerFailure;
    };

export interface NorthstarProjectionSurfaceCapture {
  surfaceSessionId: string;
  state: NorthstarProjectionState;
}

export interface NorthstarProjectionSurfacePrepareInput {
  baseState: NorthstarProjectionState;
  operations: readonly NorthstarProjectionOperation[];
  signal?: AbortSignal;
}

export interface NorthstarProjectionSurfaceApplyInput {
  surfaceSessionId: string;
  operation: NorthstarProjectionOperation;
  operationIndex: number;
  signal?: AbortSignal;
}

/**
 * The projection surface is intentionally orchestration-blind. It knows only
 * how to capture its canonical state and apply one primitive operation.
 */
export interface NorthstarProjectionSurface {
  prepare(input: NorthstarProjectionSurfacePrepareInput): Promise<NorthstarProjectionSurfaceCapture>;
  capture(signal?: AbortSignal): Promise<NorthstarProjectionSurfaceCapture>;
  apply(input: NorthstarProjectionSurfaceApplyInput): Promise<void>;
}

export interface NorthstarProjectionBridgeRequestBase {
  protocolVersion: typeof NORTHSTAR_PROJECTION_PROTOCOL_VERSION;
  requestId: string;
  surfaceSessionId?: string;
}

export type NorthstarProjectionBridgeRequest =
  | (NorthstarProjectionBridgeRequestBase & {
      type: "northstar.projection.capture";
    })
  | (NorthstarProjectionBridgeRequestBase & {
      type: "northstar.projection.prepare";
      baseState: NorthstarProjectionState;
      operations: readonly NorthstarProjectionOperation[];
    })
  | (NorthstarProjectionBridgeRequestBase & {
      type: "northstar.projection.apply";
      surfaceSessionId: string;
      operationIndex: number;
      operation: NorthstarProjectionOperation;
    });

export type NorthstarProjectionBridgeResponse =
  | {
      protocolVersion: typeof NORTHSTAR_PROJECTION_PROTOCOL_VERSION;
      type: "northstar.projection.response";
      requestId: string;
      surfaceSessionId: string;
      ok: true;
      state?: NorthstarProjectionState;
    }
  | {
      protocolVersion: typeof NORTHSTAR_PROJECTION_PROTOCOL_VERSION;
      type: "northstar.projection.response";
      requestId: string;
      surfaceSessionId: string;
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
      outcomeUnknown: boolean;
    };
