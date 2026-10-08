import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasV2ScreenFontFamilies, canvasV2ScreenFontCss, readCanvasV2ScreenFontCss } from '../lib/canvas-v2/screen-fonts';

test('bundled fonts follow explicit screen typography rather than imposing a product identity', () => {
  assert.deepEqual(canvasV2ScreenFontFamilies({ html:'<h1>Hello</h1>',css:'body{font-family:system-ui}',javascript:'' }),[]);
  assert.deepEqual(canvasV2ScreenFontFamilies({ html:'',css:'body{font-family:"Mona Sans",sans-serif}h1{font-family:GraetMona}',javascript:'' }),['Mona Sans','GraetMona']);
  const bytes=Array(7).fill('data:font/ttf;base64,AAEAAA==');
  assert.throws(()=>canvasV2ScreenFontCss(['Mona Sans";}script{}'],bytes),/bundled/);
  assert.throws(()=>canvasV2ScreenFontCss(['Mona Sans'],Array(7).fill('https://untrusted.test/font.ttf')),/bundled/);
});

test('font loading uses fixed public resources with validated bytes and cached reuse',async()=>{
  const original=globalThis.fetch,urls:string[]=[];
  globalThis.fetch=async(input,options)=>{
    urls.push(String(input));assert.equal(options?.credentials,'same-origin');
    return new Response(new Uint8Array([0,1,0,0,0,0,0,0,0,0,0,0]));
  };
  try{
    const screen={html:'',css:'body{font-family:"Mona Sans"}',javascript:''};
    const first=await readCanvasV2ScreenFontCss(screen,new AbortController().signal);
    assert.equal(urls.length,7);assert.ok(urls.every(url=>/^\/graet-replica\/fonts\/MonaSans-[A-Za-z]+\.ttf$/.test(url)));
    assert.equal((first.match(/@font-face/g)||[]).length,7);
    assert.match(first,/font-weight:700;font-style:italic/);
    assert.equal(await readCanvasV2ScreenFontCss(screen,new AbortController().signal),first);
    assert.equal(urls.length,7);
    const aborter=new AbortController();aborter.abort();
    await assert.rejects(readCanvasV2ScreenFontCss(screen,aborter.signal));
  }finally{globalThis.fetch=original;}
});


test('retained authentic font files export as font assets and bind into isolated native typography', async () => {
  const {readFile}=await import('node:fs/promises');
  const {creativeArtifact}=await import('../lib/canvas-v2/creative/runtime.server');
  const {isCanvasV2FontBytes,readCanvasV2ScreenAssetPixels}=await import('../lib/canvas-v2/screen-asset-pixels');
  const {buildCanvasV2ScreenRuntime}=await import('../lib/canvas-v2/interactive-screen-runtime');
  const {validateCanvasV2Screen}=await import('../lib/canvas-v2/interactive-screen');
  const original=await readFile('public/graet-replica/fonts/MonaSans-Regular.ttf');
  const retained=creativeArtifact(original,'reference.ttf','Reference typography','computed',['source-font']);
  assert.equal(retained.artifact.mimeType,'font/ttf');assert.equal(retained.asset?.kind,'document');
  assert.ok(isCanvasV2FontBytes(retained.artifact.dataUrl));
  const pixels=await readCanvasV2ScreenAssetPixels(retained.artifact.dataUrl,new AbortController().signal);
  const screen={version:1 as const,title:'Native reference typography',width:390,height:844,html:'<h1>Career</h1>',css:`@font-face{font-family:ReferenceFace;src:url(northstar-asset:${retained.artifact.id})}h1{font-family:ReferenceFace}`,javascript:'',referenceAssetIds:[retained.artifact.id]};
  const runtime=buildCanvasV2ScreenRuntime(screen,new Map([[retained.artifact.id,pixels]]),'font-proof');
  assert.ok(runtime.includes(pixels));assert.ok(runtime.includes("font-src data:"));
  assert.throws(()=>validateCanvasV2Screen({...screen,css:`@font-face{font-family:ReferenceFace;src:url(data:font/ttf;base64,AAEAAAAAAAAAAAAA)}`}),/registered northstar-asset/);
  assert.equal(isCanvasV2FontBytes('data:font/woff2;base64,'+Buffer.from('not a font').toString('base64')),false);
});
