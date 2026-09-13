import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Hash the executable canvas path and locked dependencies. */
export function canvasV2SourceFingerprint(root) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || /(?:^|[\\/])(?:node_modules|dist)(?:[\\/]|$)/.test(relative)) return;
    if (fs.statSync(absolute).isDirectory()) for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    else if (/\.(tsx?|mjs|json|yaml)$/.test(relative) || relative.endsWith("Dockerfile")) files.push(relative);
  }
  for (const relative of ["worker", "render.yaml", "app/canvas", "app/api/canvas-v2", "components/canvas-v2", "lib/canvas-v2", "lib/app-data", "e2e/canvas-v2-deterministic-evaluation.ts", "package-lock.json", "package.json", "scripts/canvas-v2-source-fingerprint.mjs", "scripts/verify-canvas-v2-production-proof.mjs"]) visit(relative);
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) hash.update(file.replaceAll(path.sep, "/") + "\0").update(fs.readFileSync(path.join(root, file))).update("\0");
  return { sha256: hash.digest("hex"), fileCount: files.length };
}
