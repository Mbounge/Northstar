import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "config/canvas-v2-cutover-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const cutoverReceipt = JSON.parse(fs.readFileSync(path.join(root, manifest.cutoverReceipt), "utf8"));
const failures = [];
const sourceExtension = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function fail(message) {
  failures.push(message);
}

function absolute(relative) {
  return path.join(root, relative);
}

function source(relative) {
  return fs.readFileSync(absolute(relative), "utf8");
}

function files(directory) {
  const target = absolute(directory);
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? files(relative) : [relative];
  });
}

function sourceFiles(directory) {
  return files(directory).filter((file) => sourceExtension.test(file));
}

function ensureExists(relative) {
  if (!fs.existsSync(absolute(relative))) fail(`Missing declared cutover path: ${relative}`);
}

function countPattern(directory, pattern) {
  return files(directory).filter((file) => pattern.test(path.posix.basename(file))).length;
}

if (manifest.schema !== "northstar.canvas-v2-cutover-readiness.v1") fail("Unknown Canvas V2 cutover manifest schema.");
if (manifest.phase !== "7e3-canonical-cutover") fail("The readiness verifier only accepts the explicit Phase 7E.3 canonical-cutover state.");
if (manifest.retirementReadiness?.status !== "paused-pending-7e3.1-live-proof") fail("V1 retirement must remain paused until the 7E.3.1 tenant-evidence result is proven live.");
if (!Array.isArray(manifest.retirementReadiness?.requiredProof) || manifest.retirementReadiness.requiredProof.length < 3) fail("The 7E.3.1 retirement hold is missing its explicit proof conditions.");

[
  manifest.cutoverReceipt,
  manifest.canonicalRoute.file,
  manifest.previewAlias.file,
  ...manifest.productionV2.routeFiles,
  ...manifest.productionV2.sourceRoots,
  manifest.productionV2.workspace,
  manifest.productionV2.sharedDataAdapter,
  ...manifest.testOnly.routeRoots,
  manifest.testOnly.fixture,
  ...manifest.legacyV1.runtimeRoots,
  ...manifest.legacyV1.entryFiles,
  ...manifest.sharedKeep,
].forEach(ensureExists);

