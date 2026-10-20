import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { NORTHSTAR_THREE_HELPER_SOURCE, screenCanvasContributesPaint } from '../lib/canvas-v2/screen-trusted-runtime';
import { screenCanvasCaptureReplacement } from '../lib/canvas-v2/interactive-screen-runtime';

function trustedFixture(dimensions: { width: number; height: number; clientWidth: number; clientHeight: number }) {
  const draws: Array<{ width: number; height: number; scene: unknown; camera: unknown }> = [];
  const sizes: Array<{ width: number; height: number; updateStyle: unknown }> = [];
  class Canvas { hidden = false; dataset: Record<string, string> = {}; width = dimensions.width; height = dimensions.height; clientWidth = dimensions.clientWidth; clientHeight = dimensions.clientHeight; }
  class Renderer {
    ratio = 1.5; canvas: Canvas;
    constructor(options: { canvas: Canvas }) { this.canvas = options.canvas; }
    getPixelRatio() { return this.ratio; }
    setSize(width: number, height: number, updateStyle: unknown) { sizes.push({ width, height, updateStyle }); this.canvas.width = width * this.ratio; this.canvas.height = height * this.ratio; }
    render(scene: unknown, camera: unknown) { draws.push({ width: this.canvas.width, height: this.canvas.height, scene, camera }); }
    dispose() {}
  }
  const sandbox: Record<string, unknown> = { HTMLCanvasElement: Canvas, northstarThreeCore: { WebGLRenderer: Renderer }, northstarGLTFLoader: class {}, addEventListener: () => {}, setTimeout, clearTimeout, performance };
  sandbox.window = sandbox;
  vm.runInNewContext(NORTHSTAR_THREE_HELPER_SOURCE, sandbox);
  const api = sandbox.northstarThree as {
    createRenderer(canvas: Canvas): Renderer;
    setViewportActive(value: boolean): void;
    beginReviewDraw(): () => void;
    whenReady(timeout: number): Promise<{ ready: boolean }>;
    readiness(): { ready: boolean; viewportActive: boolean; reviewDraws: number; renderers: Array<{ paintAvailable?: boolean; drawingBuffer: { width: number; height: number } }> };
  };
  const canvas = new Canvas(), renderer = api.createRenderer(canvas);
  return { api, canvas, renderer, draws, sizes };
}

test('review repairs a zero-initialized Three backing buffer from actual positive layout and paints the existing scene', async () => {
  const { api, canvas, renderer, draws, sizes } = trustedFixture({ width: 0, height: 0, clientWidth: 1280, clientHeight: 900 });
  const scene = { id: 'original-live-scene' }; let projections = 0;
  const camera = { isPerspectiveCamera: true, aspect: NaN, updateProjectionMatrix() { projections++; } };
  api.setViewportActive(false); renderer.render(scene, camera);
  assert.equal(draws.length, 0); assert.equal(api.readiness().ready, false);
  const finish = api.beginReviewDraw();
  assert.deepEqual(sizes, [{ width: 1280, height: 900, updateStyle: false }]);
  assert.equal(canvas.width, 1920); assert.equal(canvas.height, 1350); assert.equal(renderer.ratio, 1.5);
  assert.equal(camera.aspect, 1280 / 900); assert.equal(projections, 1);
  assert.equal(draws.at(-1)?.scene, scene); assert.equal(draws.at(-1)?.camera, camera);
  assert.equal((await api.whenReady(20)).ready, true);
  finish(); finish();
  assert.equal(api.readiness().reviewDraws, 0); assert.equal(api.readiness().viewportActive, false);
  const previous = draws.length; renderer.render(scene, camera); assert.equal(draws.length, previous, 'Capture must restore offscreen presentation deferral.');
});

test('review preserves a valid authored buffer, custom camera aspect and pixel ratio', () => {
  const { api, renderer, sizes, canvas } = trustedFixture({ width: 600, height: 400, clientWidth: 1280, clientHeight: 900 });
  const camera = { isPerspectiveCamera: true, aspect: 1.9, updateProjectionMatrix() { throw Error('A valid authored camera must not be changed.'); } };
  api.setViewportActive(false); renderer.render({}, camera);
  const finish = api.beginReviewDraw(); finish();
  assert.deepEqual(sizes, []); assert.equal(canvas.width, 600); assert.equal(canvas.height, 400); assert.equal(camera.aspect, 1.9); assert.equal(renderer.ratio, 1.5);
});

