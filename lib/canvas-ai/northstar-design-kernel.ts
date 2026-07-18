//lib/canvas-ai/northstar-design-kernel.ts
// Northstar Artifact Design Kernel v1.4 — identity primitives for bespoke composition, plain reference flows, unclipped text, and adaptive Canvas surfaces.
// This is deliberately a grammar, not a fixed template. Models compose these primitives into bespoke artifacts.

export const NORTHSTAR_DESIGN_KERNEL_VERSION = "northstar.design-kernel.v1.4" as const;

export const NORTHSTAR_DESIGN_GRAMMAR = `
NORTHSTAR DESIGN KERNEL — REQUIRED AUTHORING GRAMMAR

The runtime injects a trusted visual kernel. Use it as the foundation and add only task-specific CSS.
The root element must be:
  <main class="ns-artifact ..." data-ns-design-kernel="v1">

Core primitives:
- ns-artifact: minimum 1680×945 authored coordinate surface that may grow down, up, left, or right with the composition.
- ns-kicker, ns-thesis, ns-deck: editorial hierarchy. The thesis is Northstar's answer, never the user's prompt.
- ns-surface, ns-panel, ns-rail, ns-summary: restrained structural surfaces.
- ns-flow, ns-flow__identity, ns-flow__rail: semantic primitives for an ordered product journey. They do not prescribe a card or grid.
- ns-screen, ns-screen__frame, ns-screen__meta: real evidence moments. The frame is optional; plain screenshots are the default.
- ns-section-title, ns-insight, ns-recommendation, ns-matrix, ns-evidence-ledger: synthesis.
- ns-pill, ns-badge, ns-rule, ns-dot: concise semantic accents.
- ns-spatial-region with ns-spatial-left/right/above/below: optional authored regions that intentionally extend beyond the initial coordinate surface.

Rules:
- Start from the kernel. Do not reset it with broad selectors such as * { all: unset }, body overrides, or a competing token system.
- Prefer one strong composition over a field of unrelated cards.
- Use 14px as the normal readable text floor, 12px only for compact metadata, and 42–64px for the main thesis.
- Referenced flows use real app icon, app name, exact flow name, and a clean horizontal ordered screenshot sequence. Let the artifact widen rather than wrap or shrink the journey. Captions are optional.
- Screenshots are plain evidence by default: natural aspect ratio, minimal framing, no heavy card, tinted device well, or crop unless that treatment has a clear communicative purpose.
- The opening region should establish the artifact's authored point of view and the most important visual material. Subsequent regions may continue in editorial flow or extend spatially in any direction when that strengthens the communication.
- Use the app's real brand color only as a supporting accent. Northstar violet remains the connective system color.
- Do not recreate application chrome inside the artifact.
- Never force the artifact into a fixed viewport. Do not use 100vh/100vw as a crop, fixed body dimensions, or root-level clipping. The Canvas object expands and repositions as content emerges in any direction.
- Important text wraps. Do not ellipsize or line-clamp titles, evidence labels, findings, recommendations, or decision copy.
- The kernel is a visual vocabulary, not a module checklist. A bespoke artifact may use very few primitives.
`.trim();

