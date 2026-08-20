import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";

function escapeStyleEnd(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

export function buildCanvasV2RuntimeDocument(revision: CanvasV2ArtifactRevision): string {
  const document = assertCanvasV2ArtifactDocument(revision.document);
  return `<!doctype html>
<html data-canvas-v2-revision-id="${revision.id}" data-canvas-v2-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      color-scheme:light;
      --northstar-ink:#151620;
      --northstar-muted:#737686;
      --northstar-violet:#6b4dff;
      --northstar-line:rgba(78,67,135,.14);
      --northstar-surface:#ffffff;
      --northstar-surface-subtle:#f6f5fa;
    }
    :root[data-canvas-v2-theme="dark"] {
      --northstar-ink:#f4f3f8;
      --northstar-muted:#aaa6b4;
      --northstar-violet:#9d8cff;
      --northstar-line:rgba(255,255,255,.12);
      --northstar-surface:#1b1a22;
      --northstar-surface-subtle:#23212b;
    }
    html, body { margin:0; width:${CANVAS_V2_WORKSPACE.width}px; height:${CANVAS_V2_WORKSPACE.height}px; min-width:0; min-height:0; background-color:transparent!important; background-image:none!important; overflow:visible; }
    html { position:relative; }
    body {
      position:relative;
      padding:0!important;
      color:var(--northstar-ink);
      font-family:Inter,ui-sans-serif,system-ui,sans-serif;
    }
    ${escapeStyleEnd(document.css)}
    /* The body is the finite canvas. The model source root is only a transparent
       full-canvas scene layer; it never owns an offset, intrinsic edge, scroll
       boundary, clipping boundary, or independent coordinate system. */
    body > [data-canvas-v2-node-id="canvas"] {
      box-sizing:border-box!important;
      position:relative!important;
      inset:0!important;
      transform:none!important;
      margin:0!important;
      width:100%!important;
      min-width:100%!important;
      max-width:none!important;
      height:100%!important;
      min-height:100%!important;
      max-height:none!important;
      padding:${CANVAS_V2_WORKSPACE.aiAuthoringInset}px!important;
      overflow:visible!important;
      contain:none!important;
      clip-path:none!important;
      background:transparent!important;
    }
  </style>
</head>
<body>${document.html}</body>
</html>`;
}