test('zero backing and zero layout stays explicitly unavailable and cannot claim ready pixels', async () => {
  const { api, renderer, sizes } = trustedFixture({ width: 0, height: 0, clientWidth: 0, clientHeight: 0 });
  api.setViewportActive(false); renderer.render({}, { isPerspectiveCamera: true, aspect: 1.3 });
  const finish = api.beginReviewDraw();
  assert.deepEqual(sizes, []); assert.equal(api.readiness().ready, false); assert.equal(api.readiness().renderers[0].paintAvailable, false);
  assert.equal((await api.whenReady(0)).ready, false); finish();
});

test('readiness retries actual positive layout that becomes available after review begins', async () => {
  const { api, renderer, sizes, canvas } = trustedFixture({ width: 0, height: 0, clientWidth: 0, clientHeight: 0 });
  api.setViewportActive(false); renderer.render({}, { isPerspectiveCamera: true, aspect: NaN });
  const finish = api.beginReviewDraw(); canvas.clientWidth = 400; canvas.clientHeight = 300;
  assert.equal((await api.whenReady(20)).ready, true); assert.equal(sizes.length, 1); assert.equal(canvas.width, 600); finish();
});

function replacementFixture(pixels: string, width = 0, contributesPaint = true, authoredStyle = 'position:absolute;width:160px;height:90px;inset:0') {
  const style = new Map<string, string>(); const original = { width, height: 90, clientWidth: 160, clientHeight: 90, id: 'world', getAttribute: () => 'Authored scene', toDataURL: () => pixels };
  const createElement = (tag: string) => ({ tagName: tag.toUpperCase(), id: '', attributes: new Map<string, string>(), style: { setProperty: (key: string, value: string) => style.set(key, value) }, textContent: '', setAttribute(key: string, value: string) { this.attributes.set(key, value); } });
  const copy = { id: 'world', getAttribute: () => authoredStyle, ownerDocument: { createElement } };
  const result = screenCanvasCaptureReplacement(original as unknown as HTMLCanvasElement, copy as unknown as Element, contributesPaint);
  return { ...result, actual: result.replacement as unknown as ReturnType<typeof createElement>, original, style };
}

test('missing canvas pixels preserve geometry with an explicit unavailable label and metadata, never an empty IMG', () => {
  const { actual, missing, original } = replacementFixture('data:,');
  assert.equal(actual.tagName, 'DIV'); assert.equal(actual.attributes.has('src'), false); assert.equal(actual.textContent, 'Canvas frame unavailable');
  assert.equal(actual.attributes.get('style'), 'position:absolute;width:160px;height:90px;inset:0');
  assert.deepEqual(missing, { selector: '#world', kind: 'canvas', reason: 'zero-drawing-buffer', width: 0, height: 90, clientWidth: 160, clientHeight: 90 });
  assert.equal(original.width, 0, 'Capturing missing paint must not mutate the source canvas.');
});

test('a valid captured canvas keeps its exact pixels and reports no missing paint', () => {
  const pixels = 'data:image/png;base64,aGVsbG8='; const { actual, missing } = replacementFixture(pixels, 160);
  assert.equal(actual.tagName, 'IMG'); assert.equal(actual.attributes.get('src'), pixels); assert.equal(actual.id, 'world'); assert.equal(missing, undefined);
});


