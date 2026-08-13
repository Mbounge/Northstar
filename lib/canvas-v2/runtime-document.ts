import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";

function escapeStyleEnd(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

export function buildCanvasV2RuntimeDocument(revision: CanvasV2ArtifactRevision): string {
  const document = assertCanvasV2ArtifactDocument(revision.document);
  return `<!doctype html>
<html data-canvas-v2-revision-id="${revision.id}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root { --northstar-ink:#151620; --northstar-muted:#737686; --northstar-violet:#6b4dff; --northstar-line:rgba(78,67,135,.10); --northstar-artboard:#ffffff; }
    html, body { margin: 0; min-width: 1680px; min-height: 945px; background: var(--northstar-artboard); }
    html, body { overflow: hidden; }
    body { width: max-content; color:var(--northstar-ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
    ${escapeStyleEnd(document.css)}
  </style>
</head>
<body>${document.html}</body>
</html>`;
}
