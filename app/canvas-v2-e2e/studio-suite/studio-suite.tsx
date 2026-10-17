'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CanvasV2InteractiveScreenObject,
  captureCanvasV2ScreenMotion,
  CanvasV2ScreenAssets,
  testCanvasV2ScreenJourney,
} from '@/components/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';

type SuiteStatus = 'pass' | 'fail' | 'unverified';
type Receipt = { id: string; title: string; status: SuiteStatus; detail: string; evidence?: Record<string, unknown>; image?: string; images?: string[] };
type AnyRecord = Record<string, any>;

const htmlShell = (body: string) => body;
const sharedCss = `*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,Arial,sans-serif;background:#f6f3ed;color:#1b1a20}button,input{font:inherit}button{cursor:pointer;border:1px solid #39333c;border-radius:10px;padding:10px 14px;background:#fff7ed;color:#1b1a20}main{min-height:100%;padding:20px}h1{font-size:28px;margin:0 0 12px}h2{font-size:19px;margin:18px 0 8px}.card{background:#fff;border:1px solid #ded7cb;border-radius:16px;padding:16px}.muted{color:#6d6570}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.stack{display:grid;gap:12px}`;

function screen(id: string, width: number, html: string, css: string, javascript: string, referenceAssetIds: string[] = []): CanvasV2InteractiveScreen {
  return { version: 1, device: 'none', title: id, width, height: 760, html: htmlShell(html), css: `${sharedCss}${css}`, javascript, referenceAssetIds };
}

const mediaScreen = screen('studio-media', 420, `<main class="stack"><header><p class="muted">Deterministic media fixture</p><h1>Media lab</h1></header><section class="card"><h2>Motion image placeholder</h2><img id="gif-asset" alt="Retained motion placeholder" width="220" height="124" src="northstar-asset:studio-motion-gif"><p id="gif-state" class="muted">Image retained; animation is not inferred from load alone.</p></section><section class="card"><h2>Native video</h2><video id="demo-video" aria-label="Retained demo video" controls preload="auto" width="340" height="190"><source src="northstar-asset:studio-demo-video" type="video/mp4"></video><div class="stack"><button id="play-video" type="button">Play video</button><button id="pause-video" type="button">Pause video</button><output id="video-state" aria-live="polite">Ready</output></div></section></main>`, `.card{margin-bottom:12px}video,img{display:block;max-width:100%;object-fit:cover}output{min-height:22px;font-weight:700}`, `const video=document.querySelector('#demo-video'),out=document.querySelector('#video-state');video.addEventListener('timeupdate',()=>{out.textContent='Playing '+video.currentTime.toFixed(2)+'s'});document.querySelector('#play-video').addEventListener('click',()=>{video.play().then(()=>{out.textContent='Playing'}).catch(()=>{out.textContent='Play unavailable'})});document.querySelector('#pause-video').addEventListener('click',()=>{video.pause();out.textContent='Paused at '+video.currentTime.toFixed(2)+'s'});`, ['studio-motion-gif', 'studio-demo-video']);

const transitionScreen = screen('studio-transition', 420, `<main class="stack"><h1>Rapid transition</h1><button id="open-panel" type="button">Open panel</button><section id="panel" class="card panel" aria-hidden="true" aria-live="polite"><h2>Details panel</h2><p>Stable end state is observable after rapid reversal.</p><button id="close-panel" type="button">Close panel</button></section><p id="transition-state" class="muted">Closed</p></main>`, `.panel{max-height:0;opacity:0;overflow:hidden;transform:translateY(-8px);visibility:hidden;pointer-events:none;transition:max-height 160ms ease,opacity 160ms ease,transform 160ms ease}.panel[aria-hidden="false"]{max-height:240px;opacity:1;transform:translateY(0);visibility:visible;pointer-events:auto}@media(prefers-reduced-motion:reduce){.panel{transition-duration:0ms}}`, `const panel=document.querySelector('#panel'),state=document.querySelector('#transition-state');let closeTimer;document.querySelector('#open-panel').addEventListener('click',()=>{clearTimeout(closeTimer);panel.setAttribute('aria-hidden','false');state.textContent='Open'});document.querySelector('#close-panel').addEventListener('click',()=>{panel.setAttribute('aria-hidden','true');const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;state.textContent=reduced?'Closed':'Closing';clearTimeout(closeTimer);if(!reduced)closeTimer=setTimeout(()=>{state.textContent='Closed'},160)});`);

