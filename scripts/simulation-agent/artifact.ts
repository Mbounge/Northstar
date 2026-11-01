import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildCanvasV2ScreenRuntime } from '../../lib/canvas-v2/interactive-screen-runtime';
import { validateCanvasV2Screen } from '../../lib/canvas-v2/interactive-screen';
import { jsonData, safeId, validateShape, PLAN_SCHEMA, IMPLEMENTATION_SCHEMA, type Plan, type Implementation } from './contracts';
import { sha, type Evidence, type Asset } from './evidence';

export function validatePlan(plan: Plan, evidence: Evidence) {
  validateShape(PLAN_SCHEMA, plan);
  const states = new Set(plan.states.map(s => s.id)), captures = new Set(evidence.captures.map(c => c.id));
  if (!plan.scope.trim() || !plan.states.length || states.size !== plan.states.length || !states.has(plan.initialState) || plan.states.some(s => !safeId(s.id) || !captures.has(s.captureId)) || new Set(plan.states.map(s => s.captureId)).size !== captures.size || plan.states.length !== captures.size) throw new Error('Every scoped capture needs exactly one named state and an existing initial state');
  for (const state of plan.states) jsonData(state.fixtureJson);
  const ids = new Set(evidence.observations.map(o => o.id));
  if (plan.journeys.length > 100 || plan.journeys.reduce((n, j) => n + j.steps.length, 0) > 300 || new Set(plan.journeys.map(j => j.id)).size !== plan.journeys.length) throw new Error('Use unique bounded journeys');
  for (const journey of plan.journeys) {
    if (!safeId(journey.id) || !states.has(journey.from) || !journey.steps.length || !journey.evidenceIds.length || journey.evidenceIds.some(id => !ids.has(id)) || journey.basis === 'observed' && !journey.evidenceIds.some(id => ids.has(id))) throw new Error('Journeys require actual captured observation references');
    for (const step of journey.steps) {
      if (!states.has(step.expectedState) || ['click', 'fill', 'select'].includes(step.action) && !safeId(step.control) || step.control && !safeId(step.control) || step.expectedVisibleControl && !safeId(step.expectedVisibleControl) || step.expectedHiddenControl && !safeId(step.expectedHiddenControl) || step.value.length > 1000 || step.expectedText.length > 1000) throw new Error('Invalid journey control, assertion or destination');
      if (step.action === 'wait' && (!/^\d+$/.test(step.value) || Number(step.value) > 3000)) throw new Error('Wait steps are bounded to 3000 ms');
      if (step.action === 'scroll' && (!/^-?\d+$/.test(step.value) || Math.abs(Number(step.value)) > 10000)) throw new Error('Scroll steps require bounded pixel offsets');
    }
  }
  if (plan.boundaries.some(b => !states.has(b.stateId) || !safeId(b.control) || !b.reason.trim())) throw new Error('Every uncaptured destination needs a scoped, explained boundary');
  if (plan.crops.length > 30 || new Set(plan.crops.map(c => c.id)).size !== plan.crops.length) throw new Error('Too many or duplicate artwork crops');
  for (const crop of plan.crops) {
    const capture = evidence.captures.find(c => c.id === crop.captureId);
    if (!safeId(crop.id) || !capture || !crop.purpose.trim() || ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > capture.width || crop.y + crop.height > capture.height || crop.width * crop.height > capture.width * capture.height * .6 || evidence.assets.some(a => a.id === crop.id)) throw new Error('Artwork crop must be a bounded subregion, never a complete screen');
  }
}
export async function prepareCrops(plan: Plan, evidence: Evidence, directory: string): Promise<Asset[]> {
  await mkdir(directory, { recursive: true });
  const result: Asset[] = [];
  for (const crop of plan.crops) {
    const capture = evidence.captures.find(c => c.id === crop.captureId)!;
    const bytes = await sharp(await readFile(capture.file)).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer();
    const file = join(directory, crop.id + '.png'); await writeFile(file, bytes, { mode: 0o600 });
    result.push({ id: crop.id, file, sha256: sha(bytes), mime: 'image/png', bytes: bytes.length, origin: `${crop.captureId}:${crop.x},${crop.y},${crop.width},${crop.height}; ${crop.purpose}` });
  }
  return result;
}
const script = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
export function previewBridge(plan: Plan) {
  return `(() => {
    const plan=${script(plan)},initial=structuredClone(northstarProduct.data);
    let state=plan.initialState;
    const roots=()=>[...document.querySelectorAll('[data-ns-state]')];
    const show=(id)=>{if(!plan.states.some(s=>s.id===id))throw Error('Uncaptured destination');const found=roots().filter(e=>e.dataset.nsState===id);if(found.length!==1)throw Error('Missing or duplicate native state');roots().forEach(e=>e.hidden=e!==found[0]);state=id;window.dispatchEvent(new CustomEvent('northstar:state',{detail:{stateId:id}}));parent.postMessage({protocol:'northstar-generated-preview',stateId:id},'*')};
    const checkpoint=(id)=>{const entry=plan.states.find(s=>s.id===id);if(!entry)throw Error('Unknown checkpoint');for(const key of Object.keys(northstarProduct.data))delete northstarProduct.data[key];Object.assign(northstarProduct.data,structuredClone(initial),JSON.parse(entry.fixtureJson));document.querySelectorAll('form').forEach(f=>f.reset());show(id);window.dispatchEvent(new CustomEvent('northstar:checkpoint',{detail:{stateId:id}}));scrollTo(0,0)};
    Object.defineProperty(window,'nsPreview',{value:Object.freeze({show,get stateId(){return state},get data(){return northstarProduct.data},checkpoint}),writable:false,configurable:false});
    document.addEventListener('click',event=>{const control=event.target.closest?.('[data-ns-control]');const boundary=control&&plan.boundaries.find(b=>b.stateId===state&&b.control===control.dataset.nsControl);if(boundary){event.preventDefault();event.stopImmediatePropagation();parent.postMessage({protocol:'northstar-generated-preview',boundary:boundary.reason},'*')}},true);
    window.addEventListener('message',event=>{if(event.source!==parent||event.data?.protocol!=='northstar-generated-preview-control')return;if(event.data.stateId)checkpoint(event.data.stateId)});
    addEventListener('DOMContentLoaded',()=>show(plan.initialState),{once:true});
  })();`;
}
export function makeArtifact(implementation: Implementation, plan: Plan, evidence: Evidence, assets: Asset[]) {
  validateShape(IMPLEMENTATION_SCHEMA, implementation); jsonData(implementation.initialDataJson);
  if (implementation.assetIds.length > 100 || new Set(implementation.assetIds).size !== implementation.assetIds.length || implementation.assetIds.some(id => !assets.some(a => a.id === id))) throw new Error('Implementation refers to an unknown retained asset');
  if (/data:(?:image|font)|blob:|https?:|<canvas\b/i.test(implementation.html + implementation.css + implementation.javascript)) throw new Error('Use retained asset tokens and native UI; embedded screenshots, remote resources and canvas-rendered interfaces are not permitted');
  const screen = validateCanvasV2Screen({ version: 1, title: plan.title, ...evidence.viewport, html: implementation.html, css: implementation.css, javascript: previewBridge(plan) + '\n' + implementation.javascript, mockData: jsonData(implementation.initialDataJson), referenceAssetIds: implementation.assetIds, referenceIntent: 'faithful' });
  return { version: 1, evidenceFingerprint: evidence.fingerprint, scope: plan.scope, limitations: [...evidence.limitations, ...plan.limitations], screen, plan };
}
export async function runtimeDocument(artifact: ReturnType<typeof makeArtifact>, assets: Asset[], token = 'northstar-generated-simulation') {
  const bytes = new Map<string, string>();
  for (const id of artifact.screen.referenceAssetIds) {
    const asset = assets.find(a => a.id === id)!; const buffer = await readFile(asset.file);
    if (sha(buffer) !== asset.sha256) throw new Error('Retained asset bytes changed');
    bytes.set(id, `data:${asset.mime};base64,${buffer.toString('base64')}`);
  }
  const document = buildCanvasV2ScreenRuntime(artifact.screen, bytes, token);
  // tsx preserves function names using this esbuild helper inside function
  // bodies. Shared runtime helpers are serialized with toString(); provide the
  // same inert naming operation in the nonce-protected bootstrap when running
  // outside Next's compiler. This is trusted host code, never model input.
  return document.replace(/(<script nonce="[a-zA-Z0-9-]+">)/, '$1function __name(target,value){Object.defineProperty(target,"name",{value,configurable:true});return target;}');
}
export function viewerDocument(appDocument: string, plan: Plan, viewport: { width: number; height: number }, verified = false) {
  // This outer shell never grants the generated program same-origin access.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Captured app preview</title><style>body{margin:0;background:#11111b;color:#e8e4f5;font:14px system-ui}main{display:grid;grid-template-columns:1fr auto 1fr;gap:40px;align-items:center;min-height:100vh;padding:32px;box-sizing:border-box}h1{font-size:32px;letter-spacing:-1px}p{color:#bcb6ce;line-height:1.6}nav{max-width:260px}button{display:block;padding:12px 16px;margin:6px 0;border:1px solid #ffffff20;border-radius:12px;background:#ffffff09;color:inherit;text-align:left;cursor:pointer}#phone{overflow:hidden;border:3px solid #383244;border-radius:30px;background:#000}iframe{display:block;border:0}#boundary{min-height:40px;color:#bcb6ce}small{color:#ac9ed1}@media(max-width:900px){main{display:flex;flex-direction:column;align-items:center}header,nav{max-width:400px;width:100%}}</style></head><body><main><header><small>${verified ? 'Verified captured scope' : 'Draft · not yet verified'}</small><h1 id="title"></h1><p id="scope"></p><p id="limits"></p></header><div id="phone"></div><nav aria-label="Captured app states"><div id="states"></div><button id="reset">Restart preview</button><p id="boundary" role="status"></p></nav></main><script>
  const doc=${script(appDocument)},plan=${script(plan)},phone=document.getElementById('phone');let frame;
  document.getElementById('title').textContent=plan.title;document.getElementById('scope').textContent=plan.scope;document.getElementById('limits').textContent=plan.limitations.join(' ');
  function size(){const scale=Math.min(1,(innerWidth-48)/${viewport.width});phone.style.width=(${viewport.width}*scale)+'px';phone.style.height=(${viewport.height}*scale)+'px';frame.style.width='${viewport.width}px';frame.style.height='${viewport.height}px';frame.style.transform='scale('+scale+')';frame.style.transformOrigin='top left';}
  function mount(){if(frame)frame.remove();frame=document.createElement('iframe');frame.title=plan.title+' functional preview';frame.setAttribute('sandbox','allow-scripts');frame.srcdoc=doc;phone.append(frame);document.getElementById('boundary').textContent='';size();}addEventListener('resize',size);
  for(const state of plan.states){const button=document.createElement('button');button.textContent=state.label;button.onclick=()=>frame.contentWindow.postMessage({protocol:'northstar-generated-preview-control',stateId:state.id},'*');document.getElementById('states').append(button)}
  document.getElementById('reset').onclick=mount;window.addEventListener('message',event=>{if(event.source===frame?.contentWindow&&event.data?.protocol==='northstar-generated-preview'&&typeof event.data.boundary==='string')document.getElementById('boundary').textContent=event.data.boundary});mount();
  </script></body></html>`;
}
