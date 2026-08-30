import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import { assertCanvasV2ArtifactDocument } from "@/lib/canvas-v2/artifact-safety";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";

function escapeStyleEnd(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

export function buildCanvasV2RuntimeDocument(revision: CanvasV2ArtifactRevision): string {
  const document = assertCanvasV2ArtifactDocument(revision.document);
  const compositionWidth = CANVAS_V2_WORKSPACE.aiAuthoringWidth;
  return `<!doctype html>
<html data-canvas-v2-revision-id="${revision.id}" data-canvas-v2-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    /* The hidden compiler and the public native editor must begin from the
       same neutral element baseline. The public app already receives this
       baseline from Tailwind preflight; without it here, browser UA rules
       make headings bold, lists indented, and media inline while the visible
       canvas renders those same nodes differently. A later detachment would
       then materialize the compiler-only UA value and visibly restyle the
       object on move. Keep this before authored CSS so authored rules remain
       authoritative. */
    *, *::before, *::after, ::backdrop, ::file-selector-button {
      box-sizing:border-box;
      margin:0;
      padding:0;
      border:0 solid;
    }
    html {
      line-height:1.5;
      -webkit-text-size-adjust:100%;
      tab-size:4;
      font-feature-settings:normal;
      font-variation-settings:normal;
      -webkit-tap-highlight-color:transparent;
    }
    h1, h2, h3, h4, h5, h6 { font-size:inherit; font-weight:inherit; }
    a { color:inherit; -webkit-text-decoration:inherit; text-decoration:inherit; }
    b, strong { font-weight:bolder; }
    code, kbd, samp, pre {
      font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
      font-feature-settings:normal;
      font-variation-settings:normal;
      font-size:1em;
    }
    small { font-size:80%; }
    sub, sup { position:relative; font-size:75%; line-height:0; vertical-align:baseline; }
    sub { bottom:-.25em; }
    sup { top:-.5em; }
    table { border-color:inherit; border-collapse:collapse; text-indent:0; }
    ol, ul, menu { list-style:none; }
    img, svg, video, canvas, audio, iframe, embed, object { display:block; vertical-align:middle; }
    img, video { max-width:100%; height:auto; }
    button, input, select, optgroup, textarea, ::file-selector-button {
      margin:0;
      padding:0;
      color:inherit;
      font:inherit;
      font-feature-settings:inherit;
      font-variation-settings:inherit;
      letter-spacing:inherit;
      background-color:transparent;
      border-radius:0;
      opacity:1;
    }
    :root {
      color-scheme:light;
      --northstar-ink:#151620;
      --northstar-muted:#5d6070;
      --northstar-violet:#5f49e8;
      --northstar-line:rgba(66,54,123,.22);
      --northstar-surface:#ffffff;
      --northstar-surface-subtle:#f6f5fa;
      --northstar-note-surface:#fff2a8;
      --northstar-note-ink:#332e1e;
      --northstar-note-line:#d8bd51;
      --northstar-note-shadow:rgba(71,59,10,.12);
    }
    :root[data-canvas-v2-theme="dark"] {
      --northstar-ink:#f4f3f8;
      --northstar-muted:#c7c3cf;
      --northstar-violet:#9d8cff;
      --northstar-line:rgba(255,255,255,.12);
      --northstar-surface:#1b1a22;
      --northstar-surface-subtle:#23212b;
      --northstar-note-surface:#3a3218;
      --northstar-note-ink:#fff0b8;
      --northstar-note-line:#8f7a31;
      --northstar-note-shadow:rgba(0,0,0,.28);
    }
    html, body { margin:0; width:${CANVAS_V2_WORKSPACE.width}px; height:${CANVAS_V2_WORKSPACE.height}px; min-width:0; min-height:0; background-color:transparent!important; background-image:none!important; overflow:visible; }
    html { position:relative; }
    body {
      position:relative;
      /* HTML is only the native scene's measuring surface. Its compact local
         perimeter is compiled into object geometry; the native compiler then
         translates the accepted composition near the person's viewport.
         Keeping those coordinate spaces separate prevents a body-level island
         from becoming a full-world canvas overlay. */
      padding:${CANVAS_V2_WORKSPACE.documentMargin}px!important;
      color:var(--northstar-ink);
      font-family:Inter,ui-sans-serif,system-ui,sans-serif;
    }
    ${escapeStyleEnd(document.css)}
    /* Reassert the compiler coordinate perimeter after model CSS. Source
       authors are allowed to style their composition, never the world-sized
       measuring surface that establishes native object coordinates. */
    html > body {
      box-sizing:border-box!important;
      padding:${CANVAS_V2_WORKSPACE.documentMargin}px!important;
    }
    /* The body is the world canvas. The model source root is only a transparent
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
      padding:0!important;
      overflow:visible!important;
      contain:none!important;
      clip-path:none!important;
      background:transparent!important;
    }
    /* Research-only revisions intentionally keep native objects directly on
       the body. Give those objects the same compiler-owned normal-flow and
       safe-area rules as descendants of the legacy compatibility root. */
    body > [data-canvas-v2-design-region] {
      box-sizing:border-box!important;
      position:relative!important;
      inset:auto!important;
      transform:none!important;
      float:none!important;
      max-width:${compositionWidth}px!important;
    }
    body > [data-canvas-v2-design-region][data-canvas-v2-story-role="title"] {
      grid-column:1/-1!important;
      align-self:start!important;
      justify-self:start!important;
      min-width:0!important;
      max-width:${CANVAS_V2_WORKSPACE.titleMaxWidth}px!important;
      margin-top:0!important;
      margin-bottom:${CANVAS_V2_WORKSPACE.documentMargin}px!important;
    }
  </style>
</head>
<body>${document.html}</body>
</html>`;
}
