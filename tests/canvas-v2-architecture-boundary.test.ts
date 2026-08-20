import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const v2Roots = ["lib/canvas-v2", "components/canvas-v2", "app/api/canvas-v2"];
const sourceExtension = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const prohibitedImports = [
  "@/lib/canvas-ai/",
  "@/lib/canvas-artifacts/",
  "@/components/canvas/",
  "@/app/api/canvas-ai/",
  "@/lib/canvas-v2/testing/",
];
const benchmarkLanguage = [
  "NORTHSTAR_CANVAS_BENCHMARK_OBJECTIVES",
  "Hello World 2",
  "first Awin screenshot",
  "first Whop screenshot",
  "Awin and Whop onboarding flows",
  "data-e2e-",
];

function sourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return sourceExtension.test(entry.name) ? [target] : [];
  });
}

test("Canvas V2 cannot import the legacy design engine", () => {
  const files = v2Roots.flatMap((directory) => sourceFiles(path.join(root, directory)));
  assert.ok(files.length > 0, "Canvas V2 must contain at least one production source file.");

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const prohibited of prohibitedImports) {
      assert.doesNotMatch(source, new RegExp(prohibited.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} imports ${prohibited}`);
    }
  }
});
test("Canvas V2 contains no benchmark or objective-specific policy", () => {
  const files = v2Roots.flatMap((directory) => sourceFiles(path.join(root, directory)));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const phrase of benchmarkLanguage) {
      assert.equal(source.includes(phrase), false, `${file} contains benchmark language: ${phrase}`);
    }
  }
});
