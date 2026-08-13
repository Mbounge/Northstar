import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const proofPath = path.join(root, "config/canvas-v2-production-proof.json");
const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function requireTrue(value, label) {
  if (value !== true) fail(`Production proof is missing: ${label}.`);
}

if (proof.schema !== "northstar.canvas-v2-production-proof.v1") fail("Unknown Canvas V2 production-proof schema.");
if (proof.phase !== "7e2-authenticated-production-proof") fail("The production proof is not the Phase 7E.2 authenticated result.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(proof.observedAt ?? "")) fail("Production proof must have an explicit observation date.");

requireTrue(proof.provider?.routerResponded, "the real router response");
requireTrue(proof.provider?.designerResponded, "the real design-model response");
requireTrue(proof.provider?.structuredResponsesParsed, "structured provider response parsing");
if (proof.catalog?.requiredAppCount !== 2 || proof.catalog?.requiredAppsResolved !== 2) fail("The standard two-app research target was not completely resolved.");
if (!(proof.catalog?.boundedContextBytes > 0 && proof.catalog?.boundedContextBytes < 40_000)) fail("The model catalog context is not demonstrably bounded.");
if (proof.catalog?.assetRangeProbeCount !== proof.catalog?.assetRangeProbeSuccessCount || proof.catalog?.assetRangeProbeCount < 6) fail("The declared icon and screenshot asset probes did not all succeed.");
if (JSON.stringify(proof.standardPrompt?.committedStepSequence) !== JSON.stringify(["research", "research", "design", "complete"])) fail("The standard prompt did not prove evidence-first synthesis and terminal completion.");
if (proof.standardPrompt?.designBeforeRequiredEvidence !== false) fail("A design turn was committed before required evidence.");
if (proof.standardPrompt?.completedBeforePostEvidenceSynthesis !== false) fail("The standard prompt completed before post-evidence synthesis.");
if (proof.standardPrompt?.canonicalScreenshotCount !== proof.standardPrompt?.selectedFlowScreenCounts?.reduce((total, count) => total + count, 0)) fail("The canonical screenshot receipt does not match the selected complete flows.");
requireTrue(proof.standardPrompt?.complete, "terminal completion of the standard prompt");

for (const [label, value] of Object.entries(proof.assertions ?? {})) requireTrue(value, label);

const serializedProof = JSON.stringify(proof);
for (const forbidden of [
  /https?:\/\//i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /tenant[_-]?id/i,
  /user[_-]?id/i,
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
]) {
  if (forbidden.test(serializedProof)) fail(`The production-proof receipt contains prohibited identifying or secret material (${forbidden}).`);
}

const router = source("app/api/canvas-v2/route/route.ts");
const design = source("app/api/canvas-v2/design/route.ts");
const director = source("lib/canvas-v2/research-director.ts");
const recovery = source("lib/canvas-v2/local-recovery.ts");
const proxy = source("proxy.ts");

if (!router.includes('researchMode: { type: "string", enum: ["none", "evidence", "synthesis"] }')) fail("The production router does not declare evidence versus synthesis intent.");
if (!design.includes("canvasV2ResearchDecisionPolicy") || !design.includes("decisionPolicy.permittedDecisions.includes")) fail("The production design route does not enforce evidence-first decision authority.");
if (!design.includes("Ground every product-specific analytical claim in a visible screen")) fail("The production designer does not require claim-level evidence grounding.");
if (!director.includes("MAX_INDEX_FLOWS_PER_APP") || !director.includes("MAX_INDEX_SCREEN_NAMES") || !director.includes("requiredAppIds")) fail("The production research context is not target-scoped and bounded.");
if (!recovery.includes("researchMode")) fail("Research intent is not retained across browser-local recovery.");
if (/CANVAS_V2_PROOF_SECRET|canvas-v2-proof-auth/.test(proxy + design + router)) fail("Temporary authenticated-proof authority escaped into production source.");

if (failures.length) {
  console.error("Canvas V2 production proof failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Canvas V2 authenticated production proof verified: ${proof.catalog.assetRangeProbeSuccessCount} real assets, ${proof.standardPrompt.canonicalScreenshotCount} canonical screenshots, evidence-first synthesis, and terminal completion.`);
}