const animationScreen = screen('studio-scripted-motion', 420, `<main class="stack"><h1>Scripted motion</h1><button id="start-svg" type="button">Start SVG animation</button><svg id="motion-svg" viewBox="0 0 360 120" role="img" aria-label="Animated orbit"><rect width="360" height="120" rx="16" fill="#ded7cb"></rect><circle id="orbit-dot" cx="30" cy="60" r="16" fill="#6f4bf2"></circle></svg><canvas id="motion-canvas" width="360" height="80" aria-label="Animated canvas trace"></canvas><output id="frame-count">Frames 0</output></main>`, `svg{width:100%;height:auto}.card{background:#fff}canvas{width:100%;height:80px;background:#24202a;border-radius:12px}`, `const dot=document.querySelector('#orbit-dot'),canvas=document.querySelector('#motion-canvas'),ctx=canvas.getContext('2d'),out=document.querySelector('#frame-count');let timer=0,frame=0;function draw(){frame++;const x=30+(frame%30)*10;dot.setAttribute('cx',String(x));ctx.fillStyle='#24202a';ctx.fillRect(0,0,360,80);ctx.fillStyle='#8fe3bd';ctx.fillRect((frame*7)%360,24,12,32);out.textContent='Frames '+frame}document.querySelector('#start-svg').addEventListener('click',()=>{if(timer)return;draw();timer=setInterval(draw,50)});`);

const keyboardScreen = {...screen('studio-keyboard-fixture', 420, `<main class="stack"><h1>Arrow-key score game</h1><p>Click the board, then use Arrow keys.</p><div id="board" tabindex="0" role="application" aria-label="Arrow key score game"><span id="player" aria-hidden="true">●</span></div><output id="keyboard-status" data-testid="keyboard-status" aria-live="polite">Score 0; position 1,1</output><button id="restart-game" type="button">Restart game</button></main>`, `#board{position:relative;width:260px;height:170px;border-radius:14px;background:repeating-linear-gradient(90deg,#ede7dc 0 20%,#ded6ca 20% 21%),repeating-linear-gradient(0deg,transparent 0 20%,rgba(40,30,20,.1) 20% 21%)}#player{position:absolute;left:28%;top:28%;font-size:34px;color:#6f4bf2;transition:left 80ms,top 80ms}`, `const board=document.querySelector('#board'),player=document.querySelector('#player'),status=document.querySelector('#keyboard-status');let score=0,x=1,y=1;function render(){player.style.left=(x*20+8)+'%';player.style.top=(y*20+8)+'%';status.textContent='Score '+score+'; position '+x+','+y}board.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();score++;x=Math.max(0,Math.min(4,x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));y=Math.max(0,Math.min(4,y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));render()});document.querySelector('#restart-game').addEventListener('click',()=>{score=0;x=1;y=1;render()});`),height:420};