test('paint contribution excludes hidden ancestors, authored hidden styles, zero bounds and off-viewport preload canvases', () => {
  const styles = new Map<object, { display: string; visibility: string; opacity: string }>();
  const view = { innerWidth: 640, innerHeight: 480, getComputedStyle: (node: object) => styles.get(node) ?? { display: (node as {hidden?:boolean}).hidden ? 'none' : 'block', visibility: 'visible', opacity: '1' } };
  const ancestor = { hidden: false, parentElement: null };
  const bounds = { width: 160, height: 90, left: 0, top: 0, right: 160, bottom: 90 };
  const canvas = { hidden: false, parentElement: ancestor, ownerDocument: { defaultView: view }, getBoundingClientRect: () => bounds } as unknown as HTMLCanvasElement;
  assert.equal(screenCanvasContributesPaint(canvas), true);
  for (const style of [{ display: 'none', visibility: 'visible', opacity: '1' }, { display: 'block', visibility: 'hidden', opacity: '1' }, { display: 'block', visibility: 'collapse', opacity: '1' }, { display: 'block', visibility: 'visible', opacity: '0' }]) {
    styles.set(canvas, style); assert.equal(screenCanvasContributesPaint(canvas), false); styles.delete(canvas);
    styles.set(ancestor, style);
    if(style.visibility==='hidden'||style.visibility==='collapse'){
      styles.set(canvas,style); assert.equal(screenCanvasContributesPaint(canvas), false, 'Inherited hidden visibility must not contribute paint.');
      styles.set(canvas,{display:'block',visibility:'visible',opacity:'1'}); assert.equal(screenCanvasContributesPaint(canvas), true, 'An explicitly visible child can paint inside a visibility:hidden ancestor.');
      styles.delete(canvas);
    }else assert.equal(screenCanvasContributesPaint(canvas), false);
    styles.delete(ancestor);
  }
  ancestor.hidden = true; assert.equal(screenCanvasContributesPaint(canvas), false); ancestor.hidden = false;
  ancestor.hidden = true; styles.set(ancestor,{display:'block',visibility:'visible',opacity:'1'});
  assert.equal(screenCanvasContributesPaint(canvas),true,'Computed display:block overrides the raw hidden attribute.');
  ancestor.hidden=false; styles.delete(ancestor);
  canvas.hidden=true; styles.set(canvas,{display:'block',visibility:'visible',opacity:'1'});
  assert.equal(screenCanvasContributesPaint(canvas),true,'An authored CSS override may intentionally display a hidden canvas.');
  canvas.hidden=false; styles.delete(canvas);
  bounds.width = 0; assert.equal(screenCanvasContributesPaint(canvas), false); bounds.width = 160;
  bounds.left = 900; bounds.right = 1060; assert.equal(screenCanvasContributesPaint(canvas), false);
});

test('a hidden zero-buffer renderer is never resized to manufacture hidden paint', () => {
  const { api, renderer, canvas, sizes } = trustedFixture({ width: 0, height: 0, clientWidth: 1280, clientHeight: 900 });
  canvas.hidden = true; api.setViewportActive(false); renderer.render({}, { isPerspectiveCamera: true, aspect: NaN });
  const finish = api.beginReviewDraw(); finish(); assert.deepEqual(sizes, []); assert.equal(canvas.width, 0);
});

test('nonpainting zero-buffer captures preserve hidden or zero-layout CSS without missing-paint failures or visible labels', () => {
  for (const authoredStyle of ['display:none;width:160px;height:90px', 'visibility:hidden;width:160px;height:90px', 'width:0px;height:0px']) {
    const { actual, missing, style } = replacementFixture('data:,', 0, false, authoredStyle);
    assert.equal(actual.tagName, 'IMG'); assert.equal(actual.attributes.get('style'), authoredStyle); assert.equal(actual.textContent, ''); assert.equal(missing, undefined);
    assert.equal(style.has('display'), false, 'Capture must never override authored nonpaint with display:grid.');
    assert.match(actual.attributes.get('src')??'',/^data:image\/png;base64,/);
  }
});


test('ordinary Three offscreen returns retain valid backing pixels and current scene without capture repair or resize',()=>{
 const {api,renderer,sizes,canvas,draws}=trustedFixture({width:1920,height:1350,clientWidth:1280,clientHeight:900});
 const scene={step:0},camera={isPerspectiveCamera:true,aspect:1280/900};renderer.render(scene,camera);
 for(let visit=1;visit<=4;visit++){api.setViewportActive(false);scene.step=visit;const count=draws.length;renderer.render(scene,camera);assert.equal(draws.length,count);api.setViewportActive(true);assert.equal(draws.at(-1)?.scene,scene);assert.equal(draws.at(-1)?.camera,camera);assert.equal(api.readiness().reviewDraws,0);assert.equal(canvas.width,1920);assert.equal(canvas.height,1350);}
 assert.deepEqual(sizes,[],'Revisiting a valid renderer must not rebuild its authored backing buffer.');
});
