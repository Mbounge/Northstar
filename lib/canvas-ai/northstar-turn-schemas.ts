import type { NorthstarLedgerTask, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

export type NorthstarJSONSchema = Record<string, NorthstarLedgerValue>;

const stringSchema = (description?: string): NorthstarJSONSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});

const nonEmptyStringSchema = (description?: string): NorthstarJSONSchema => ({
  ...stringSchema(description),
  minLength: 1,
});

const ledgerValueSchema: NorthstarJSONSchema = {
  description: "A deterministic JSON value. Do not include system-generated ledger identities.",
};

const failureProperties: Record<string, NorthstarLedgerValue> = {
  failureKind: { type: "string", enum: ["transient", "correctable", "terminal"] },
  code: nonEmptyStringSchema(),
  message: nonEmptyStringSchema(),
  correctionContext: ledgerValueSchema,
  retryAfterMs: { type: "integer", minimum: 0 },
};

const exactIdentitySchema: NorthstarJSONSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["app", "flow", "screenshot"] },
    appId: stringSchema(),
    appName: stringSchema(),
    flowId: stringSchema(),
    flowName: stringSchema(),
    screenshotId: stringSchema(),
    screenshotName: stringSchema(),
    screenshotIndex: { type: "integer", minimum: 0 },
    imageUrl: stringSchema(),
    platform: stringSchema(),
    sessionType: stringSchema(),
  },
};

const visualObservationSchema: NorthstarJSONSchema = {
  type: "object",
  properties: {
    screenshotId: stringSchema(),
    screenshotIds: { type: "array", items: stringSchema() },
    observation: nonEmptyStringSchema("A visible, screenshot-grounded observation."),
    implication: stringSchema(),
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["observation"],
};

export const NORTHSTAR_RESEARCH_RESULT_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    schema: { type: "string", enum: ["northstar.research-result.v1"] },
    findings: { type: "array", items: ledgerValueSchema },
    exactIdentities: { type: "array", items: exactIdentitySchema },
    evidenceGraphDelta: { type: "array", items: ledgerValueSchema },
    visualObservations: { type: "array", items: visualObservationSchema },
    remainingGaps: { type: "array", items: stringSchema() },
    sufficientForNextStep: { type: "boolean" },
    suggestedNextEvidenceActivities: { type: "array", items: ledgerValueSchema },
  },
  required: [
    "schema",
    "findings",
    "exactIdentities",
    "evidenceGraphDelta",
    "visualObservations",
    "remainingGaps",
    "sufficientForNextStep",
  ],
};

export const NORTHSTAR_DESIGN_RESULT_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    schema: { type: "string", enum: ["northstar.design-intelligence-result.v1"] },
    viewerJob: nonEmptyStringSchema(),
    editorialArgument: nonEmptyStringSchema(),
    threeSecondRead: nonEmptyStringSchema(),
    visualThesis: nonEmptyStringSchema(),
    informationTopology: nonEmptyStringSchema(),
    evidenceHierarchy: { type: "array", items: ledgerValueSchema },
    governingVisualIdea: nonEmptyStringSchema(),
    spatialLogic: nonEmptyStringSchema(),
    emotionalRegister: nonEmptyStringSchema(),
    signatureMove: nonEmptyStringSchema(),
    provisional: { type: "boolean" },
    unresolvedQuestions: { type: "array", items: stringSchema() },
    nextVisibleMove: {
      type: "object",
      properties: {
        intent: nonEmptyStringSchema(),
        expectedVisibleDelta: nonEmptyStringSchema(),
        acceptanceCriteria: { type: "array", items: nonEmptyStringSchema() },
      },
      required: ["intent", "expectedVisibleDelta", "acceptanceCriteria"],
    },
    alternateDirectionsConsidered: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concept: nonEmptyStringSchema(),
          whyRejectedForNow: nonEmptyStringSchema(),
        },
        required: ["concept", "whyRejectedForNow"],
      },
    },
  },
  required: [
    "schema",
    "viewerJob",
    "editorialArgument",
    "threeSecondRead",
    "visualThesis",
    "informationTopology",
    "evidenceHierarchy",
    "governingVisualIdea",
    "spatialLogic",
    "emotionalRegister",
    "signatureMove",
    "provisional",
    "unresolvedQuestions",
    "nextVisibleMove",
    "alternateDirectionsConsidered",
  ],
};

const styleDeclarationSchema: NorthstarJSONSchema = {
  type: "object",
  properties: {
    value: { type: "string" },
    priority: { type: "string", enum: ["", "important"] },
  },
  required: ["value", "priority"],
};

