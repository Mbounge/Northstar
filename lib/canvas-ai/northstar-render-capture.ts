//lib/canvas-ai/northstar-render-capture.ts
// Northstar Render Capture v0.4.8 — exact capture of the one base surface plus its accumulated mutation journal.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  CanvasCodeArtifactDataBundle,
  NorthstarCreativeDirection,
  NorthstarCreativeReview,
  NorthstarWebArtifactDocument,
  NorthstarArtboardMutationBatch,
} from "@/lib/canvas-artifacts/types";


const NORTHSTAR_CAPTURE_BASE_CSS = String.raw`
:root{--ns-ink:#151620;--ns-muted:#696d7c;--ns-violet:#6b4dff;--ns-paper:#fff;--ns-canvas:#f6f5fb}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;width:100%;min-height:100%;height:auto;color:var(--ns-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
img{display:block;max-width:100%}
button,input,select,textarea{font:inherit}
.ns-artifact{position:relative;display:block;width:100%;min-height:100%;height:auto;overflow:visible;background:var(--ns-canvas)}
.ns-thesis{margin:0;font-weight:850;letter-spacing:-.045em;text-wrap:balance}
`;

export interface NorthstarRenderedArtifactPng {
  mimeType: "image/png";
  data: string;
  width: number;
  height: number;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function runtimePrelude(width: number, height: number): string {
  return `
const __northstarRequestedBounds={minX:0,minY:0,maxX:${width},maxY:${height}};
const __northstarRoot=document.getElementById('northstar-capture-root');
const Northstar = Object.freeze({
  root:__northstarRoot,
  query(selector){return __northstarRoot?.querySelector(selector)||null;},
  queryAll(selector){return Array.from(__northstarRoot?.querySelectorAll(selector)||[]);},
  canvas:Object.freeze({
    baseSize:Object.freeze({width:${width},height:${height}}),
    requestSpace(request={}){
      const left=Math.max(0,Number(request.left)||0),top=Math.max(0,Number(request.top)||0),right=Math.max(0,Number(request.right)||0),bottom=Math.max(0,Number(request.bottom)||0);
      __northstarRequestedBounds.minX=Math.min(__northstarRequestedBounds.minX,-left);
      __northstarRequestedBounds.minY=Math.min(__northstarRequestedBounds.minY,-top);
      __northstarRequestedBounds.maxX=Math.max(__northstarRequestedBounds.maxX,${width}+right);
      __northstarRequestedBounds.maxY=Math.max(__northstarRequestedBounds.maxY,${height}+bottom);
    }
  }),
  viz: Object.freeze({
    clamp(value,min,max){return Math.min(max,Math.max(min,value));},
    extent(values){const clean=values.filter(Number.isFinite);return clean.length?[Math.min(...clean),Math.max(...clean)]:[0,1];},
    linearScale(domain,range){const d=domain[1]-domain[0]||1;const r=range[1]-range[0];return value=>range[0]+((value-domain[0])/d)*r;},
    bandScale(values,range,padding=.12){const total=Math.max(1,values.length);const span=range[1]-range[0];const step=span/total;const width=step*(1-padding);return {bandwidth:width,position:value=>range[0]+Math.max(0,values.indexOf(value))*step+(step-width)/2};},
    linePath(points){return points.length?points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' '):'';},
    areaPath(points,baseline){if(!points.length)return'';return points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')+' L '+points[points.length-1][0]+' '+baseline+' L '+points[0][0]+' '+baseline+' Z';},
    formatNumber(value){return new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value);}
  })
});`;
}

function buildHtml(input: {
  document: NorthstarWebArtifactDocument;
  dataBundle: CanvasCodeArtifactDataBundle;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews?: NorthstarCreativeReview[];
  width: number;
  height: number;
  mutationJournal?: NorthstarArtboardMutationBatch[];
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=${input.width},initial-scale=1">
<meta id="northstar-capture-size" data-width="${input.width}" data-height="${input.height}" />
<style>
${NORTHSTAR_CAPTURE_BASE_CSS}
html,body{margin:0;overflow:hidden;background:#f6f5fb}body{position:relative;width:${input.width}px;min-height:${input.height}px}
#northstar-capture-stage{position:relative;width:${input.width}px;height:${input.height}px;overflow:visible}
#northstar-capture-origin{position:absolute;left:0;top:0;width:max-content;height:max-content;transform-origin:top left;overflow:visible}
#northstar-capture-root{display:flow-root;width:${input.width}px;min-height:${input.height}px;overflow:visible}
${input.document.css}
</style></head>
<body style="visibility:hidden"><div id="northstar-capture-stage"><div id="northstar-capture-origin"><div id="northstar-capture-root">${input.document.html}</div></div></div>
<script>
${runtimePrelude(input.width, input.height)}
const data=Object.freeze(${safeJson(input.dataBundle)});
const creative=Object.freeze(${safeJson(input.creativeDirection ?? null)});
const reviews=Object.freeze(${safeJson(input.creativeReviews ?? [])});
const captureRoot=document.getElementById('northstar-capture-root');
const captureOrigin=document.getElementById('northstar-capture-origin');
const captureStage=document.getElementById('northstar-capture-stage');
const captureMeta=document.getElementById('northstar-capture-size');
const __northstarLegacySelectors=Object.freeze({artboard:'.ns-artifact,main,article',header:'header,.ns-header',title:'.ns-thesis,h1',deck:'.ns-deck,.working-deck,header p',evidence:'.working-evidence,.ns-atlas,[data-ns-reference-flow],[data-ns-flow-id]',synthesis:'.working-synthesis,.ns-synthesis,.synthesis,footer',decision:'.working-decision,.ns-decision,.recommendation,[data-ns-stage="recommendation"]','current-act':'.working-act','current-act-text':'.working-act strong'});
const __northstarNode=id=>{if(id==='__root__')return captureRoot;const clean=String(id).replace(/[^a-zA-Z0-9:_-]/g,'');const direct=captureRoot.querySelector('[data-ns-node-id="'+clean+'"]');if(direct)return direct;const selector=__northstarLegacySelectors[id];const legacy=selector?captureRoot.querySelector(selector):null;if(legacy&&!legacy.hasAttribute('data-ns-node-id'))legacy.setAttribute('data-ns-node-id',id);return legacy;};
const __northstarApplyBatch=batch=>{
  for(const operation of batch.operations||[]){
    if(operation.op==='request-space'){Northstar.canvas.requestSpace(operation);continue;}
    if(operation.op==='set-css-layer'){
      const id='northstar-mutation-style-'+String(operation.layerId).replace(/[^a-zA-Z0-9_-]/g,'-');
      let style=document.getElementById(id);if(!style){style=document.createElement('style');style.id=id;document.head.appendChild(style);}style.textContent=operation.css||'';continue;
    }
    const target=__northstarNode(operation.targetId);if(!target)continue;
    if(operation.op==='set-text'){target.textContent=operation.text||'';continue;}
    if(operation.op==='set-html'){if(operation.targetId==='artboard'||operation.targetId==='__root__'||target===captureRoot)throw new Error('The permanent artboard root cannot be replaced.');target.innerHTML=operation.html||'';continue;}
    if(operation.op==='insert-html'){target.insertAdjacentHTML(operation.position,operation.html||'');continue;}
    if(operation.op==='remove'){if(operation.targetId!=='artboard'&&operation.targetId!=='__root__'&&target!==captureRoot)target.remove();continue;}
    if(operation.op==='move'){
      const parent=__northstarNode(operation.parentId),before=operation.beforeId?__northstarNode(operation.beforeId):null;
      if(parent)parent.insertBefore(target,before&&before.parentElement===parent?before:null);continue;
    }
    if(operation.op==='set-attributes'){Object.entries(operation.attributes||{}).forEach(([key,value])=>value===null?target.removeAttribute(key):target.setAttribute(key,String(value)));continue;}
    if(operation.op==='set-styles'){Object.entries(operation.styles||{}).forEach(([key,value])=>value===null?target.style.removeProperty(key):target.style.setProperty(key,String(value)));continue;}
    if(operation.op==='set-classes'){(operation.remove||[]).forEach(value=>target.classList.remove(value));(operation.add||[]).forEach(value=>target.classList.add(value));}
  }
};
try{${input.document.javascript}}catch(error){document.documentElement.dataset.northstarRuntimeError=String(error&&error.message||error);}
for(const batch of ${safeJson(input.mutationJournal ?? [])}){try{__northstarApplyBatch(batch);}catch(error){document.documentElement.dataset.northstarMutationError=String(error&&error.message||error);}}
function normalizeCapture(){
  const rootRect=captureRoot.getBoundingClientRect();
  let minX=Math.min(0,__northstarRequestedBounds.minX),minY=Math.min(0,__northstarRequestedBounds.minY),maxX=Math.max(${input.width},__northstarRequestedBounds.maxX),maxY=Math.max(${input.height},__northstarRequestedBounds.maxY);
  captureRoot.querySelectorAll('*').forEach(element=>{
    const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return;
    const rect=element.getBoundingClientRect();if(rect.width<=0&&rect.height<=0)return;
    minX=Math.min(minX,rect.left-rootRect.left);minY=Math.min(minY,rect.top-rootRect.top);
    maxX=Math.max(maxX,rect.right-rootRect.left);maxY=Math.max(maxY,rect.bottom-rootRect.top);
  });
  const rawWidth=Math.max(1,Math.ceil(maxX-minX));
  const rawHeight=Math.max(1,Math.ceil(maxY-minY));
  const scale=Math.min(1,1920/rawWidth,5000/rawHeight);
  const width=Math.max(1,Math.ceil(rawWidth*scale));
  const height=Math.max(1,Math.ceil(rawHeight*scale));
  captureOrigin.style.transform='translate('+(-minX*scale)+'px,'+(-minY*scale)+'px) scale('+scale+')';
  captureStage.style.width=width+'px';captureStage.style.height=height+'px';
  document.body.style.width=width+'px';document.body.style.height=height+'px';
  captureMeta.setAttribute('data-width',String(width));captureMeta.setAttribute('data-height',String(height));
  document.documentElement.dataset.northstarRenderReady='true';document.body.style.visibility='visible';
}
Promise.all([document.fonts?.ready||Promise.resolve(),...Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});}))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(normalizeCapture)));
setTimeout(normalizeCapture,7000);
</script></body></html>`;
}

function chromiumCandidates(): string[] {
  return [
    process.env.NORTHSTAR_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "chromium",
    "chromium-browser",
    "google-chrome",
  ].filter((value): value is string => Boolean(value));
}

async function runChromium(command: string, args: string[], timeoutMs: number): Promise<string> {
  if (command.startsWith("/") && !existsSync(command)) throw new Error(`Chromium executable not found at ${command}`);
  return await new Promise<string>((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached,
    });
    const killTree = () => {
      try {
        if (detached && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 4_000); });
    const timer = setTimeout(() => {
      killTree();
      reject(new Error(`Chromium render capture timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Chromium exited with code ${code}. ${stderr.trim().slice(0, 1_500)}`));
    });
  });
}

export async function captureNorthstarArtifactPng(input: {
  document: NorthstarWebArtifactDocument;
  dataBundle: CanvasCodeArtifactDataBundle;
  creativeDirection?: NorthstarCreativeDirection;
  creativeReviews?: NorthstarCreativeReview[];
  width: number;
  height: number;
  mutationJournal?: NorthstarArtboardMutationBatch[];
  timeoutMs?: number;
}): Promise<NorthstarRenderedArtifactPng> {
  const baseWidth = Math.max(720, Math.min(2400, Math.round(input.width)));
  const baseHeight = Math.max(540, Math.min(6000, Math.round(input.height)));
  const directory = await mkdtemp(path.join(tmpdir(), "northstar-render-"));
  const htmlPath = path.join(directory, "artifact.html");
  const pngPath = path.join(directory, "artifact.png");
  try {
    await writeFile(htmlPath, buildHtml({ ...input, width: baseWidth, height: baseHeight }), "utf8");
    let commandUsed: string | undefined;
    let measuredWidth = baseWidth;
    let measuredHeight = baseHeight;
    let lastError: unknown;
    const commonArgs = [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--disable-component-update", "--disable-extensions",
      "--disable-sync", "--metrics-recording-only", "--no-first-run", "--hide-scrollbars",
      "--allow-file-access-from-files", "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=8000",
    ];
    for (const command of chromiumCandidates()) {
      try {
        const dumped = await runChromium(command, [...commonArgs, "--dump-dom", `file://${htmlPath}`], input.timeoutMs ?? 28_000);
        const match = dumped.match(/id="northstar-capture-size"[^>]*data-width="(\d+)"[^>]*data-height="(\d+)"/i);
        if (match) {
          measuredWidth = Math.max(1, Math.min(1920, Number(match[1]) || baseWidth));
          measuredHeight = Math.max(1, Math.min(5000, Number(match[2]) || baseHeight));
        }
        commandUsed = command;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!commandUsed) throw lastError;
    await runChromium(commandUsed, [
      ...commonArgs,
      `--window-size=${measuredWidth},${measuredHeight}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ], input.timeoutMs ?? 28_000);
    const bytes = await readFile(pngPath);
    if (bytes.length < 1_000) throw new Error("Chromium produced an empty artifact screenshot.");
    return { mimeType: "image/png", data: bytes.toString("base64"), width: measuredWidth, height: measuredHeight };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