const dragScreen = {...screen('studio-drag-fixture', 420, `<main class="stack"><h1>Native drag target</h1><p>Drag the token into the target.</p><div class="drag-row"><div id="drag-token" data-testid="drag-token" draggable="true" aria-label="Drag token">TOKEN</div><div id="drop-target" data-testid="drop-target" aria-label="Drop target">Drop target</div></div><output id="drag-status" data-testid="drag-status" aria-live="polite">Drop state: waiting</output><button id="reset-drop" type="button">Reset drop</button></main>`, `.drag-row{display:flex;align-items:center;gap:24px}.drag-row>div{min-height:70px;display:grid;place-items:center;padding:14px;border-radius:12px}.drag-row #drag-token{border:2px solid #6f4bf2;cursor:grab;font-weight:700}.drag-row #drop-target{min-width:160px;border:2px dashed #6d6570;background:#fff}`, `const token=document.querySelector('#drag-token'),target=document.querySelector('#drop-target'),status=document.querySelector('#drag-status');token.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain','studio-token')});target.addEventListener('dragover',event=>event.preventDefault());target.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.getData('text/plain')==='studio-token'){target.textContent='Token dropped';target.style.background='#bdebd0';status.textContent='Drop state: complete'}});document.querySelector('#reset-drop').addEventListener('click',()=>{target.textContent='Drop target';target.style.background='#fff';status.textContent='Drop state: waiting'});`),height:420};

function responsive(width: number) {
  return screen('studio-responsive-'+width, width, `<main class="stack"><header><p class="muted">One source, responsive viewport ${width}px</p><h1>Responsive studio</h1></header><section class="responsive-grid"><article class="card"><h2>Primary workspace</h2><p>Cards reflow without clipping or horizontal overflow.</p><button id="responsive-action" type="button">Complete action</button><output id="responsive-state">Ready</output></article><aside class="card"><h2>Secondary detail</h2><p>Readable at narrow and wide widths.</p></aside></section></main>`, `.responsive-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.responsive-grid .card{min-width:0}@media(max-width:600px){main{padding:14px}.responsive-grid{grid-template-columns:1fr}h1{font-size:24px}}`, `document.querySelector('#responsive-action').addEventListener('click',()=>{document.querySelector('#responsive-state').textContent='Action complete'});`);
}

const searchScreen = screen('studio-search', 420, `<main class="stack"><h1>Workshop search</h1><label for="search">Search workshops</label><input id="search" type="search" placeholder="Try dye"><button id="retry" type="button">Retry list</button><p id="empty" hidden>No workshops found</p><ul id="results"><li>Sunday clay club</li><li>Botanical dye lab</li></ul></main>`, `ul{padding-left:22px}#empty{padding:16px;border:1px dashed #6f4bf2;border-radius:12px}input{padding:11px;border:1px solid #aaa;border-radius:10px}`, `const input=document.querySelector('#search'),list=document.querySelector('#results'),empty=document.querySelector('#empty');function render(){const q=input.value.toLowerCase();[...list.children].forEach(item=>{item.hidden=!!q&&!item.textContent.toLowerCase().includes(q)});const any=[...list.children].some(item=>!item.hidden);empty.hidden=any}input.addEventListener('input',render);document.querySelector('#retry').addEventListener('click',()=>{input.value='';render()});`);

const saveCancelScreen = screen('studio-save-cancel', 420, `<main class="stack"><h1>Save and cancel</h1><p id="saved-value">Draft: Original note</p><button id="edit" type="button">Edit note</button><section id="editor" class="card" hidden><label for="note">Note</label><input id="note" value="Original note"><div><button id="cancel" type="button">Cancel</button><button id="save" type="button">Save</button></div></section></main>`, `#editor[hidden]{display:none}#editor div{display:flex;gap:8px;margin-top:12px}`, `const editor=document.querySelector('#editor'),note=document.querySelector('#note'),saved=document.querySelector('#saved-value');document.querySelector('#edit').addEventListener('click',()=>{editor.hidden=false;note.focus()});document.querySelector('#cancel').addEventListener('click',()=>{editor.hidden=true;note.value=saved.textContent.replace('Draft: ','')});document.querySelector('#save').addEventListener('click',()=>{saved.textContent='Draft: '+note.value;editor.hidden=true});`);

