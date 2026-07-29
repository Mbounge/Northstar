//lib/canvas-ai/northstar-render-capture.ts
// Northstar Render Capture v0.4.8 — exact capture of the one base surface plus its accumulated mutation journal.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import { createCanvasCodeArtifactPayloadFromPackage } from "@/lib/canvas-artifacts/types";
import type {
  CanvasCodeArtifactDataBundle,
  CanvasCodeArtifactIntrinsicBounds,
  NorthstarCreativeDirection,
  NorthstarCreativeReview,
  NorthstarWebArtifactDocument,
  NorthstarArtboardMutationBatch,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
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
  mimeType: "image/png" | "image/jpeg";
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
  focusBounds?: CanvasCodeArtifactIntrinsicBounds;
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
${Object.values(input.document.cssLayers ?? {}).join("\n")}
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
    if(operation.op==='set-runtime-module'){
      try{new Function('Northstar','data','creative','reviews',String(operation.javascript||''))(Northstar,data,creative,reviews)}catch(error){document.documentElement.dataset.northstarMutationError=String(error&&error.message||error)}continue;
    }
    const target=__northstarNode(operation.targetId);if(!target)continue;
    if(operation.op==='set-text'){target.textContent=operation.text||'';continue;}
    if(operation.op==='set-html'){if(operation.targetId==='artboard'||operation.targetId==='__root__'||target===captureRoot)throw new Error('The permanent artboard root cannot be replaced.');target.innerHTML=operation.html||'';continue;}
    if(operation.op==='recompose-region'){
      if(operation.targetId==='artboard'||operation.targetId==='__root__'||target===captureRoot)throw new Error('The permanent artboard root cannot be replaced.');
      const targetRect=target.getBoundingClientRect();const preserved=new Map();for(const placement of operation.placements||[]){const source=__northstarNode(placement.targetId);if(source){const rect=source.getBoundingClientRect();preserved.set(placement.targetId,{source,geometry:placement.preserveGeometry?{left:rect.left-targetRect.left,top:rect.top-targetRect.top,width:rect.width,height:rect.height}:null})}}
      target.innerHTML=operation.html||'';
      for(const placement of operation.placements||[]){const entry=preserved.get(placement.targetId),source=entry&&entry.source;if(!source)continue;const placeholder=__northstarNode(placement.targetId);if(placeholder&&placeholder!==source){placeholder.replaceWith(source);continue}const parent=placement.parentId===operation.targetId?target:__northstarNode(placement.parentId);const before=placement.beforeId?__northstarNode(placement.beforeId):null;if(parent){parent.insertBefore(source,before&&before.parentElement===parent?before:null);if(placement.preserveGeometry&&entry.geometry&&source.style){if(getComputedStyle(parent).position==='static')parent.style.setProperty('position','relative');source.setAttribute('data-ns-runtime-inherited-placement','true');source.style.setProperty('position','absolute','important');source.style.setProperty('left',entry.geometry.left+'px','important');source.style.setProperty('top',entry.geometry.top+'px','important');source.style.setProperty('width',Math.max(1,entry.geometry.width)+'px','important');source.style.setProperty('height',Math.max(1,entry.geometry.height)+'px','important');source.style.setProperty('margin','0px','important')}}}
      for(const retiredId of operation.retireNodeIds||[]){if(retiredId===operation.targetId||retiredId==='artboard')continue;const retired=__northstarNode(retiredId);if(retired)retired.remove()}continue;
    }
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
try{${input.document.creativeJavascript ?? ""}}catch(error){document.documentElement.dataset.northstarRuntimeError=String(error&&error.message||error);}
for(const batch of ${safeJson(input.mutationJournal ?? [])}){try{__northstarApplyBatch(batch);}catch(error){document.documentElement.dataset.northstarMutationError=String(error&&error.message||error);}}
function normalizeCapture(){
  const rootRect=captureRoot.getBoundingClientRect();
  const focus=${safeJson(input.focusBounds ?? null)};
  let minX=focus?Number(focus.minX):Math.min(0,__northstarRequestedBounds.minX),minY=focus?Number(focus.minY):Math.min(0,__northstarRequestedBounds.minY),maxX=focus?Number(focus.maxX):Math.max(${input.width},__northstarRequestedBounds.maxX),maxY=focus?Number(focus.maxY):Math.max(${input.height},__northstarRequestedBounds.maxY);
  if(!focus){captureRoot.querySelectorAll('*').forEach(element=>{
    const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return;
    const rect=element.getBoundingClientRect();if(rect.width<=0&&rect.height<=0)return;
    minX=Math.min(minX,rect.left-rootRect.left);minY=Math.min(minY,rect.top-rootRect.top);
    maxX=Math.max(maxX,rect.right-rootRect.left);maxY=Math.max(maxY,rect.bottom-rootRect.top);
  });}
  minX=Math.max(-24000,Math.min(24000,minX));minY=Math.max(-24000,Math.min(24000,minY));maxX=Math.max(minX+1,Math.min(24000,maxX));maxY=Math.max(minY+1,Math.min(24000,maxY));
  const rawWidth=Math.max(1,Math.ceil(maxX-minX));
  const rawHeight=Math.max(1,Math.ceil(maxY-minY));
  const scale=focus?Math.min(1,1600/rawWidth,1800/rawHeight):Math.min(1,1920/rawWidth,5000/rawHeight);
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
    child.stdout.on("data", (chunk: unknown) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk: unknown) => { stderr += String(chunk).slice(0, 4_000); });
    const timer = setTimeout(() => {
      killTree();
      reject(new Error(`Chromium render capture timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error: Error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code: number | null) => {
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
  focusBounds?: CanvasCodeArtifactIntrinsicBounds;
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

export interface NorthstarExactRuntimeCinemaFrame extends NorthstarRenderedArtifactPng {
  sequence: number;
  phase: "before" | "beat";
  label: string;
  beatId?: string;
  beatKind?: string;
  beatIndex?: number;
  beatCount?: number;
}

export interface NorthstarExactRuntimePreview {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  image: NorthstarRenderedArtifactPng;
  /** Exact compositor raster placed inside a stable premium Northstar workspace envelope. */
  workspaceImage: NorthstarRenderedArtifactPng;
  cinemaFrames: NorthstarExactRuntimeCinemaFrame[];
}

type CdpResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string; data?: string };
};

type NorthstarPreviewHttpRequest = { url?: string };
type NorthstarPreviewHttpResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type NorthstarPreviewConstructionEvent = {
  id: number;
  phase: "before" | "beat";
  label: string;
  beatId?: string;
  beatKind?: string;
  beatIndex?: number;
  beatCount?: number;
  width?: number;
  height?: number;
};

type NorthstarCdpCinemaFrame = NorthstarPreviewConstructionEvent & {
  screenshot: Buffer;
  width: number;
  height: number;
};

async function runChromiumCdpPreview(input: {
  html: string;
  timeoutMs: number;
  initialWidth: number;
  initialHeight: number;
  stableOuterWidth: number;
  stableOuterHeight: number;
}): Promise<{
  state: Record<string, unknown>;
  screenshot: Buffer;
  width: number;
  height: number;
  workspaceScreenshot: Buffer;
  workspaceWidth: number;
  workspaceHeight: number;
  cinemaFrames: NorthstarCdpCinemaFrame[];
}> {
  let lastError: unknown;
  for (const command of chromiumCandidates()) {
    if (command.startsWith("/") && !existsSync(command)) continue;
    const detached = process.platform !== "win32";
    const child = spawn(command, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--no-proxy-server",
      "--proxy-bypass-list=*",
      "--metrics-recording-only",
      "--no-first-run",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--run-all-compositor-stages-before-draw",
      "--remote-debugging-pipe",
      "about:blank",
    ], {
      stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
      detached,
    });
    const commandPipe = child.stdio[3] as { write: (value: string, callback?: (error?: Error | null) => void) => boolean } | null;
    const eventPipe = child.stdio[4] as { on: (event: "data", listener: (chunk: unknown) => void) => unknown } | null;
    if (!commandPipe || !eventPipe) {
      try { child.kill("SIGKILL"); } catch {}
      lastError = new Error("Chromium did not expose its DevTools pipe.");
      continue;
    }

    const pending = new Map<number, {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }>();
    let failProcess!: (error: Error) => void;
    const processFailure = new Promise<never>((_resolve, reject) => { failProcess = reject; });
    void processFailure.catch(() => undefined);
    child.once("error", (error: Error) => failProcess(error));
    child.once("exit", (code: number | null, signal: string | null) => {
      if (code === 0 || signal === "SIGKILL") return;
      failProcess(new Error(`Chromium preview exited with code ${code ?? "none"}${signal ? ` (${signal})` : ""}.`));
    });
    let nextId = 1;
    let buffer = Buffer.alloc(0);
    let processError = "";
    child.stderr?.on("data", (chunk: unknown) => { processError += String(chunk).slice(0, 8_000); });
    eventPipe.on("data", (chunk: unknown) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk as Uint8Array)]);
      while (true) {
        const delimiter = buffer.indexOf(0);
        if (delimiter < 0) break;
        const raw = buffer.subarray(0, delimiter).toString("utf8");
        buffer = buffer.subarray(delimiter + 1);
        if (!raw.trim()) continue;
        let message: CdpResponse;
        try { message = JSON.parse(raw) as CdpResponse; } catch { continue; }
        if (typeof message.id !== "number") continue;
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        pending.delete(message.id);
        if (message.error) {
          waiter.reject(new Error([message.error.message, message.error.data].filter(Boolean).join(" ") || "Chromium DevTools command failed."));
        } else {
          waiter.resolve(message.result ?? {});
        }
      }
    });

    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
      Promise.race([
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          const message = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
          commandPipe.write(`${message}\0`, (error?: Error | null) => {
            if (!error) return;
            pending.delete(id);
            reject(error);
          });
        }),
        processFailure,
      ]);

    const killTree = () => {
      try {
        if (detached && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try { child.kill("SIGKILL"); } catch {}
      }
    };
    const timeout = setTimeout(() => {
      failProcess(new Error(`Chromium exact-runtime preview timed out after ${input.timeoutMs}ms.`));
      killTree();
    }, input.timeoutMs);
    try {
      const target = await send("Target.createTarget", { url: "about:blank" });
      const targetId = String(target.targetId ?? "");
      if (!targetId) throw new Error("Chromium did not create a preview target.");
      const attached = await send("Target.attachToTarget", { targetId, flatten: true });
      const sessionId = String(attached.sessionId ?? "");
      if (!sessionId) throw new Error("Chromium did not attach to the preview target.");
      await send("Page.enable", {}, sessionId);
      await send("Runtime.enable", {}, sessionId);
      const setViewport = async (widthValue: number, heightValue: number) => {
        const width = Math.max(1, Math.min(2400, Math.ceil(widthValue || input.initialWidth)));
        const height = Math.max(1, Math.min(6000, Math.ceil(heightValue || input.initialHeight)));
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        }, sessionId);
        return { width, height };
      };
      const captureSurface = async (widthValue: number, heightValue: number) => {
        const viewport = await setViewport(widthValue, heightValue);
        await send("Runtime.evaluate", {
          expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
          awaitPromise: true,
          returnByValue: true,
        }, sessionId);
        const captured = await send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 },
        }, sessionId);
        const data = String(captured.data ?? "");
        if (!data) throw new Error("Chromium returned no compositor screenshot data.");
        return { ...viewport, screenshot: Buffer.from(data, "base64") };
      };
      await setViewport(input.initialWidth, input.initialHeight);
      const frameTree = await send("Page.getFrameTree", {}, sessionId);
      const rootFrameId = String(
        ((frameTree.frameTree as { frame?: { id?: unknown } } | undefined)?.frame?.id) ?? "",
      );
      if (!rootFrameId) throw new Error("Chromium did not expose the exact-preview root frame.");
      await send("Page.setDocumentContent", { frameId: rootFrameId, html: input.html }, sessionId);

      const startedAt = Date.now();
      let state: Record<string, unknown> | undefined;
      const seenConstructionEventIds = new Set<number>();
      const cinemaFrames: NorthstarCdpCinemaFrame[] = [];
      const shouldCaptureConstructionEvent = (event: NorthstarPreviewConstructionEvent) => {
        if (event.phase === "before") return true;
        const beatCount = Math.max(1, Math.floor(Number(event.beatCount) || 1));
        const beatIndex = Math.max(0, Math.floor(Number(event.beatIndex) || 0));
        const selected = new Set([0, Math.floor((beatCount - 1) / 2), beatCount - 1]);
        return selected.has(beatIndex);
      };
      while (Date.now() - startedAt < input.timeoutMs - 2_000) {
        const evaluated = await send("Runtime.evaluate", {
          expression: "window.__northstarPreviewState || null",
          returnByValue: true,
          awaitPromise: true,
        }, sessionId);
        const result = evaluated.result as { value?: unknown } | undefined;
        if (result?.value && typeof result.value === "object") {
          const candidate = result.value as Record<string, unknown>;
          const events = Array.isArray(candidate.constructionEvents)
            ? candidate.constructionEvents
            : [];
          for (const rawEvent of events) {
            if (!rawEvent || typeof rawEvent !== "object") continue;
            const eventValue = rawEvent as Record<string, unknown>;
            const id = Number(eventValue.id);
            if (!Number.isFinite(id) || seenConstructionEventIds.has(id)) continue;
            seenConstructionEventIds.add(id);
            const phase = eventValue.phase === "before" ? "before" : eventValue.phase === "beat" ? "beat" : undefined;
            if (!phase) continue;
            const event: NorthstarPreviewConstructionEvent = {
              id,
              phase,
              label: String(eventValue.label || (phase === "before" ? "Complete accepted source before the candidate" : "Creative construction beat")),
              beatId: typeof eventValue.beatId === "string" ? eventValue.beatId : undefined,
              beatKind: typeof eventValue.beatKind === "string" ? eventValue.beatKind : undefined,
              beatIndex: Number.isFinite(Number(eventValue.beatIndex)) ? Number(eventValue.beatIndex) : undefined,
              beatCount: Number.isFinite(Number(eventValue.beatCount)) ? Number(eventValue.beatCount) : undefined,
              width: Number(eventValue.width) || Number(candidate.width) || input.initialWidth,
              height: Number(eventValue.height) || Number(candidate.height) || input.initialHeight,
            };
            if (!shouldCaptureConstructionEvent(event) || cinemaFrames.length >= 4) continue;
            const capturedFrame = await captureSurface(event.width || input.initialWidth, event.height || input.initialHeight);
            if (capturedFrame.screenshot.length < 1_000) continue;
            cinemaFrames.push({ ...event, ...capturedFrame });
          }
          if (candidate.settled === true && candidate.paintReady === true) {
            state = candidate;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      if (!state) throw new Error("The exact runtime preview did not settle before its browser deadline.");
      const width = Math.max(1, Math.min(2400, Math.ceil(Number(state.width) || input.initialWidth)));
      const height = Math.max(1, Math.min(6000, Math.ceil(Number(state.height) || input.initialHeight)));
      const finalCapture = await captureSurface(width, height);

      // The creative model must see the artboard as the user experiences it: inside
      // a stable host-safe frame with the premium Northstar field and application
      // exclusions present. The exact compositor pixels above are not re-rendered;
      // they are placed as one raster inside the same fitting geometry used by the
      // live CodeArtifactHost.
      const workspaceWidth = 1728;
      const workspaceHeight = 960;
      const safeLeft = 560;
      const safeTop = 104;
      const safeRight = 48;
      const safeBottom = 124;
      const safeWidth = workspaceWidth - safeLeft - safeRight;
      const safeHeight = workspaceHeight - safeTop - safeBottom;
      const outerWidth = Math.max(720, input.stableOuterWidth);
      const outerHeight = Math.max(540, input.stableOuterHeight);
      const outerScale = Math.min(safeWidth / outerWidth, safeHeight / outerHeight);
      const objectWidth = Math.max(1, outerWidth * outerScale);
      const objectHeight = Math.max(1, outerHeight * outerScale);
      const artifactScale = Math.min(objectWidth / finalCapture.width, objectHeight / finalCapture.height);
      const artifactWidth = finalCapture.width * artifactScale;
      const artifactHeight = finalCapture.height * artifactScale;
      const objectLeft = safeLeft + (safeWidth - objectWidth) / 2;
      const objectTop = safeTop + (safeHeight - objectHeight) / 2;
      const artifactLeft = objectLeft + (objectWidth - artifactWidth) / 2;
      const artifactTop = objectTop + (objectHeight - artifactHeight) / 2;
      const screenshotUrl = `data:image/png;base64,${finalCapture.screenshot.toString("base64")}`;
      const workspaceMarkup = `
        <div class="ns-workspace-shell">
          <div class="ns-brand">North Star</div>
          <div class="ns-chat-shell"><strong>Chat</strong><div></div><div></div><div></div></div>
          <div class="ns-artboard-object"></div>
          <img class="ns-exact-artifact" alt="Exact candidate compositor frame" />
          <div class="ns-toolbar"></div>
          <div class="ns-fit-label">Stable outer-canvas fit ${Math.round(artifactScale * 100)}%</div>
        </div>`;
      const workspaceCss = `
        *{box-sizing:border-box}html,body{margin:0;width:${workspaceWidth}px;height:${workspaceHeight}px;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
        body{background-color:#eef1ff;background-image:radial-gradient(circle at 1px 1px,rgba(91,87,255,.22) 1.2px,transparent 1.25px),radial-gradient(circle at 55% 38%,rgba(104,112,255,.22),transparent 34%),linear-gradient(135deg,#f7f8ff 0%,#dfe5ff 48%,#f8f9ff 100%);background-size:12px 12px,100% 100%,100% 100%}
        .ns-workspace-shell{position:relative;width:100%;height:100%}.ns-brand{position:absolute;left:92px;top:32px;font-size:42px;font-weight:850;letter-spacing:-.05em;color:#0d0e13}
        .ns-chat-shell{position:absolute;left:86px;top:96px;width:430px;height:760px;border-radius:44px;background:rgba(255,255,255,.92);box-shadow:0 24px 70px rgba(52,57,115,.16);padding:34px;color:#1b1c24}.ns-chat-shell strong{font-size:20px}.ns-chat-shell div{height:1px;background:#e4e5ee;margin-top:54px}
        .ns-artboard-object{position:absolute;left:${objectLeft}px;top:${objectTop}px;width:${objectWidth}px;height:${objectHeight}px;border-radius:18px;background:white;box-shadow:0 24px 70px rgba(52,57,115,.20);overflow:hidden;outline:1px solid rgba(81,91,226,.16)}
        .ns-exact-artifact{position:absolute;left:${artifactLeft}px;top:${artifactTop}px;width:${artifactWidth}px;height:${artifactHeight}px;object-fit:fill;display:block}
        .ns-toolbar{position:absolute;left:calc(50% - 290px);bottom:28px;width:580px;height:68px;border-radius:28px;background:rgba(255,255,255,.9);box-shadow:0 14px 40px rgba(52,57,115,.18)}
        .ns-fit-label{position:absolute;right:48px;bottom:30px;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.9);font-size:12px;font-weight:700;color:#555a70}`;
      await setViewport(workspaceWidth, workspaceHeight);
      await send("Runtime.evaluate", {
        expression: `document.documentElement.innerHTML='<head><style>'+${JSON.stringify(workspaceCss)}+'</style></head><body>'+${JSON.stringify(workspaceMarkup)}+'</body>';document.querySelector('.ns-exact-artifact').src=${JSON.stringify(screenshotUrl)};new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId);
      const workspaceCapture = await captureSurface(workspaceWidth, workspaceHeight);
      killTree();
      return {
        state,
        screenshot: finalCapture.screenshot,
        width: finalCapture.width,
        height: finalCapture.height,
        workspaceScreenshot: workspaceCapture.screenshot,
        workspaceWidth: workspaceCapture.width,
        workspaceHeight: workspaceCapture.height,
        cinemaFrames,
      };
    } catch (error) {
      lastError = error instanceof Error
        ? new Error(`${error.message}${processError.trim() ? ` ${processError.trim().slice(0, 1_200)}` : ""}`)
        : error;
      killTree();
    } finally {
      clearTimeout(timeout);
      for (const waiter of pending.values()) waiter.reject(new Error("Chromium preview process closed."));
      pending.clear();
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No Chromium executable could run the exact runtime preview.");
}

function exactRuntimePreviewWrapper(input: {
  runtimeDocument: string;
  proposal: Record<string, unknown>;
  width: number;
  height: number;
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${input.width},initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;background:#f6f5fb;overflow:hidden}#preview{display:block;border:0;width:${input.width}px;height:${input.height}px}</style></head><body><iframe id="preview" sandbox="allow-scripts" title="Northstar exact private runtime preview"></iframe><script>
const frame=document.getElementById('preview');
const proposal=${safeJson(input.proposal)};
window.__northstarPreviewState={settled:false,paintReady:false,width:${input.width},height:${input.height},message:null,constructionEvents:[]};
let dispatched=false;
let nextConstructionEventId=1;
const resize=message=>{const size=message&&message.size||{};const width=Math.max(1,Math.min(24000,Math.ceil(Number(size.intrinsicWidth||size.width)||${input.width})));const height=Math.max(1,Math.min(24000,Math.ceil(Number(size.intrinsicHeight||size.height)||${input.height})));frame.style.width=width+'px';frame.style.height=height+'px';document.body.style.width=width+'px';document.body.style.height=height+'px';window.__northstarPreviewState.width=width;window.__northstarPreviewState.height=height};
const enqueueConstructionFrame=entry=>window.__northstarPreviewState.constructionEvents.push({id:nextConstructionEventId++,...entry,width:window.__northstarPreviewState.width,height:window.__northstarPreviewState.height});
const settle=message=>{if(window.__northstarPreviewState.settled)return;resize(message);window.__northstarPreviewState.message=message;window.__northstarPreviewState.settled=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__northstarPreviewState.paintReady=true}))};
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const message=event.data;if(!message||typeof message!=='object')return;if(message.type==='northstar.artifact.content-size')resize(message);if(message.type==='northstar.artifact.ready'&&!dispatched){dispatched=true;enqueueConstructionFrame({phase:'before',label:'Complete accepted source before the candidate'});setTimeout(()=>frame.contentWindow.postMessage(proposal,'*'),220);return}if(message.type==='northstar.artifact.construction-beat-started'){enqueueConstructionFrame({phase:'beat',label:String(message.beatLabel||'Creative construction beat'),beatId:message.beatId,beatKind:message.beatKind,beatIndex:message.beatIndex,beatCount:message.beatCount});return}if(message.type==='northstar.artifact.mutation-applied'||message.type==='northstar.artifact.mutation-rejected'||message.type==='northstar.artifact.runtime-error')void settle(message)});
frame.srcdoc=${safeJson(input.runtimeDocument)};
setTimeout(()=>{if(!window.__northstarPreviewState.settled)void settle({type:'northstar.artifact.runtime-error',message:'The exact runtime preview reached its settlement deadline.'})},16000);
</script></body></html>`;
}

/**
 * Executes the exact production runtime transaction in a real Chromium surface
 * and captures the same settled compositor frame that produced the terminal
 * browser receipt. No DOM cloning, SVG foreignObject serialization, or
 * cross-request rendezvous is involved.
 */
export async function captureNorthstarExactRuntimePreview(input: {
  baseArtifact: NorthstarGeneratedCodeArtifactPackage;
  candidateArtifact: NorthstarGeneratedCodeArtifactPackage;
  timeoutMs?: number;
}): Promise<NorthstarExactRuntimePreview> {
  const batch = input.candidateArtifact.mutationJournal?.at(-1);
  if (!batch) throw new Error("The exact runtime preview requires one candidate mutation batch.");
  if (input.candidateArtifact.parentRevisionId !== input.baseArtifact.revisionId) {
    throw new Error(`Preview candidate parent ${input.candidateArtifact.parentRevisionId ?? "none"} does not match exact base ${input.baseArtifact.revisionId}.`);
  }
  const previewId = crypto.randomUUID();
  const surfaceId = `${input.baseArtifact.surfaceId ?? input.baseArtifact.artifactId}:server-preview:${previewId}`;
  const proposalId = `server-preview-${previewId}`;
  const ackToken = `${input.candidateArtifact.artifactId}:${proposalId}`;
  const base = {
    ...input.baseArtifact,
    surfaceId,
    pendingAckToken: undefined,
    mutationJournal: [],
  };
  const payload = createCanvasCodeArtifactPayloadFromPackage(base, Math.max(0, base.stages.length - 1));
  const runtimeDocument = buildCanvasArtifactRuntimeDocument(payload);
  if (!runtimeDocument) throw new Error("Northstar could not build the production runtime document for exact preview.");
  const proposal = {
    type: "northstar.artifact.apply-mutation",
    artifactId: input.candidateArtifact.artifactId,
    surfaceId,
    revisionId: input.candidateArtifact.revisionId,
    baseRevisionId: input.baseArtifact.revisionId,
    proposalId,
    ackToken,
    batch,
    assetUrls: input.candidateArtifact.dataBundle.allowedAssetUrls ?? [],
  };
  const width = Math.max(720, Math.min(2400, Math.round(input.baseArtifact.preferredWidth)));
  const height = Math.max(540, Math.min(6000, Math.round(input.baseArtifact.preferredHeight)));
  const previewHtml = exactRuntimePreviewWrapper({ runtimeDocument, proposal, width, height });
  const result = await runChromiumCdpPreview({
    html: previewHtml,
    timeoutMs: input.timeoutMs ?? 38_000,
    initialWidth: width,
    initialHeight: height,
    stableOuterWidth: Math.max(720, Math.round(input.baseArtifact.preferredWidth)),
    stableOuterHeight: Math.max(540, Math.round(input.baseArtifact.preferredHeight)),
  });
  if (result.screenshot.length < 1_000) throw new Error("The exact runtime compositor screenshot was empty.");
  const message = result.state.message as Record<string, unknown> | undefined;
  if (!message) throw new Error("The exact runtime preview returned no terminal browser message.");
  const type = String(message.type ?? "");
  const status: NorthstarArtifactMutationAcknowledgement["status"] = type === "northstar.artifact.mutation-applied"
    ? "applied"
    : "rejected";
  const acknowledgement: NorthstarArtifactMutationAcknowledgement = {
      schema: "northstar.artboard-ack.v1",
      proposalId: String(message.proposalId ?? proposalId),
      ackToken: String(message.ackToken ?? ackToken),
      baseRevisionId: String(message.baseRevisionId ?? input.baseArtifact.revisionId),
      artifactId: input.candidateArtifact.artifactId,
      surfaceId,
      revisionId: String(message.revisionId ?? input.candidateArtifact.revisionId),
      mutationId: typeof message.mutationId === "string" ? message.mutationId : batch.mutationId,
      status,
      reason: status === "rejected" ? String(message.reason ?? message.message ?? "The exact private runtime rejected the candidate.") : undefined,
      size: message.size as NorthstarArtifactMutationAcknowledgement["size"],
      review: message.review as NorthstarArtifactMutationAcknowledgement["review"],
      changedNodeIds: Array.isArray(message.changedNodeIds) ? message.changedNodeIds.filter((value): value is string => typeof value === "string") : [],
      meaningfulChangedNodeIds: Array.isArray(message.meaningfulChangedNodeIds) ? message.meaningfulChangedNodeIds.filter((value): value is string => typeof value === "string") : [],
      changeKinds: Array.isArray(message.changeKinds) ? message.changeKinds as NorthstarArtifactMutationAcknowledgement["changeKinds"] : [],
      requiredAssetUrls: Array.isArray(message.requiredAssetUrls) ? message.requiredAssetUrls.filter((value): value is string => typeof value === "string") : [],
      loadedAssetUrls: Array.isArray(message.loadedAssetUrls) ? message.loadedAssetUrls.filter((value): value is string => typeof value === "string") : [],
      missingAssetUrls: Array.isArray(message.missingAssetUrls) ? message.missingAssetUrls.filter((value): value is string => typeof value === "string") : [],
      snapshot: message.snapshot as NorthstarArtifactMutationAcknowledgement["snapshot"],
      acknowledgedAt: new Date().toISOString(),
    };
  return {
    acknowledgement,
    image: {
      mimeType: "image/png",
      data: result.screenshot.toString("base64"),
      width: result.width,
      height: result.height,
    },
    workspaceImage: {
      mimeType: "image/png",
      data: result.workspaceScreenshot.toString("base64"),
      width: result.workspaceWidth,
      height: result.workspaceHeight,
    },
    cinemaFrames: result.cinemaFrames.map((frame, sequence) => ({
      sequence,
      phase: frame.phase,
      label: frame.label,
      beatId: frame.beatId,
      beatKind: frame.beatKind,
      beatIndex: frame.beatIndex,
      beatCount: frame.beatCount,
      mimeType: "image/png" as const,
      data: frame.screenshot.toString("base64"),
      width: frame.width,
      height: frame.height,
    })),
  };
}
