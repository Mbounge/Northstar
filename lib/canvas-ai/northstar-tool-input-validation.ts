import {
  NORTHSTAR_TOOL_REGISTRY,
  type NorthStarDataToolName,
  type NorthStarToolArguments,
} from "@/lib/canvas-ai/northstar-tool-registry";

export interface NorthstarToolInputValidationIssue {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

export class NorthstarToolInputValidationError extends TypeError {
  readonly toolName: NorthStarDataToolName;
  readonly issues: readonly NorthstarToolInputValidationIssue[];

  constructor(toolName: NorthStarDataToolName, issues: readonly NorthstarToolInputValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
    this.name = "NorthstarToolInputValidationError";
    this.toolName = toolName;
    this.issues = issues;
  }
}

type InputSchema = {
  type?: unknown;
  properties?: unknown;
  required?: unknown;
};

type PropertySchema = {
  type?: unknown;
  enum?: unknown;
  items?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateProperty(
  toolName: NorthStarDataToolName,
  key: string,
  value: unknown,
  schema: PropertySchema,
  path: string,
  issues: NorthstarToolInputValidationIssue[],
): unknown {
  const expectedType = typeof schema.type === "string" ? schema.type : undefined;

  if (expectedType === "string") {
    if (!nonEmptyString(value)) {
      issues.push({
        path,
        message: "must be a non-empty string.",
        expected: "non-empty string",
        received: describe(value),
      });
      return value;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      issues.push({
        path,
        message: `must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}.`,
        expected: schema.enum.join(" | "),
        received: value,
      });
    }
    return value.trim();
  }

  if (expectedType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({
        path,
        message: "must be a finite number.",
        expected: "finite number",
        received: describe(value),
      });
      return value;
    }
    if (
      key === "limit" ||
      key === "maxApps" ||
      key === "maxFlowsPerApp" ||
      key === "maxScreensPerFlow"
    ) {
      if (!Number.isInteger(value) || value < 1) {
        issues.push({
          path,
          message: "must be a positive integer.",
          expected: "positive integer",
          received: String(value),
        });
      }
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      issues.push({
        path,
        message: "must be an array.",
        expected: "array",
        received: describe(value),
      });
      return value;
    }
    const itemSchema = isRecord(schema.items) ? schema.items as PropertySchema : {};
    const normalized: unknown[] = [];
    const seenStrings = new Set<string>();
    value.forEach((entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = validateProperty(toolName, key, entry, itemSchema, itemPath, issues);
      if (typeof item === "string") {
        const token = item.toLocaleLowerCase();
        if (seenStrings.has(token)) return;
        seenStrings.add(token);
      }
      normalized.push(item);
    });
    if (normalized.length === 0) {
      issues.push({
        path,
        message: "must contain at least one valid item when provided.",
        expected: "non-empty array",
        received: "empty array",
      });
    }
    return normalized;
  }

  issues.push({
    path,
    message: `uses an unsupported registry schema type for ${toolName}.`,
    expected: expectedType ?? "declared type",
    received: describe(value),
  });
  return value;
}

function semanticIssues(
  toolName: NorthStarDataToolName,
  args: Record<string, unknown>,
  path: string,
): NorthstarToolInputValidationIssue[] {
  const issues: NorthstarToolInputValidationIssue[] = [];

  if (toolName === "get_screenshot" && !nonEmptyString(args.screenshotId) && !nonEmptyString(args.query)) {
    issues.push({
      path,
      message: "must include screenshotId or query so one screenshot can be resolved.",
      expected: "screenshotId | query",
      received: "neither",
    });
  }

  if (toolName === "prepare_composition_evidence") {
    const hasPromptScope = nonEmptyString(args.query);
    if (!hasPromptScope) {
      issues.push({
        path: `${path}.query`,
        message: "must describe the user's evidence goal rather than a generic placeholder.",
        expected: "prompt-grounded research goal",
        received: describe(args.query),
      });
    }
    const maxApps = typeof args.maxApps === "number" ? args.maxApps : undefined;
    const appNames = Array.isArray(args.appNames) ? args.appNames : [];
    if (maxApps !== undefined && appNames.length > 0 && maxApps < appNames.length) {
      issues.push({
        path: `${path}.maxApps`,
        message: "cannot be smaller than the number of explicitly requested appNames.",
        expected: `>= ${appNames.length}`,
        received: String(maxApps),
      });
    }
  }

  return issues;
}

/**
 * Validates a read-only data tool call against the registry contract at runtime.
 * The model may choose the research strategy, breadth, and number of rounds, but
 * deterministic code owns argument shape, required fields, enums, and limits.
 */
export function parseNorthstarDataToolArguments(
  toolName: NorthStarDataToolName,
  value: unknown,
  path = "$.args",
): NorthStarToolArguments {
  const schema = NORTHSTAR_TOOL_REGISTRY[toolName].inputSchema as InputSchema;
  const issues: NorthstarToolInputValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new NorthstarToolInputValidationError(toolName, [{
      path,
      message: "must be an object.",
      expected: "object",
      received: describe(value),
    }]);
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === "string")
    : [];

  for (const requiredKey of required) {
    if (!(requiredKey in value) || !nonEmptyString(value[requiredKey])) {
      issues.push({
        path: `${path}.${requiredKey}`,
        message: "is required and must be non-empty.",
        expected: "required value",
        received: requiredKey in value ? describe(value[requiredKey]) : "missing",
      });
    }
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const propertySchema = properties[key];
    if (!isRecord(propertySchema)) {
      issues.push({
        path: `${path}.${key}`,
        message: `is not an allowed argument for ${toolName}.`,
        expected: Object.keys(properties).join(", ") || "no arguments",
        received: key,
      });
      continue;
    }
    normalized[key] = validateProperty(
      toolName,
      key,
      entry,
      propertySchema as PropertySchema,
      `${path}.${key}`,
      issues,
    );
  }

  issues.push(...semanticIssues(toolName, normalized, path));
  if (issues.length > 0) throw new NorthstarToolInputValidationError(toolName, issues);
  return normalized as NorthStarToolArguments;
}
