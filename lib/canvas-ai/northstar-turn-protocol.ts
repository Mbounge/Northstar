import type {
  NorthstarActivityDraft,
  NorthstarLedgerFailureKind,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";

export const NORTHSTAR_TURN_PROTOCOL_VERSION = "northstar.turn.v1" as const;
export const NORTHSTAR_TURN_ENDPOINT = "/api/canvas-ai/turn";
export const NORTHSTAR_TURN_MAX_PAYLOAD_CHARACTERS = 2_500_000;
export const NORTHSTAR_TURN_DEFAULT_TIMEOUT_MS = 75_000;

export type NorthstarTurnRequestType =
  | "decide-next-activity"
  | "execute-task-attempt"
  | "correct-active-task"
  | "finalize-run";

export interface NorthstarTurnRequestBase {
  protocolVersion: typeof NORTHSTAR_TURN_PROTOCOL_VERSION;
  requestId: string;
  type: NorthstarTurnRequestType;
  ledgerContext: NorthstarLedgerLLMContext;
}

export interface NorthstarDecideNextActivityRequest extends NorthstarTurnRequestBase {
  type: "decide-next-activity";
}

export interface NorthstarExecuteTaskAttemptRequest extends NorthstarTurnRequestBase {
  type: "execute-task-attempt";
  task: NorthstarLedgerTask;
  attempt: NorthstarLedgerTaskAttempt;
}

export interface NorthstarCorrectActiveTaskRequest extends NorthstarTurnRequestBase {
  type: "correct-active-task";
  task: NorthstarLedgerTask;
  latestAttempt: NorthstarLedgerTaskAttempt;
}

export interface NorthstarFinalizeRunRequest extends NorthstarTurnRequestBase {
  type: "finalize-run";
}

export type NorthstarTurnRequest =
  | NorthstarDecideNextActivityRequest
  | NorthstarExecuteTaskAttemptRequest
  | NorthstarCorrectActiveTaskRequest
  | NorthstarFinalizeRunRequest;

export type NorthstarAttemptResultKind =
  | "research-result"
  | "analysis-result"
  | "artboard-mutation-draft"
  | "verification-result"
  | "finalization-result";

export interface NorthstarTurnResponseBase {
  protocolVersion: typeof NORTHSTAR_TURN_PROTOCOL_VERSION;
  requestId: string;
}

export interface NorthstarActivityDraftResponse extends NorthstarTurnResponseBase {
  type: "activity-draft";
  activity: NorthstarActivityDraft;
}

export interface NorthstarRunReadyToFinalizeResponse extends NorthstarTurnResponseBase {
  type: "run-ready-to-finalize";
  reason: string;
}

export interface NorthstarAttemptResultResponse extends NorthstarTurnResponseBase {
  type: "attempt-result";
  taskId: string;
  attemptId: string;
  resultKind: NorthstarAttemptResultKind;
  result: NorthstarLedgerValue;
}

export interface NorthstarAttemptFailureResponse extends NorthstarTurnResponseBase {
  type: "attempt-failure";
  taskId: string;
  attemptId: string;
  failureKind: NorthstarLedgerFailureKind;
  code: string;
  message: string;
  correctionContext?: NorthstarLedgerValue;
  retryAfterMs?: number;
}

export type NorthstarTaskCorrectionAction =
  | {
      action: "retry";
      executionInput: NorthstarLedgerValue;
    }
  | {
      action: "cancel" | "supersede";
      reason: string;
    };

export interface NorthstarTaskCorrectionResponse extends NorthstarTurnResponseBase {
  type: "task-correction";
  taskId: string;
  action: NorthstarTaskCorrectionAction;
}

export interface NorthstarRunFinalizedResponse extends NorthstarTurnResponseBase {
  type: "run-finalized";
  summary: NorthstarLedgerValue;
}

export interface NorthstarTurnErrorResponse extends NorthstarTurnResponseBase {
  type: "turn-error";
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export type NorthstarTurnResponse =
  | NorthstarActivityDraftResponse
  | NorthstarRunReadyToFinalizeResponse
  | NorthstarAttemptResultResponse
  | NorthstarAttemptFailureResponse
  | NorthstarTaskCorrectionResponse
  | NorthstarRunFinalizedResponse
  | NorthstarTurnErrorResponse;

export interface NorthstarTurnModelRequest {
  operation: NorthstarTurnRequestType;
  systemInstruction: string;
  userPrompt: string;
  responseSchema: NorthstarLedgerValue;
  maxOutputTokens: number;
  temperature: number;
}

export interface NorthstarTurnModelAdapter {
  generateJSON(input: NorthstarTurnModelRequest & { signal: AbortSignal }): Promise<unknown>;
}


export class NorthstarTurnToolError extends Error {
  readonly failureKind: NorthstarLedgerFailureKind;
  readonly code: string;
  readonly correctionContext?: NorthstarLedgerValue;

  constructor(input: {
    failureKind: NorthstarLedgerFailureKind;
    code: string;
    message: string;
    correctionContext?: NorthstarLedgerValue;
  }) {
    super(input.message);
    this.name = "NorthstarTurnToolError";
    this.failureKind = input.failureKind;
    this.code = input.code;
    this.correctionContext = input.correctionContext;
  }
}

export interface NorthstarTurnToolExecutor {
  execute(input: {
    request: NorthstarExecuteTaskAttemptRequest;
    signal: AbortSignal;
  }): Promise<NorthstarLedgerValue | undefined>;
}
