import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const ledgerRoot = path.join(projectRoot, "lib", "canvas-ledger");

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(absolute);
      return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [absolute] : [];
    }),
  );
  return files.flat();
}

test("ledger modules are isolated from the legacy transaction architecture", async () => {
  const forbidden = [
    "northstar-artboard-ack",
    "northstar-artboard-actor",
    "northstar-repository",
    "northstar-repository-reducer",
    "/api/canvas-ai/artifact-ack",
  ];

  for (const file of await listTypeScriptFiles(ledgerRoot)) {
    const source = await readFile(file, "utf8");
    for (const marker of forbidden) {
      assert.equal(
        source.includes(marker),
        false,
        `${path.relative(projectRoot, file)} must not reference ${marker}`,
      );
    }
  }
});

test("the ephemeral ledger foundation contains no persistence or server-global escape hatch", async () => {
  const forbidden = [
    "@/lib/supabase",
    "@supabase/",
    "localStorage",
    "indexedDB",
    "globalThis",
    "node:fs",
    "node:fs/promises",
    "writeFile",
  ];

  for (const file of await listTypeScriptFiles(ledgerRoot)) {
    const source = await readFile(file, "utf8");
    for (const marker of forbidden) {
      assert.equal(
        source.includes(marker),
        false,
        `${path.relative(projectRoot, file)} must not reference ${marker}`,
      );
    }
  }
});

test("the API route does not own or create the Phase 1 ledger", async () => {
  const route = await readFile(path.join(projectRoot, "app/api/canvas-ai/route.ts"), "utf8");
  assert.equal(route.includes("createNorthstarEphemeralLedger"), false);
  assert.equal(route.includes("@/lib/canvas-ledger"), false);
});

test("the workspace owns one stable ledger ref behind the Phase 1 feature flag", async () => {
  const workspace = await readFile(
    path.join(projectRoot, "components/canvas/north-star-canvas-workspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /NEXT_PUBLIC_NORTHSTAR_LEDGER_FOUNDATION/);
  assert.match(workspace, /useRef<NorthstarEphemeralLedger \| null>\(null\)/);
  assert.match(workspace, /createNorthstarEphemeralLedger\(/);
  assert.match(workspace, /northstarLedgerFoundationRef\.current === null/);
});
