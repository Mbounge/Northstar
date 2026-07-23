import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { getNorthstarDataToolPromptSummary } from "@/lib/canvas-ai/northstar-tool-registry";
import {
  buildNorthstarAdaptiveDecisionProtocol,
  buildNorthstarArtboardExecutionProtocol,
  buildNorthstarDesignIntelligenceExecutionProtocol,
  buildNorthstarResearchExecutionProtocol,
  buildNorthstarVerificationExecutionProtocol,
} from "@/lib/canvas-ai/northstar-turn-intelligence";
import {
  NORTHSTAR_CORRECTION_JSON_SCHEMA,
  NORTHSTAR_DECISION_JSON_SCHEMA,
  NORTHSTAR_FINALIZATION_JSON_SCHEMA,
  northstarAttemptJSONSchema,
} from "@/lib/canvas-ai/northstar-turn-schemas";
import type {
  NorthstarCorrectActiveTaskRequest,
  NorthstarDecideNextActivityRequest,
  NorthstarExecuteTaskAttemptRequest,
  NorthstarFinalizeRunRequest,
  NorthstarTurnEvidenceAsset,
} from "@/lib/canvas-ai/northstar-turn-protocol";

const DATA_TOOL_CONTRACT = getNorthstarDataToolPromptSummary();

const SHARED_RULES = `You are operating inside Northstar's ledger-controlled authoring system.
The supplied ledger context is the only authoritative history and current state.
Perform exactly one requested responsibility. Do not start later work.
Never invent run IDs, task IDs, attempt IDs, commit hashes, sequence numbers, or projection receipts.
Never claim an uncommitted or unprojected artboard change already happened.
Return exactly one JSON object and no markdown or commentary.`;

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const NORTHSTAR_DECISION_MODEL_SCHEMA: NorthstarLedgerValue = NORTHSTAR_DECISION_JSON_SCHEMA;

export const NORTHSTAR_CORRECTION_MODEL_SCHEMA: NorthstarLedgerValue = NORTHSTAR_CORRECTION_JSON_SCHEMA;

export const NORTHSTAR_FINALIZATION_MODEL_SCHEMA: NorthstarLedgerValue = NORTHSTAR_FINALIZATION_JSON_SCHEMA;

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
The user's objective controls whether the answer is artboard-based or non-artboard, which subjects are relevant, how broad the research must be, and how many research rounds are justified.
Do not force a visual artifact for a non-artboard question. Do not finalize an artboard objective before the requested verified artifact exists.
A research activity should close one bounded evidence gap. Its executionInput should include a concise researchGoal and valid toolCalls when tenant data is needed.
${DATA_TOOL_CONTRACT}
${buildNorthstarAdaptiveDecisionProtocol(request.ledgerContext)}`,
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
  evidenceAssets: readonly NorthstarTurnEvidenceAsset[] = [],
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
Classify failure as transient only when the same input can safely be attempted again, correctable when the input must change, and terminal when the task cannot be completed.
Treat toolContext as authoritative tenant evidence. Preserve exact app, flow, and screenshot identities in the result so later bounded activities can use them.
For research or analysis, explicitly state: findings, exact selected identities, screenshot-grounded visual observations when image evidence is attached, remaining evidence gaps, and whether the evidence is sufficient for the next requested step.
Never claim to have visually understood a screenshot unless it was supplied as an attached evidence image. URLs and filenames alone are not visual understanding.
If a tool result is partial, report the gap truthfully and let the next ledger decision choose another bounded research round. Never convert an empty lookup into a fabricated success.
${request.task.kind === "research" ? buildNorthstarResearchExecutionProtocol() : ""}
${request.task.kind === "analysis" ? buildNorthstarDesignIntelligenceExecutionProtocol(request.ledgerContext) : ""}
${request.task.kind === "artboard-mutation" ? buildNorthstarArtboardExecutionProtocol(request.ledgerContext) : ""}
${request.task.kind === "verification" ? buildNorthstarVerificationExecutionProtocol() : ""}
${DATA_TOOL_CONTRACT}`,
    userPrompt: json({
      responsibility: "execute-task-attempt",
      ledgerContext: request.ledgerContext,
      task: request.task,
      attempt: request.attempt,
      toolContext,
      attachedEvidenceAssets: evidenceAssets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        appName: asset.appName,
        flowName: asset.flowName,
        screenshotIndex: asset.screenshotIndex,
      })),
    }),
    responseSchema: northstarAttemptJSONSchema(request.task.kind),
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
Do not repeat unchanged input only when the failure proves that input itself is invalid or empty.
For TOOL_ARGUMENTS_INVALID, rebuild every tool call from the exact registry schema.
For TOOL_LOOKUP_EMPTY, follow recommendedNextTools and change from exact lookup to discovery/curation before retrying.
For EVIDENCE_ASSETS_UNAVAILABLE, choose another accessible screenshot batch.
For MODEL_OUTPUT_INVALID, preserve the same successful tool/evidence input when it is still valid and correct the result contract instead of rediscovering tenant data.
Preserve the user's requested scope and quantity; correction may change strategy but may not silently narrow the objective.
${DATA_TOOL_CONTRACT}`,
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
