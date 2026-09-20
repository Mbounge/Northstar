import type { NorthstarArtifact } from "./types";

export function resolveArtifactLink(
  url: string,
  artifacts: NorthstarArtifact[],
): NorthstarArtifact | undefined {
  let path: string;
  try {
    path = decodeURIComponent(url.replace(/^sandbox:/, ""));
  } catch {
    return;
  }
  return artifacts.find(
    (a) =>
      url === `artifact:${a.id}` ||
      (a.workspacePath && path === a.workspacePath),
  );
}

/** Download retained bytes only. Never navigate to a sandbox path or render executable files. */
export async function downloadArtifact(artifact: NorthstarArtifact) {
  const response = await fetch(artifact.dataUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(
    new Blob([blob], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
