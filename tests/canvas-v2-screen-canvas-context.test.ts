import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installScreenCanvasContextObservation } from '../lib/canvas-v2/screen-canvas-context';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';

function runtime() {
  let pagehide = () => {};
  class Canvas {
    calls: unknown[][] = [];
    selected?: string;
    context = {};
    getContext(type: string, options?: unknown) {
      this.calls.push([type, options]);
      if (type === 'unsupported') return null;
      if (type === 'throw') throw new Error('native failure');
      if (this.selected && this.selected !== type) return null;
      this.selected = type;
      return this.context;
    }
  }
  const original = Canvas.prototype.getContext;
  const read = vm.runInNewContext(`(${installScreenCanvasContextObservation.toString()})();`, {
    HTMLCanvasElement: Canvas,
    window: { addEventListener(_type: string, listener: () => void) { pagehide = listener; } },
  }) as (canvas: Canvas) => { type: string; context: unknown } | undefined;
  return { Canvas, original, read, pagehide: () => pagehide() };
}

test('diagnostics during async initialization do not claim a WebGPU canvas', async () => {
  const { Canvas, read } = runtime(), canvas = new Canvas();
  assert.equal(read(canvas), undefined);
  await Promise.resolve();
  assert.equal(read(canvas), undefined);
  assert.equal(canvas.calls.length, 0);
  assert.equal(canvas.getContext('webgpu'), canvas.context);
  assert.equal(read(canvas)?.type, 'webgpu');
  assert.equal(read(canvas)?.context, canvas.context);
});

test('emitted diagnostics leave pending unmarked canvases free to choose 2D or WebGPU', async () => {
  const { Canvas, read } = runtime(), pending2d = new Canvas(), pendingGpu = new Canvas();
  const html = buildCanvasV2ScreenRuntime({version:1,title:'Async contexts',width:480,height:360,html:'<canvas></canvas>',css:'',javascript:'',referenceAssetIds:[]},new Map(),'context-regression');
  const start=html.indexOf('const webglDiagnostics ='),end=html.indexOf('const motionInfo =',start);
  assert.ok(start>=0&&end>start);
  const diagnose=vm.runInNewContext(`${html.slice(start,end)};webglDiagnostics`,{
    document:{querySelectorAll:()=>[pending2d,pendingGpu],createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8Array([20,40,60,255])})})})},
    selectorFor:()=>'canvas',readCanvasContext:read,window:{},
  }) as ()=>Array<{context:string|null;available:boolean}>;
  assert.equal(diagnose().every(item=>item.context===null&&!item.available),true);
  assert.equal(pending2d.calls.length+pendingGpu.calls.length,0);
  await Promise.resolve();
  pending2d.getContext('2d');pendingGpu.getContext('webgpu');
  const results=diagnose();
  assert.equal(results[0].context,'2d');assert.equal(results[0].available,true);
  assert.equal(results[1].context,'webgpu');assert.equal(results[1].available,true);
  assert.equal(pending2d.calls.length+pendingGpu.calls.length,2,'diagnostics must not probe author canvases');
});

test('context identity and native creation options are preserved across reads', () => {
  for (const type of ['2d', 'webgl', 'webgl2', 'bitmaprenderer', 'webgpu']) {
    const { Canvas, read } = runtime(), canvas = new Canvas(), options = { alpha: false };
    assert.equal(canvas.getContext(type, options), canvas.context);
    assert.equal(canvas.calls[0][1], options);
    for (let i = 0; i < 4; i++) assert.equal(read(canvas)?.context, canvas.context);
    assert.equal(canvas.calls.length, 1, 'observation must not invoke the context factory');
    assert.equal(canvas.getContext('unsupported'), null);
    assert.equal(read(canvas)?.type, type);
  }
});

test('failed context selection does not poison subsequent initialization', () => {
  const { Canvas, read } = runtime(), canvas = new Canvas();
  assert.equal(canvas.getContext('unsupported'), null);
  assert.equal(read(canvas), undefined);
  assert.throws(() => canvas.getContext('throw'), /native failure/);
  assert.equal(read(canvas), undefined);
  canvas.getContext('2d');
  assert.equal(read(canvas)?.type, '2d');
});

test('disposal restores only its own wrapper and preserves a later author wrapper', () => {
  const first = runtime();
  first.pagehide();
  assert.equal(first.Canvas.prototype.getContext, first.original);
  const second = runtime(), later = function () { return null; };
  second.Canvas.prototype.getContext = later;
  second.pagehide();
  assert.equal(second.Canvas.prototype.getContext, later);
});
