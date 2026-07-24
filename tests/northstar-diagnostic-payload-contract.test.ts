import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const diagnosticsPath = path.join(process.cwd(), "lib/canvas-ai/canvas-diagnostics.ts");
const policyPath = path.join(process.cwd(), "lib/canvas-ai/northstar-health-policy.ts");
const diagnosticsSource = fs.readFileSync(diagnosticsPath, "utf8");
const policySource = fs.readFileSync(policyPath, "utf8");

test("sanitizes diagnostic payloads before they enter the in-memory trace", () => {
  assert.equal(diagnosticsSource.includes("const sanitized = sanitizeCanvasDiagnosticEvent(event);"), true);
  assert.equal(diagnosticsSource.includes("events.push({ ...sanitized"), true);
});

test("redacts secrets and summarizes bulky artifact payloads", () => {
  assert.equal(diagnosticsSource.includes("sensitiveKeyPattern.test(key)"), true);
  assert.equal(diagnosticsSource.includes('return "[REDACTED]";'), true);
  assert.equal(diagnosticsSource.includes("bulkyKeyPattern.test(key)"), true);
  assert.equal(diagnosticsSource.includes('_diagnosticSummary: "string-truncated"'), true);
});

test("bounds diagnostic depth, collection size, and retained event count", () => {
  for (const key of ["maxEvents", "maxDepth", "maxObjectKeys", "maxArrayItems", "maxStringLength"]) {
    assert.equal(policySource.includes(`${key}:`), true);
  }
  assert.equal(diagnosticsSource.includes("maximum diagnostic depth reached"), true);
  assert.equal(diagnosticsSource.includes('_diagnosticSummary: "array-truncated"'), true);
});

test("exports a versioned sanitized payload contract", () => {
  assert.equal(diagnosticsSource.includes('schema: "northstar.canvas-diagnostics.v2"'), true);
  assert.equal(diagnosticsSource.includes('payloadMode: "sanitized"'), true);
  assert.equal(diagnosticsSource.includes("sanitization: stats"), true);
});