const projectionNodeSchema: NorthstarJSONSchema = {
  type: "object",
  description: "A text or element projection node. Element children recursively use this same shape.",
  properties: {
    kind: { type: "string", enum: ["text", "element"] },
    id: nonEmptyStringSchema(),
    text: stringSchema(),
    tag: stringSchema(),
    namespace: { type: "string", enum: ["html", "svg"] },
    attributes: { type: "object" },
    classes: { type: "array", items: stringSchema() },
    styles: {
      type: "object",
      additionalProperties: styleDeclarationSchema,
    },
    children: { type: "array", items: { type: "object" } },
  },
  required: ["kind", "id"],
};

const operationSchema: NorthstarJSONSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "insert-node",
        "remove-node",
        "move-node",
        "set-text",
        "set-attributes",
        "set-styles",
        "set-classes",
        "set-css-layer",
        "set-space",
      ],
    },
    parentId: stringSchema(),
    index: { type: "integer", minimum: 0 },
    node: projectionNodeSchema,
    nodeId: stringSchema(),
    text: stringSchema(),
    attributes: { type: "object" },
    styles: { type: "object", additionalProperties: styleDeclarationSchema },
    classes: { type: "array", items: stringSchema() },
    layerId: stringSchema(),
    cssText: { type: ["string", "null"] },
    space: {
      type: "object",
      properties: {
        left: { type: "number", minimum: 0 },
        top: { type: "number", minimum: 0 },
        right: { type: "number", minimum: 0 },
        bottom: { type: "number", minimum: 0 },
      },
      required: ["left", "top", "right", "bottom"],
    },
  },
  required: ["type"],
};

export const NORTHSTAR_ARTBOARD_RESULT_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    schema: { type: "string", enum: ["northstar.artboard-mutation-draft.v1"] },
    operations: { type: "array", minItems: 1, items: operationSchema },
  },
  required: ["schema", "operations"],
};

export const NORTHSTAR_VERIFICATION_RESULT_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    schema: { type: "string", enum: ["northstar.verification-result.v1"] },
    objectiveSatisfied: { type: "boolean" },
    evidenceGrounded: { type: "boolean" },
    artboardStable: { type: "boolean" },
    readingPathClear: { type: "boolean" },
    issues: { type: "array", items: stringSchema() },
    recommendation: { type: "string", enum: ["finalize", "revise"] },
  },
  required: [
    "schema",
    "objectiveSatisfied",
    "evidenceGrounded",
    "artboardStable",
    "readingPathClear",
    "issues",
    "recommendation",
  ],
};

export function northstarTaskResultJSONSchema(kind: NorthstarLedgerTask["kind"]): NorthstarJSONSchema {
  if (kind === "research") return NORTHSTAR_RESEARCH_RESULT_JSON_SCHEMA;
  if (kind === "analysis") return NORTHSTAR_DESIGN_RESULT_JSON_SCHEMA;
  if (kind === "artboard-mutation") return NORTHSTAR_ARTBOARD_RESULT_JSON_SCHEMA;
  if (kind === "verification") return NORTHSTAR_VERIFICATION_RESULT_JSON_SCHEMA;
  return { type: "object" };
}

export function northstarAttemptJSONSchema(kind: NorthstarLedgerTask["kind"]): NorthstarJSONSchema {
  return {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["success", "failure"] },
      result: northstarTaskResultJSONSchema(kind),
      ...failureProperties,
    },
    required: ["outcome"],
  };
}

export const NORTHSTAR_DECISION_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["activity", "ready-to-finalize"] },
    activity: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["research", "analysis", "artboard-mutation", "verification"] },
        intent: nonEmptyStringSchema(),
        expectedOutcome: nonEmptyStringSchema(),
        executionInput: ledgerValueSchema,
      },
      required: ["kind", "intent", "expectedOutcome", "executionInput"],
    },
    reason: stringSchema(),
  },
  required: ["decision"],
};

export const NORTHSTAR_CORRECTION_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["retry", "cancel", "supersede"] },
    executionInput: ledgerValueSchema,
    reason: stringSchema(),
  },
  required: ["action"],
};

export const NORTHSTAR_FINALIZATION_JSON_SCHEMA: NorthstarJSONSchema = {
  type: "object",
  properties: {
    summary: ledgerValueSchema,
  },
  required: ["summary"],
};

function upperType(value: NorthstarLedgerValue): NorthstarLedgerValue {
  if (typeof value === "string") return value.toUpperCase();
  if (Array.isArray(value)) return value.map(upperType) as NorthstarLedgerValue;
  return value;
}

/** Converts ordinary JSON Schema type names to the legacy generateContent schema casing. */
export function toGeminiResponseSchema(schema: NorthstarLedgerValue): NorthstarLedgerValue {
  if (Array.isArray(schema)) return schema.map(toGeminiResponseSchema) as NorthstarLedgerValue;
  if (!schema || typeof schema !== "object") return schema;
  const output: Record<string, NorthstarLedgerValue> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type") output[key] = upperType(value as NorthstarLedgerValue);
    else output[key] = toGeminiResponseSchema(value as NorthstarLedgerValue);
  }
  return output;
}