const scrollScreen = screen('studio-scroll', 420, `<main><header id="top"><h1>Scrollable catalogue</h1></header><section id="feed" aria-label="Catalogue list"><div class="stack">${Array.from({length: 9}, (_, i) => `<article class="card"><h2>Workshop ${i + 1}</h2><p>Long-form catalogue content for scroll verification.</p></article>`).join('')}<article id="end-card" class="card"><h2>End of feed</h2><p>The last control is reachable at the actual end.</p><button id="end-action" type="button">End action</button></article></div></section><nav id="bottom-nav" aria-label="Primary navigation"><a href="#top">Top</a><a href="#end-card">End</a></nav></main>`, `#feed{height:520px;overflow:auto;padding:14px 8px 80px}#bottom-nav{position:sticky;bottom:0;display:flex;justify-content:space-around;padding:12px;background:#24202a;color:#fff}#bottom-nav a{color:#fff}`, `document.querySelector('#end-action').addEventListener('click',()=>{document.querySelector('#end-action').textContent='End action complete'});`);

const noOpScreen = screen('studio-negative-noop', 420, `<main><h1>No-op negative fixture</h1><button id="noop" type="button">No-op</button><p id="no-op-state">Unchanged</p></main>`, '', `document.querySelector('#noop').addEventListener('click',()=>{});`);
const obscuredScreen = screen('studio-negative-obscured', 420, `<main><h1>Obscured control negative fixture</h1><button id="blocked" type="button">Blocked control</button><p id="blocked-state">Blocked</p><div id="cover" aria-hidden="true"></div></main>`, `#blocked{position:relative;z-index:1}#cover{position:fixed;inset:0;background:rgba(36,32,42,.04);z-index:5}`, `document.querySelector('#blocked').addEventListener('click',()=>{document.querySelector('#blocked-state').textContent='Should not be reached'});`);
const brokenMediaScreen = screen('studio-negative-broken-media', 420, `<main><h1>Broken media negative fixture</h1><img id="missing-media" alt="Missing retained image" src="northstar-asset:studio-missing-media"></main>`, '', '', ['studio-missing-media']);

function objectState(value: unknown): AnyRecord { return value && typeof value === 'object' ? value as AnyRecord : {}; }
function compactState(state: unknown): Record<string, unknown> {
  const s = objectState(state), journey = objectState(s.journey), layout = objectState(s.viewportLayout), overflow = objectState(s.overflow);
  const failedStep = Array.isArray(journey.steps) ? journey.steps.find((step: AnyRecord) => step?.passed === false) : undefined;
  return {
    passed: journey.passed,
    requestedStepCount: journey.requestedStepCount,
    completedStepCount: Array.isArray(journey.steps) ? journey.steps.length : undefined,
    failedStep: failedStep ? {step: failedStep.step, action: failedStep.action, selector: failedStep.selector, expectedText: failedStep.expectedText, expectedValue: failedStep.expectedValue, failure: failedStep.failure, actualValue: failedStep.actualValue, text: typeof failedStep.text === 'string' ? failedStep.text.slice(0, 500) : undefined, visibleTarget: failedStep.visibleTarget, errors: failedStep.errors} : undefined,
    errors: Array.isArray(s.errors) ? s.errors.slice(-3) : [],
    horizontalOverflow: overflow.horizontal,
    scroll: s.scroll,
    navigationClearance: Array.isArray(s.navigationClearance) ? s.navigationClearance.slice(-3) : undefined,
    viewport: { width: layout.width, height: layout.height, containers: Array.isArray(layout.containers) ? layout.containers.slice(0, 4).map((row: AnyRecord) => ({selector: row.selector, contentRect: row.contentRect})) : undefined },
    media: { images: Array.isArray(s.images) ? s.images.slice(0, 5) : [], videos: Array.isArray(s.videos) ? s.videos.slice(0, 3) : [] },
    motion: { authoredRendering: s.motion?.authoredRendering, samples: Array.isArray(s.samples) ? s.samples.length : undefined },
  };
}