if (cutoverReceipt.schema !== "northstar.canvas-v2-canonical-cutover.v1" || cutoverReceipt.phase !== manifest.phase) fail("The canonical cutover receipt does not match the current manifest phase.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverReceipt.observedAt ?? "")) fail("The canonical cutover receipt must have an explicit observation date.");
if (cutoverReceipt.canonicalRoute?.requestedPath !== "/canvas" || cutoverReceipt.canonicalRoute?.settledPath !== "/canvas") fail("The cutover receipt does not prove the canonical /canvas URL.");
if (cutoverReceipt.previewAlias?.requestedPath !== "/canvas-v2" || cutoverReceipt.previewAlias?.settledPath !== "/canvas" || cutoverReceipt.previewAlias?.redirected !== true || cutoverReceipt.previewAlias?.duplicateWorkspaceOwner !== false) fail("The cutover receipt does not prove one redirected preview alias.");
for (const [label, value] of Object.entries({
  authenticatedWorkspaceRendered: cutoverReceipt.canonicalRoute?.authenticatedWorkspaceRendered,
  v2WorkspaceRendered: cutoverReceipt.canonicalRoute?.v2WorkspaceRendered,
  existingCommittedArtboardRestored: cutoverReceipt.canonicalRoute?.existingCommittedArtboardRestored,
  existingChatHistoryRestored: cutoverReceipt.canonicalRoute?.existingChatHistoryRestored,
  inspectionAnswerRendered: cutoverReceipt.canonicalSmoke?.inspectionAnswerRendered,
  reloadPreservedArtboard: cutoverReceipt.canonicalSmoke?.reloadPreservedArtboard,
  reloadPreservedChat: cutoverReceipt.canonicalSmoke?.reloadPreservedChat,
})) {
  if (value !== true) fail(`The canonical cutover receipt is missing ${label}.`);
}
if (cutoverReceipt.canonicalSmoke?.route !== "inspect" || cutoverReceipt.canonicalSmoke?.v2RouterRequestCount < 1) fail("The canonical cutover receipt does not prove a real V2 router interaction.");
if (cutoverReceipt.canonicalSmoke?.legacyEndpointRequestCount !== 0 || cutoverReceipt.canonicalSmoke?.artboardRevisionChanged !== false) fail("The canonical inspection smoke mutated the artboard or contacted V1.");
if (cutoverReceipt.boundaries?.canvasEngineConsumers !== 0 || cutoverReceipt.boundaries?.canonicalV1Imports !== 0 || cutoverReceipt.boundaries?.canonicalLegacyEndpointReferences !== 0) fail("The cutover receipt contains unresolved route ownership ambiguity.");
if (cutoverReceipt.boundaries?.remoteCanvasWritesAdded !== false || cutoverReceipt.boundaries?.v1FilesDeleted !== false) fail("Phase 7E.3 exceeded its persistence or retirement authority.");
const serializedCutoverReceipt = JSON.stringify(cutoverReceipt);
for (const forbidden of [/https?:\/\//i, /access[_-]?token/i, /refresh[_-]?token/i, /api[_-]?key/i, /service[_-]?role/i, /tenant[_-]?id/i, /user[_-]?id/i, /@[a-z0-9.-]+\.[a-z]{2,}/i]) {
  if (forbidden.test(serializedCutoverReceipt)) fail(`The canonical cutover receipt contains prohibited identifying or secret material (${forbidden}).`);
}

for (const removed of manifest.testOnly.removedStaleFiles) {
  if (fs.existsSync(absolute(removed))) fail(`Stale test-only source still exists: ${removed}`);
}

const canonical = source(manifest.canonicalRoute.file);
if (!canonical.includes("CanvasV2Workspace")) fail("The canonical /canvas route does not render Canvas V2.");
if (canonical.includes("NorthStarCanvasWorkspace") || canonical.includes("CANVAS_ENGINE") || canonical.includes("@/components/canvas/")) fail("The canonical /canvas route still contains V1 or feature-flag fallback authority.");
if (!canonical.includes("createClient") || !canonical.includes("supabase.auth.getUser()")) fail("The canonical /canvas route no longer enforces its authenticated server boundary.");

const preview = source(manifest.previewAlias.file);
if (!preview.includes('redirect("/canvas")')) fail("The /canvas-v2 alias does not redirect to the canonical /canvas route.");
if (preview.includes("CanvasV2Workspace") || preview.includes("NorthStarCanvasWorkspace") || preview.includes("createClient")) fail("The /canvas-v2 alias still owns a workspace or duplicate authentication path.");

const prohibitedV2 = [
  "@/lib/canvas-ai/",
  "@/lib/canvas-artifacts/",
  "@/components/canvas/",
  "@/app/api/canvas-ai/",
  "@/app/canvas-v2-e2e/",
  "@/lib/canvas-v2/testing/",
  "NORTHSTAR_E2E",
  "CANVAS_ENGINE",
  "data-e2e-",
];
const productionV2Files = manifest.productionV2.sourceRoots.flatMap(sourceFiles);
if (productionV2Files.length !== manifest.productionV2.expectedSourceFileCount) {
  fail(`Canvas V2 production inventory changed: expected ${manifest.productionV2.expectedSourceFileCount} files, found ${productionV2Files.length}. Update the manifest deliberately.`);
}
for (const file of productionV2Files) {
  const contents = source(file);
  for (const prohibited of prohibitedV2) {
    if (contents.includes(prohibited)) fail(`${file} crosses the production V2 boundary with ${prohibited}`);
  }
}

const sharedAdapter = source(manifest.productionV2.sharedDataAdapter);
for (const prohibited of ["@/lib/canvas-ai/", "@/lib/canvas-artifacts/", "@/components/canvas/"]) {
  if (sharedAdapter.includes(prohibited)) fail(`The neutral app-data adapter imports legacy authority: ${prohibited}`);
}

const fixtureImporters = ["app", "components", "lib"].flatMap(sourceFiles).filter((file) => source(file).includes("canvas-v2-e2e/research-fixture"));
if (!fixtureImporters.length || fixtureImporters.some((file) => !file.startsWith("app/canvas-v2-e2e/"))) {
  fail(`The deterministic research fixture escaped its test-only route root: ${fixtureImporters.join(", ") || "no guarded importer"}`);
}

const guardedE2EFiles = [
  "app/canvas-v2-e2e/page.tsx",
  "app/canvas-v2-e2e/design/route.ts",
  "app/canvas-v2-e2e/research/route.ts",
  "app/canvas-v2-e2e/route/route.ts",
  "app/__northstar-e2e/page.tsx",
];
for (const file of guardedE2EFiles) {
  const contents = source(file);
  if (!contents.includes('process.env.NODE_ENV === "production"') || !contents.includes('process.env.NORTHSTAR_E2E !== "1"')) {
    fail(`${file} does not fail closed in production and without NORTHSTAR_E2E=1.`);
  }
}
const proxySource = source("proxy.ts");
if (!proxySource.includes('process.env.NODE_ENV !== "production"') || !proxySource.includes('process.env.NORTHSTAR_E2E === "1"')) {
  fail("proxy.ts does not require both a non-production process and NORTHSTAR_E2E=1 for harness bypass.");
}

const legacyFiles = manifest.legacyV1.runtimeRoots.flatMap(files);
if (legacyFiles.length !== manifest.legacyV1.expectedRuntimeFileCount) {
  fail(`V1 runtime inventory changed: expected ${manifest.legacyV1.expectedRuntimeFileCount} files, found ${legacyFiles.length}. Update the manifest deliberately.`);
}
const legacyPrefixes = ["@/components/canvas/", "@/lib/canvas-ai/", "@/lib/canvas-artifacts/"];
const legacyRoots = manifest.legacyV1.runtimeRoots.map((directory) => `${directory}/`);
const externalLegacyImporters = ["app", "components", "lib"].flatMap(sourceFiles).filter((file) => {
  if (legacyRoots.some((prefix) => file.startsWith(prefix))) return false;
  const contents = source(file);
  return legacyPrefixes.some((prefix) => contents.includes(prefix));
}).sort();
const expectedLegacyImporters = [...manifest.legacyV1.allowedExternalImportersDuringCutover].sort();
if (JSON.stringify(externalLegacyImporters) !== JSON.stringify(expectedLegacyImporters)) {
  fail(`Unexpected V1 importer set. Expected ${expectedLegacyImporters.join(", ")}; found ${externalLegacyImporters.join(", ") || "none"}.`);
}

const legacyUnitCount = countPattern("tests", /^northstar-.*\.test\.ts$/);
const legacyBrowserCount = countPattern("e2e", /^northstar-.*\.spec\.ts$/);
if (legacyUnitCount !== manifest.legacyV1.unitTestCount) fail(`Legacy unit-test inventory changed: expected ${manifest.legacyV1.unitTestCount}, found ${legacyUnitCount}.`);
if (legacyBrowserCount !== manifest.legacyV1.browserTestCount) fail(`Legacy browser-test inventory changed: expected ${manifest.legacyV1.browserTestCount}, found ${legacyBrowserCount}.`);

const workspace = source(manifest.productionV2.workspace);
for (const endpoint of ["/api/canvas-v2/route", "/api/canvas-v2/design", "/api/canvas-v2/research"]) {
  if (!workspace.includes(endpoint)) fail(`Canvas V2 workspace is missing its production endpoint: ${endpoint}`);
}

const sourceUniverse = ["app", "components", "lib"].flatMap(sourceFiles);
const canvasEngineUsers = sourceUniverse.filter((file) => source(file).includes("CANVAS_ENGINE"));
if (canvasEngineUsers.length) fail(`CANVAS_ENGINE survived canonical cutover in: ${canvasEngineUsers.join(", ")}.`);

const canonicalRuntime = [manifest.canonicalRoute.file, ...productionV2Files];
for (const endpoint of ["/api/canvas-ai", "/api/canvas-ai/artifact-ack", "/api/canvas-artifacts/prototype"]) {
  const consumers = canonicalRuntime.filter((file) => source(file).includes(endpoint));
  if (consumers.length) fail(`Canonical Canvas V2 still references legacy endpoint ${endpoint}: ${consumers.join(", ")}.`);
}

if (failures.length) {
  console.error("Canvas V2 cutover readiness failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Canvas V2 canonical cutover verified: /canvas is V2-only, /canvas-v2 redirects canonically, ${productionV2Files.length} V2 source files remain isolated, and ${legacyFiles.length} V1 runtime files remain dormant while the 7E.3.1 live-proof hold pauses retirement.`);
}