export const NORTHSTAR_DESIGN_KERNEL_CSS = String.raw`
:root{
  --ns-ink:#12131b;
  --ns-muted:#696d7c;
  --ns-faint:#9498a8;
  --ns-line:rgba(62,54,105,.12);
  --ns-line-strong:rgba(83,69,164,.22);
  --ns-paper:#ffffff;
  --ns-paper-soft:#fbfaff;
  --ns-canvas:#f6f5fb;
  --ns-violet:#6b4dff;
  --ns-violet-2:#8a71ff;
  --ns-violet-soft:#eee9ff;
  --ns-green:#1fad68;
  --ns-orange:#ff6a2a;
  --ns-shadow:0 18px 56px rgba(39,30,93,.08);
  --ns-shadow-strong:0 30px 90px rgba(39,30,93,.13);
  --ns-radius-sm:12px;
  --ns-radius:18px;
  --ns-radius-lg:26px;
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;width:100%;min-height:100%;height:auto;overflow:hidden;background:var(--ns-canvas);color:var(--ns-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
button,input,select,textarea{font:inherit}
img{display:block;max-width:100%}
.ns-artifact{position:relative;width:100%;min-height:100%;height:auto;overflow:visible;padding:24px;background:radial-gradient(circle at 50% -20%,rgba(107,77,255,.09),transparent 36%),linear-gradient(180deg,#fdfcff 0%,#f6f5fb 100%);display:grid;gap:14px;align-content:start}
.ns-artifact::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(107,77,255,.11) 1px,transparent 1px);background-size:20px 20px;opacity:.24;mask-image:linear-gradient(to bottom,black,transparent 72%)}
.ns-artifact>*{position:relative;z-index:1;min-width:0;min-height:0}
.ns-spatial-region{position:relative;overflow:visible}
.ns-spatial-left{position:absolute;right:100%;top:0;margin-right:18px}
.ns-spatial-right{position:absolute;left:100%;top:0;margin-left:18px}
.ns-spatial-above{position:absolute;left:0;bottom:100%;margin-bottom:18px}
.ns-spatial-below{position:absolute;left:0;top:100%;margin-top:18px}
.ns-kicker{display:flex;align-items:center;gap:9px;margin:0 0 8px;color:var(--ns-violet);font-size:12px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}
.ns-kicker::before{content:"✦";display:grid;place-items:center;width:24px;height:24px;border-radius:9px;background:var(--ns-violet-soft);font-size:13px}
.ns-thesis{margin:0;max-width:1180px;font-size:clamp(42px,4.1vw,64px);line-height:.96;letter-spacing:-.055em;font-weight:850;text-wrap:balance}
.ns-deck{max-width:980px;margin:12px 0 0;color:var(--ns-muted);font-size:16px;line-height:1.45}
.ns-surface,.ns-panel,.ns-summary,.ns-rail{background:rgba(255,255,255,.96);border:1px solid var(--ns-line);box-shadow:var(--ns-shadow)}
.ns-surface{border-radius:var(--ns-radius-lg);padding:18px 20px}
.ns-panel{border-radius:var(--ns-radius);padding:16px 18px}
.ns-summary{border-radius:var(--ns-radius-lg);padding:18px;display:grid;align-content:start;gap:12px}
.ns-rail{border-radius:var(--ns-radius);padding:12px 14px}
.ns-section-title{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:0 0 12px}
.ns-section-title h2,.ns-section-title h3{margin:0;font-size:17px;line-height:1.1;letter-spacing:-.025em}
.ns-section-title p{margin:4px 0 0;color:var(--ns-muted);font-size:12px}
.ns-section-title>span,.ns-badge,.ns-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;white-space:nowrap}
.ns-badge{padding:6px 9px;background:var(--ns-violet-soft);color:var(--ns-violet);font-size:11px;font-weight:800}
.ns-pill{padding:5px 8px;border:1px solid var(--ns-line);background:#fff;color:var(--ns-muted);font-size:10px;font-weight:750}
.ns-rule{height:1px;background:linear-gradient(90deg,transparent,var(--ns-line-strong) 12%,var(--ns-line-strong) 88%,transparent)}
.ns-flow{display:grid;grid-template-columns:150px max-content;gap:18px;align-items:start;padding:12px 0;border:0;border-top:1px solid var(--ns-line);background:transparent;overflow:visible}
.ns-flow:first-child{border-top:0}.ns-flow+.ns-flow{margin-top:10px}
.ns-flow__identity{display:grid;align-content:start;gap:7px;padding:6px 0;background:transparent;min-width:140px}
.ns-flow__identity img{width:46px;height:46px;border-radius:13px;object-fit:cover;box-shadow:0 9px 24px rgba(30,25,64,.14)}
.ns-flow__identity strong{font-size:18px;line-height:1}.ns-flow__identity span{color:var(--ns-muted);font-size:11px;line-height:1.35}
.ns-flow__rail{display:flex;flex-flow:row nowrap;gap:14px;align-items:start;width:max-content;min-width:max-content;overflow:visible}
.ns-screen{position:relative;flex:0 0 auto;min-width:0;display:grid;gap:7px;align-content:start}
.ns-screen::after{content:"";position:absolute;left:calc(100% + 4px);top:44%;width:6px;height:1px;background:var(--ns-line-strong)}
.ns-screen:last-child::after{display:none}
.ns-screen__frame{position:relative;display:block;min-height:0;border:0;border-radius:0;background:transparent;padding:0;overflow:visible}
.ns-screen__frame img,.ns-screen>img{display:block;width:auto;height:230px;max-width:none;object-fit:contain;border-radius:8px;box-shadow:0 12px 26px rgba(39,30,93,.09);filter:saturate(.99) contrast(1.01)}
.ns-screen[data-hero="true"] .ns-screen__frame img,.ns-screen[data-hero="true"]>img{height:270px;box-shadow:0 18px 38px rgba(71,55,160,.15)}
.ns-screen__meta{max-width:160px;min-width:0}.ns-screen__meta:empty{display:none}
.ns-screen__meta b,.ns-screen__meta span{display:block;overflow:visible;text-overflow:clip;white-space:normal;word-break:normal}
.ns-screen__meta b{color:var(--ns-violet);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.ns-screen__meta span{margin-top:2px;color:#484b57;font-size:10px;line-height:1.35}
.ns-flow--compact .ns-screen__frame img,.ns-flow--compact .ns-screen>img{height:190px}
.ns-flow--hero .ns-screen__frame img,.ns-flow--hero .ns-screen>img{height:300px}
.ns-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;min-height:0}
.ns-grid{display:grid;gap:12px;min-height:0}
.ns-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
.ns-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}
.ns-grid--4{grid-template-columns:repeat(4,minmax(0,1fr))}
.ns-insight{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:start}
.ns-insight+.ns-insight{margin-top:11px}
.ns-insight__icon{width:32px;height:32px;border-radius:11px;background:var(--ns-violet-soft);color:var(--ns-violet);display:grid;place-items:center;font-weight:900}
.ns-insight strong{display:block;font-size:13px;line-height:1.25}
.ns-insight p{margin:4px 0 0;color:var(--ns-muted);font-size:11px;line-height:1.42}
.ns-recommendation{position:relative;overflow:hidden;border-radius:var(--ns-radius);padding:18px;background:linear-gradient(145deg,#714fff,#4e31e8);color:#fff;box-shadow:0 18px 42px rgba(88,59,229,.24)}
.ns-recommendation::after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-60px;top:-90px;background:rgba(255,255,255,.14)}
.ns-recommendation h3{margin:0 0 8px;font-size:25px;line-height:1.02;letter-spacing:-.035em}
.ns-recommendation p{margin:0;color:rgba(255,255,255,.84);font-size:12px;line-height:1.45}
.ns-matrix{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--ns-line);border-radius:14px;overflow:hidden;background:#fff;font-size:11px}
.ns-matrix th,.ns-matrix td{padding:9px 10px;border-bottom:1px solid var(--ns-line);text-align:left}
.ns-matrix tr:last-child td{border-bottom:0}
.ns-matrix th{background:#f8f6ff;color:#55596a;font-size:9px;letter-spacing:.07em;text-transform:uppercase}
.ns-meter{height:6px;border-radius:999px;background:#ebe8f4;overflow:hidden}
.ns-meter>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--ns-violet),var(--ns-violet-2))}
.ns-evidence-ledger{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;align-items:center;overflow:visible}
.ns-evidence-ledger>*{min-width:0}
.ns-callout{border-left:3px solid var(--ns-violet);padding:10px 12px;background:#f8f6ff;border-radius:0 12px 12px 0;color:#4e5060;font-size:11px;line-height:1.45}
.ns-dot{width:7px;height:7px;border-radius:50%;background:var(--ns-violet);display:inline-block}
.ns-dot--green{background:var(--ns-green)}.ns-dot--orange{background:var(--ns-orange)}
[data-ns-stage]{transition:transform .28s ease,box-shadow .28s ease}
[data-ns-stage-state="active"]{box-shadow:0 0 0 1px rgba(107,77,255,.08),var(--ns-shadow)}
[data-ns-stage-state="future"]{opacity:1;filter:none}
@media(max-width:1100px){.ns-thesis{font-size:42px}.ns-flow{grid-template-columns:125px max-content}.ns-layout{grid-template-columns:minmax(0,1fr) 260px}.ns-screen__frame img,.ns-screen>img{height:200px}}
`;
