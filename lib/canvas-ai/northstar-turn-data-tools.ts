import {
  executeNorthStarDataTool,
  type NorthStarDataCatalog,
  type NorthStarDataToolResult,
} from "@/lib/canvas-ai/northstar-data-tools";
import {
  NORTHSTAR_DATA_TOOL_NAMES,
  NORTHSTAR_TOOL_REGISTRY,
  type NorthStarDataToolName,
  type NorthStarToolArguments,
} from "@/lib/canvas-ai/northstar-tool-registry";
import {
  NorthstarToolInputValidationError,
  parseNorthstarDataToolArguments,
} from "@/lib/canvas-ai/northstar-tool-input-validation";
import {
  assertValidNorthstarLedgerValue,
  cloneNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import {
  NorthstarTurnToolError,
  type NorthstarTurnToolExecutor,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  collectNorthstarKnownEvidenceIdentities,
  groundNorthstarExactLookupArguments,
  mergeNorthstarKnownEvidenceIdentities,
} from "@/lib/canvas-ai/northstar-evidence-identities";

const MAX_TOOL_CALLS_PER_ATTEMPT = 8;

type DataToolCall = {
  name: NorthStarDataToolName;
  args: NorthStarToolArguments;
  argsLedgerValue: NorthstarLedgerValue;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDataToolName(value: unknown): value is NorthStarDataToolName {
  return typeof value === "string" && (NORTHSTAR_DATA_TOOL_NAMES as readonly string[]).includes(value);
}

function correctableToolError(
  code: string,
  message: string,
  correctionContext?: NorthstarLedgerValue,
  evidence?: NorthstarLedgerValue,
): never {
  throw new NorthstarTurnToolError({
    failureKind: "correctable",
    code,
    message,
    correctionContext,
    evidence,
  });
}

function terminalToolError(
  code: string,
  message: string,
  correctionContext?: NorthstarLedgerValue,
  evidence?: NorthstarLedgerValue,
): never {
  throw new NorthstarTurnToolError({
    failureKind: "terminal",
    code,
    message,
    correctionContext,
    evidence,
  });
}

function normalizeToolValue(value: unknown, path = "$", mode: "input" | "result"): NorthstarLedgerValue {
  const invalid = (message: string): never => {
    if (mode === "input") {
      return correctableToolError("TOOL_ARGUMENTS_INVALID", message, { path });
    }
    return terminalToolError("TOOL_RESULT_INVALID", message, { path });
  };

  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalid(`${path} must be a finite number.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (entry === undefined) return invalid(`${path}[${index}] cannot be undefined.`);
      return normalizeToolValue(entry, `${path}[${index}]`, mode);
    });
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid(`${path} must be a plain object.`);
    }
    const normalized: Record<string, NorthstarLedgerValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      // Existing read tools represent absent optional result fields with undefined.
      // Input values may not use undefined because the model must correct them.
      if (entry === undefined) {
        if (mode === "result") continue;
        return invalid(`${path}.${key} cannot be undefined.`);
      }
      normalized[key] = normalizeToolValue(entry, `${path}.${key}`, mode);
    }
    return normalized;
  }
  return invalid(`${path} contains unsupported ${typeof value}.`);
}

function toInputLedgerValue(value: unknown, path: string): NorthstarLedgerValue {
  const normalized = normalizeToolValue(value, path, "input");
  try {
    assertValidNorthstarLedgerValue(normalized, path);
    return cloneNorthstarLedgerValue(normalized);
  } catch (error) {
    return correctableToolError(
      "TOOL_ARGUMENTS_INVALID",
      error instanceof Error ? error.message : `${path} is not a valid tool input.`,
      { path },
    );
  }
}

function toResultLedgerValue(value: unknown, path: string): NorthstarLedgerValue {
  const normalized = normalizeToolValue(value, path, "result");
  try {
    assertValidNorthstarLedgerValue(normalized, path);
    return cloneNorthstarLedgerValue(normalized);
  } catch (error) {
    return terminalToolError(
      "TOOL_RESULT_INVALID",
      error instanceof Error ? error.message : `${path} is not a valid tool result.`,
      { path },
    );
  }
}

function parseToolCalls(value: NorthstarLedgerValue): DataToolCall[] {
  if (!isRecord(value) || value.toolCalls === undefined) return [];
  if (!Array.isArray(value.toolCalls)) {
    return correctableToolError(
      "TOOL_CALLS_INVALID",
      "toolCalls must be an array when provided.",
      { path: "$.toolCalls" },
    );
  }
  if (value.toolCalls.length > MAX_TOOL_CALLS_PER_ATTEMPT) {
    return correctableToolError(
      "TOOL_CALL_LIMIT_EXCEEDED",
      `A task attempt may request at most ${MAX_TOOL_CALLS_PER_ATTEMPT} Northstar data tool calls.`,
      { maximum: MAX_TOOL_CALLS_PER_ATTEMPT, received: value.toolCalls.length },
    );
  }
  return value.toolCalls.map((rawCall, index) => {
    const path = `$.toolCalls[${index}]`;
    if (!isRecord(rawCall)) {
      return correctableToolError("TOOL_CALL_INVALID", `${path} must be an object.`, { path });
    }
    if (!isDataToolName(rawCall.name)) {
      return correctableToolError(
        "TOOL_NOT_ALLOWED",
        `${path}.name must be one of the read-only Northstar data tools.`,
        { path: `${path}.name`, requestedName: typeof rawCall.name === "string" ? rawCall.name : null },
      );
    }
    const args = rawCall.args ?? {};
    if (!isRecord(args)) {
      return correctableToolError(
        "TOOL_ARGUMENTS_INVALID",
        `${path}.args must be an object.`,
        { path: `${path}.args` },
      );
    }
    let parsedArgs: NorthStarToolArguments;
    try {
      parsedArgs = parseNorthstarDataToolArguments(rawCall.name, args, `${path}.args`);
    } catch (error) {
      if (error instanceof NorthstarToolInputValidationError) {
        return correctableToolError(
          "TOOL_ARGUMENTS_INVALID",
          `${rawCall.name} received invalid arguments. ${error.message}`,
          {
            toolName: rawCall.name,
            toolCallIndex: index,
            issues: error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              expected: issue.expected ?? null,
              received: issue.received ?? null,
            })),
            inputSchema: NORTHSTAR_TOOL_REGISTRY[rawCall.name].inputSchema as NorthstarLedgerValue,
          },
        );
      }
      throw error;
    }
    const argsLedgerValue = toInputLedgerValue(parsedArgs, `${path}.args`);
    return {
      name: rawCall.name,
      args: parsedArgs,
      argsLedgerValue,
    };
  });
}

const EXACT_LOOKUP_TOOLS = new Set<NorthStarDataToolName>([
  "get_app_details",
  "list_app_flows",
  "get_flow_details",
  "get_flow_screenshots",
  "get_screenshot",
  "get_app_icon",
]);

function recoveryToolsFor(tool: NorthStarDataToolName): NorthStarDataToolName[] {
  if (tool === "get_flow_details" || tool === "get_flow_screenshots") {
    return ["list_app_flows", "search_app_flows", "prepare_composition_evidence"];
  }
  if (tool === "get_screenshot") {
    return ["get_flow_screenshots", "search_screenshots", "prepare_composition_evidence"];
  }
  if (tool === "get_app_details" || tool === "get_app_icon" || tool === "list_app_flows") {
    return ["list_available_apps", "prepare_composition_evidence"];
  }
  return ["list_available_apps"];
}

export interface CreateNorthstarDataTurnToolExecutorInput {
  getCatalog(): Promise<NorthStarDataCatalog>;
  executeTool?: typeof executeNorthStarDataTool;
}

export function createNorthstarDataTurnToolExecutor(
  input: CreateNorthstarDataTurnToolExecutorInput,
): NorthstarTurnToolExecutor {
  const executeTool = input.executeTool ?? executeNorthStarDataTool;
  return {
    async execute({ request, signal }) {
      const calls = parseToolCalls(request.attempt.executionInput);
      if (calls.length === 0) return undefined;
      const knownIdentities = collectNorthstarKnownEvidenceIdentities(request.ledgerContext);
      const results: Array<{
        name: NorthStarDataToolName;
        args: NorthstarLedgerValue;
        result: NorthstarLedgerValue;
      }> = [];
      for (const [index, call] of calls.entries()) {
        if (signal.aborted) {
          throw new DOMException("The task-scoped tool execution was aborted.", "AbortError");
        }
        const groundedArgs = groundNorthstarExactLookupArguments(call.name, call.args, knownIdentities);
        const groundedArgsLedgerValue = toInputLedgerValue(groundedArgs, `$.toolCalls[${index}].args`);
        let result: NorthStarDataToolResult;
        try {
          result = await executeTool({
            tool: call.name,
            args: groundedArgs,
            getCatalog: input.getCatalog,
          });
        } catch (error) {
          if (isAbortError(error) || signal.aborted) throw error;
          if (error instanceof NorthstarTurnToolError) throw error;
          throw new NorthstarTurnToolError({
            failureKind: "transient",
            code: "TOOL_EXECUTION_FAILED",
            message: error instanceof Error
              ? error.message
              : `Read-only tool ${call.name} failed without a structured error.`,
            correctionContext: { toolName: call.name, toolCallIndex: index },
          });
        }
        const resultLedgerValue = toResultLedgerValue(result, `$.toolResults[${index}]`);
        results.push({
          name: call.name,
          args: groundedArgsLedgerValue,
          result: resultLedgerValue,
        });
        mergeNorthstarKnownEvidenceIdentities(
          knownIdentities,
          collectNorthstarKnownEvidenceIdentities(resultLedgerValue),
        );
        if (!result.ok && EXACT_LOOKUP_TOOLS.has(call.name)) {
          return correctableToolError(
            "TOOL_LOOKUP_EMPTY",
            result.detail || `${call.name} could not resolve the requested tenant data.`,
            {
              toolName: call.name,
              toolCallIndex: index,
              arguments: groundedArgsLedgerValue,
              recommendedNextTools: recoveryToolsFor(call.name),
              instruction: "Use a list/search/curation tool to ground an exact identity, then retry with the exact returned value. Do not repeat this lookup unchanged.",
            },
            { toolCalls: results },
          );
        }
      }
      return { toolCalls: results };
    },
  };
}
