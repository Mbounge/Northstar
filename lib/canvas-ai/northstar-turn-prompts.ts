import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { NORTHSTAR_DATA_TOOL_NAMES } from "@/lib/canvas-ai/northstar-tool-registry";
import type {
  NorthstarCorrectActiveTaskRequest,
  NorthstarDecideNextActivityRequest,
  NorthstarExecuteTaskAttemptRequest,
  NorthstarFinalizeRunRequest,
} from "@/lib/canvas-ai/northstar-turn-protocol";

const SHARED_RULES = `You are operating inside Northstar's ledger-controlled authoring system.
The supplied ledger context is the only authoritative history and current state.
Perform exactly one requested responsibility. Do not start later work.
Never invent run IDs, task IDs, attempt IDs, commit hashes, sequence numbers, or projection receipts.
Never claim an uncommitted or unprojected artboard change already happened.
Return exactly one JSON object and no markdown or commentary.`;

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const NORTHSTAR_DECISION_MODEL_SCHEMA: NorthstarLedgerValue = {
  oneOf: [
    {
      decision: "activity",
      activity: {
        kind: "research | analysis | artboard-mutation | verification",
        intent: "string",
        expectedOutcome: "string",
        executionInput: "deterministic JSON value",
      },
    },
    {
      decision: "ready-to-finalize",
      reason: "string",
    },
  ],
};

export const NORTHSTAR_ATTEMPT_MODEL_SCHEMA: NorthstarLedgerValue = {
  oneOf: [
    {
      outcome: "success",
      result: "deterministic JSON value",
    },
    {
      outcome: "failure",
      failureKind: "transient | correctable | terminal",
      code: "string",
      message: "string",
      correctionContext: "optional deterministic JSON value",
      retryAfterMs: "optional non-negative integer",
    },
  ],
};

export const NORTHSTAR_CORRECTION_MODEL_SCHEMA: NorthstarLedgerValue = {
  oneOf: [
    {
      action: "retry",
      executionInput: "corrected deterministic JSON value",
    },
    {
      action: "cancel | supersede",
      reason: "string",
    },
  ],
};

export const NORTHSTAR_FINALIZATION_MODEL_SCHEMA: NorthstarLedgerValue = {
  summary: "deterministic JSON value containing the final user-facing answer and any concise completion metadata",
};

export function buildNorthstarDecisionPrompt(request: NorthstarDecideNextActivityRequest): {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: NorthstarLedgerValue;
} {
  return {
    systemInstruction: `${SHARED_RULES}
Choose only the next bounded activity required by the confirmed ledger state.
If the run is genuinely ready to finish, return ready-to-finalize instead of inventing a finalization task.
The activity object may contain only kind, intent, expectedOutcome, and executionInput.
When committed Northstar app, flow, icon, or screenshot data is needed, executionInput may include toolCalls using only these read-only tools: ${NORTHSTAR_DATA_TOOL_NAMES.join(", ")}.`,
    userPrompt: json({
      responsibility: "decide-next-activity",
      ledgerContext: request.ledgerContext,
    }),
    responseSchema: NORTHSTAR_DECISION_MODEL_SCHEMA,
  };
}

export function buildNorthstarExecutionPrompt(
  request: NorthstarExecuteTaskAttemptRequest,
  toolContext?: NorthstarLedgerValue,
): {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: NorthstarLedgerValue;
} {
  return {
    systemInstruction: `${SHARED_RULES}
Execute only the supplied task and attempt.
Stay on the task's stated intent and expected outcome.
If the task is an artboard mutation, return a bounded mutation draft only; do not claim it was applied or committed.
An artboard mutation result must use schema northstar.artboard-mutation-draft.v1 and an operations array containing only insert-node, remove-node, move-node, set-text, set-attributes, set-styles, set-classes, set-css-layer, or set-space. Use stable artboard node IDs. Never return HTML strings, whole-document replacements, repository identity, or projection receipts.
Classify failure as transient only when the same input can safely be attempted again, correctable when the input must change, and terminal when the task cannot be completed.`,
    userPrompt: json({
      responsibility: "execute-task-attempt",
      ledgerContext: request.ledgerContext,
      task: request.task,
      attempt: request.attempt,
      toolContext,
    }),
    responseSchema: NORTHSTAR_ATTEMPT_MODEL_SCHEMA,
  };
}

export function buildNorthstarCorrectionPrompt(request: NorthstarCorrectActiveTaskRequest): {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: NorthstarLedgerValue;
} {
  return {
    systemInstruction: `${SHARED_RULES}
Correct the same unresolved task. Do not propose a different next task.
Return retry with corrected executionInput, cancel when the requested outcome should be abandoned, or supersede only when the original obligation has been explicitly replaced.
Do not repeat unchanged input that is already known to be invalid.`,
    userPrompt: json({
      responsibility: "correct-active-task",
      ledgerContext: request.ledgerContext,
      task: request.task,
      latestAttempt: request.latestAttempt,
      latestFailure: request.latestAttempt.failure,
    }),
    responseSchema: NORTHSTAR_CORRECTION_MODEL_SCHEMA,
  };
}

export function buildNorthstarFinalizationPrompt(request: NorthstarFinalizeRunRequest): {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: NorthstarLedgerValue;
} {
  return {
    systemInstruction: `${SHARED_RULES}
Produce the final response using only completed ledger history and the confirmed current HEAD.
Do not introduce new research, analysis, or artboard work.
Do not claim unresolved or unprojected work exists.`,
    userPrompt: json({
      responsibility: "finalize-run",
      ledgerContext: request.ledgerContext,
    }),
    responseSchema: NORTHSTAR_FINALIZATION_MODEL_SCHEMA,
  };
}
