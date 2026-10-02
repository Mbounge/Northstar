import { createHash } from "node:crypto";

/** Keep source names intact in the capture; use portable object keys in storage. */
export function storageArtifactPath(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf("/");
  const folder = slash < 0 ? "" : sourcePath.slice(0, slash + 1);
  const name = sourcePath.slice(slash + 1);
  if (/^[A-Za-z0-9_.-]+$/.test(name)) return sourcePath;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const ascii = stem.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9_-]/g, "_");
  const digest = createHash("sha256").update(name).digest("hex").slice(0, 12);
  return `${folder}${ascii}--${digest}${ext}`;
}