export default function StudioSuite({ assets }: { assets: readonly CanvasV2EvidenceAsset[] }) {
  const screens = useMemo(() => [mediaScreen, transitionScreen, animationScreen, responsive(320), responsive(768), responsive(1280), searchScreen, saveCancelScreen, scrollScreen, noOpScreen, obscuredScreen, brokenMediaScreen, keyboardScreen, dragScreen], []);
  const encoded = useMemo(() => new Map(screens.map(item => [item.title, encodeCanvasV2Screen(item)])), [screens]);
  const [running, setRunning] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    let cancelled = false;
    const runController = new AbortController();
    const timeout = window.setTimeout(() => { runController.abort(new Error('Studio suite run exceeded its bounded time budget.')); if (!cancelled) { setReceipts(value => [...value, {id:'suite-timeout',title:'Bounded suite completion',status:'fail',detail:'Suite exceeded 30 seconds; incomplete cases are not passes.'}]); setRunning(false); } }, 30000);
    const run = async () => {
      setRunning(true); setReceipts([]);
      const signal = runController.signal;
      const next: Receipt[] = [];
      const add = (receipt: Receipt) => { if (!cancelled && !signal.aborted) { next.push(receipt); setReceipts([...next]); } };
      const journey = async (id: string, title: string, steps: unknown, expected = true, motionPreference: 'reduce' | 'no-preference' = 'no-preference', receiptId = id, expectedFailure: 'journey' | 'exception' = 'journey') => {
        try {
          const result = await testCanvasV2ScreenJourney(id, encoded.get(id)!, assets, steps, motionPreference, signal);
          const state = objectState(result.state), trace = objectState(state.journey), passed = trace.passed === true;
          const failed = Array.isArray(trace.steps) ? trace.steps.find((step: AnyRecord) => step.passed === false) : undefined;
          const negativeObserved = id === 'studio-negative-noop' ? failed?.selector === '#noop' && failed?.expectedText === 'Changed' && String(failed?.text).includes('Unchanged') && !failed?.failure : id === 'studio-negative-obscured' ? failed?.selector === '#blocked' && String(failed?.failure).includes('not reachable') : false;
          const accepted = expected ? passed : !passed && negativeObserved && !state.errors?.length;
          add({id: receiptId, title, status: accepted ? 'pass' : 'fail', detail: `${passed ? 'journey passed' : 'journey failed'}; expectation=${expected ? 'pass' : 'detect failure'}`, evidence: compactState(result.state), image: result.image});
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const structuredExpectedFailure = !expected && expectedFailure === 'exception' && message.includes('retained product asset is unavailable');
          add({id: receiptId, title, status: structuredExpectedFailure ? 'pass' : 'fail', detail: `${structuredExpectedFailure ? 'expected retained-asset exception' : 'unexpected runtime error'}: ${message}`, evidence: {error: message, expectedFailure, structuredExpectedFailure}});
          return undefined;
        }
      };
      const mediaResult = await journey('studio-media', 'GIF placeholder + native video play/pause', [{action:'click',selector:'#play-video',delayMs:420,expectedText:'Playing'},{action:'click',selector:'#pause-video',expectedText:'Paused'}]);
      if (mediaResult) {
        const video = objectState(mediaResult.state).videos?.[0] as AnyRecord | undefined;
        const playbackAdvanced = Boolean(video?.loaded && video?.paused && Number(video?.time) > 0);
        const mediaReceipt = next[next.length - 1];
        if (mediaReceipt) {
          mediaReceipt.status = playbackAdvanced && mediaReceipt.status === 'pass' ? 'pass' : 'fail';
          mediaReceipt.detail = playbackAdvanced ? `native video loaded, advanced to ${Number(video?.time).toFixed(2)}s, then paused` : 'journey text passed but native video evidence did not prove loaded playback time advanced';
          mediaReceipt.evidence = {...(mediaReceipt.evidence ?? {}), playbackAdvanced, finalVideo: video};
        }
      }
      await journey('studio-transition', 'Interrupted open/close/open then settled close', [{action:'click',selector:'#open-panel',expectedVisibleSelector:'#panel',delayMs:20},{action:'click',selector:'#close-panel',delayMs:20},{action:'click',selector:'#open-panel',expectedVisibleSelector:'#panel',delayMs:20},{action:'wait',delayMs:180,expectedText:'Open'},{action:'click',selector:'#close-panel',delayMs:20},{action:'wait',delayMs:180,expectedHiddenSelector:'#panel',expectedText:'Closed'}]);
      await journey('studio-transition', 'Rapid reversal under reduced motion', [{action:'click',selector:'#open-panel',expectedVisibleSelector:'#panel',delayMs:0},{action:'click',selector:'#close-panel',expectedHiddenSelector:'#panel',delayMs:0},{action:'wait',delayMs:40,expectedHiddenSelector:'#panel',expectedText:'Closed'}], true, 'reduce', 'studio-transition-reduced');
      try {
        await new Promise(resolve => setTimeout(resolve, 260));
        const frames = await captureCanvasV2ScreenMotion('studio-scripted-motion', encoded.get('studio-scripted-motion')!, signal, '#start-svg', [0, 120, 260]);
        const states = frames.map(frame => objectState(frame.state));
        const elapsed = states.map(state => Number(objectState(state.motionSample).actualElapsedMs));
        const frameTexts = states.map(state => String(state.text ?? '')).filter(Boolean);
        const elapsedAdvanced = elapsed.length >= 2 && elapsed.every((value, index) => index === 0 || Number.isFinite(value) && value > elapsed[index - 1]);
        const domStateChanged = new Set(frameTexts).size > 1;
        const authored = objectState(objectState(states[0]).motion).authoredRendering;
        const imageChanged = frames.some((frame, index) => index > 0 && frame.image !== frames[0].image);
        const motionPass = frames.length >= 2 && elapsedAdvanced && domStateChanged && imageChanged && Boolean(objectState(authored).svg && objectState(authored).canvas);
        add({id:'studio-scripted-motion',title:'SVG/canvas elapsed-time motion samples',status:motionPass ? 'pass' : 'fail',detail:`captured ${frames.length} samples; elapsedAdvanced=${elapsedAdvanced}; DOM state changed=${domStateChanged}; image changed=${imageChanged}`,evidence:{sampleCount:frames.length,elapsed,frameTexts,authoredRendering:authored,imageChanged,method:'live elapsed-time DOM/canvas samples'},images:frames.slice(0,3).map(frame => frame.image)});
      } catch (error) { add({id:'studio-scripted-motion',title:'SVG/canvas elapsed-time motion samples',status:'fail',detail:String(error)}); }
      const responsiveReceipts: Record<string, unknown>[] = [];
      for (const width of [320, 768, 1280]) {
        const id = `studio-responsive-${width}`;
        const result = await journey(id, `Responsive source at ${width}px`, [{action:'click',selector:'#responsive-action',expectedText:'Action complete'}]);
        if (result) {
          const state = compactState(result.state);
          responsiveReceipts.push({width, state});
          const receipt = next[next.length - 1];
          if (receipt && state.horizontalOverflow !== false) { receipt.status = 'fail'; receipt.detail = `responsive journey completed but observed horizontalOverflow=${String(state.horizontalOverflow)}`; }
        }
      }
      if (next.length) next.push({id:'responsive-summary',title:'Responsive widths summary',status:responsiveReceipts.length === 3 && responsiveReceipts.every(item => objectState(item.state).horizontalOverflow === false) ? 'pass' : 'fail',detail:'Same authored source exercised at all three required widths with explicit observed overflow=false.',evidence:{requiredWidths:[320,768,1280],observedWidths:responsiveReceipts.map(item => ({width:item.width,horizontalOverflow:objectState(item.state).horizontalOverflow}))}});
      await journey('studio-search', 'Search, empty state, retry, filtered result', [{action:'fill',selector:'#search',value:'zzzz',expectedText:'No workshops found'},{action:'click',selector:'#retry',expectedText:'Sunday clay club'},{action:'fill',selector:'#search',value:'dye',expectedText:'Botanical dye lab'}]);
      await journey('studio-save-cancel', 'Repeated edit save/cancel flow', [{action:'click',selector:'#edit',expectedVisibleSelector:'#editor'},{action:'wait',selector:'#note',expectedValue:'Original note'},{action:'fill',selector:'#note',value:'Cancelled draft'},{action:'click',selector:'#cancel',expectedHiddenSelector:'#editor'},{action:'click',selector:'#edit',expectedVisibleSelector:'#editor'},{action:'wait',selector:'#note',expectedValue:'Original note'},{action:'fill',selector:'#note',value:'Saved draft'},{action:'click',selector:'#save',expectedText:'Saved draft',expectedHiddenSelector:'#editor'},{action:'click',selector:'#edit',expectedVisibleSelector:'#editor'},{action:'wait',selector:'#note',expectedValue:'Saved draft'},{action:'fill',selector:'#note',value:'Cancelled again'},{action:'click',selector:'#cancel',expectedHiddenSelector:'#editor'},{action:'click',selector:'#edit',expectedVisibleSelector:'#editor'},{action:'wait',selector:'#note',expectedValue:'Saved draft'}]);
      await journey('studio-scroll', 'Actual scroll region and end navigation clearance', [{action:'scroll',selector:'#feed',y:10000,delayMs:30,expectedVisibleSelector:'#end-card',expectedText:'End of feed'},{action:'click',selector:'#end-action',expectedVisibleSelector:'#end-action',expectedText:'End action complete'}]);
      await journey('studio-negative-noop', 'Negative: no-op control is detected', [{action:'click',selector:'#noop',expectedText:'Changed'}], false);
      await journey('studio-negative-obscured', 'Negative: overlay-obscured control is detected', [{action:'click',selector:'#blocked',expectedText:'Should not be reached'}], false);
      await journey('studio-negative-broken-media', 'Negative: missing retained media is rejected', [{action:'wait',delayMs:0}], false, 'no-preference', 'studio-negative-broken-media', 'exception');
      if (!cancelled && !signal.aborted) { setReceipts(next); setRunning(false); window.clearTimeout(timeout); }
    };
    void run(); return () => { cancelled = true; runController.abort(new Error('Studio suite run was cancelled.')); window.clearTimeout(timeout); };
  }, [assets, encoded]);

  const passCount = receipts.filter(receipt => receipt.status === 'pass').length;
  const testScreens = screens.filter(item => item.title !== 'studio-negative-broken-media' && item.title !== mediaScreen.title && item.title !== keyboardScreen.title && item.title !== dragScreen.title);
  const receiptJson = JSON.stringify(receipts, null, 2);
  return <CanvasV2ScreenAssets.Provider value={assets}><main style={{minHeight:'100vh',background:'#f4f0e9',color:'#1b1a20',padding:'28px clamp(16px,4vw,56px)',fontFamily:'Inter,Arial,sans-serif'}}>
    <div style={{maxWidth:1180,margin:'0 auto',display:'grid',gap:24}}>
      <header>
        <p style={{letterSpacing:'.08em',textTransform:'uppercase',fontSize:12}}>Dev-only · deterministic local runtime</p>
        <h1 style={{fontSize:36,margin:'4px 0 8px'}}>Northstar studio suite</h1>
        <p style={{maxWidth:760,lineHeight:1.55}}>Receipts below come from the saved screen source in the isolated runtime. They check behavior and retained media binding; they do not claim broad visual quality or prove GIF animation from an image load.</p>
        <p data-testid="studio-suite-status" role="status" style={{fontWeight:700}}>{running?'Running deterministic checks…':receipts.length?`${passCount}/${receipts.length} receipts passed`:'Checks not run'}</p>
        <details><summary>Receipt JSON export</summary><pre data-testid="studio-suite-receipt-json" style={{whiteSpace:'pre-wrap',fontSize:11,overflow:'auto',maxHeight:320}}>{receiptJson}</pre></details>
      </header>
      <section data-testid="studio-suite-receipts" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16}}>
        {receipts.map(receipt => <article key={receipt.id} data-testid={`receipt-${receipt.id}`} style={{background:'#fff',border:'1px solid #d9d1c5',borderRadius:18,padding:18}}>
          <h2 style={{fontSize:18,marginTop:0}}>{receipt.status.toUpperCase()} · {receipt.title}</h2>
          <p>{receipt.detail}</p>
          <details><summary>Compact evidence</summary><pre style={{whiteSpace:'pre-wrap',fontSize:11,overflow:'auto',maxHeight:260}}>{JSON.stringify(receipt.evidence,null,2)}</pre></details>
          {receipt.image && <img src={receipt.image} alt={`${receipt.title} rendered capture`} style={{display:'block',width:'100%',maxWidth:300,marginTop:12,borderRadius:10}} />}
          {receipt.images?.length ? <div style={{display:'flex',gap:8,overflow:'auto',marginTop:12}}>{receipt.images.map((image,index) => <img key={index} src={image} alt={`${receipt.title} sample ${index+1}`} style={{width:130,borderRadius:8}} />)}</div> : null}
        </article>)}
      </section>
      <section data-testid="manual-native-fixtures" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(420px,1fr))',gap:16}}>
        <article data-testid="media-fixture" style={{background:"#fff",border:"1px solid #d9d1c5",borderRadius:18,padding:20}}><h2>Live retained media</h2><p>Inspect actual GIF frames and use native video controls.</p><div data-testid="media-screen" style={{width:mediaScreen.width,height:mediaScreen.height}}><CanvasV2InteractiveScreenObject nodeId={mediaScreen.title} encoded={encoded.get(mediaScreen.title)!} showCaption={false}/></div></article><article data-testid="keyboard-fixture" style={{background:'#fff',border:'1px solid #d9d1c5',borderRadius:18,padding:20}}><h2>Manual native keyboard fixture</h2><p>Use a real click to focus the board, then press Arrow keys. The score must change inside the authored screen runtime.</p><div data-testid="keyboard-screen" style={{width:keyboardScreen.width,height:keyboardScreen.height}}><CanvasV2InteractiveScreenObject nodeId={keyboardScreen.title} encoded={encoded.get(keyboardScreen.title)!} showCaption={false}/></div></article>
        <article data-testid="drag-fixture" style={{background:'#fff',border:'1px solid #d9d1c5',borderRadius:18,padding:20}}><h2>Manual native drag fixture</h2><p>Drag the token into the target with a real pointer gesture. The drop state must change inside the authored screen runtime.</p><div data-testid="drag-screen" style={{width:dragScreen.width,height:dragScreen.height}}><CanvasV2InteractiveScreenObject nodeId={dragScreen.title} encoded={encoded.get(dragScreen.title)!} showCaption={false}/></div></article>
      </section>
      <div aria-hidden="true" style={{position:'absolute',left:-20000,top:0,pointerEvents:'none'}}>{testScreens.map(item => <div key={item.title} style={{width:item.width,height:item.height}}><CanvasV2InteractiveScreenObject nodeId={item.title} encoded={encoded.get(item.title)!} showCaption={false}/></div>)}</div>
      <p style={{fontSize:12,color:'#6d6570'}}>Keyboard and drag receipts require a real native gesture in the visible authored screen fixtures above. Synthetic clicks and scripted drags are intentionally excluded.</p>
    </div>
  </main></CanvasV2ScreenAssets.Provider>;
}
