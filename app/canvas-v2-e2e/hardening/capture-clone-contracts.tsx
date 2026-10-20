'use client';

import { useState } from 'react';
import { cloneNode } from '@/lib/canvas-v2/cooperative-clone-node';
import { toCooperativeJpeg } from '@/lib/canvas-v2/cooperative-capture';

type Check = { name: string; passed: boolean; error?: string; details?: unknown };
type Preview = { name: string; dataUrl: string };
const OFFSCREEN = 'data-canvas-v2-image-offscreen';
const AUTHORED = 'data-canvas-v2-image-authored-visibility';
const SOURCE_IMAGE = 'data:image/svg+xml;base64,' + 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSI2MCIgaGVpZ2h0PSI4MCIgZmlsbD0iI2ZmMDAwMCIvPjxyZWN0IHg9IjYwIiB3aWR0aD0iNjAiIGhlaWdodD0iODAiIGZpbGw9IiMwMGZmZmYiLz48L3N2Zz4=';

/** Real asynchronous DOM cloning and pixel checks. This guarded DEV fixture
 * creates its own source nodes; it never reads or edits the user's board. */
export function CaptureCloneContracts() {
  const [busy, setBusy] = useState(false), [checks, setChecks] = useState<Check[]>(), [previews, setPreviews] = useState<Preview[]>([]);
  const run = async () => {
    if (busy) return;
    setBusy(true); setChecks(undefined); setPreviews([]);
    const results: Check[] = [], images: Preview[] = [];
    const stage = document.createElement('div');
    stage.setAttribute('aria-hidden', 'true'); stage.inert = true;
    stage.style.cssText = 'position:fixed;left:-20000px;top:0;width:500px;height:500px;pointer-events:none';
    const culling = document.createElement('style');
    culling.textContent = `[data-capture-clone-contract] img[${OFFSCREEN}]{visibility:hidden!important}`;
    stage.setAttribute('data-capture-clone-contract', ''); stage.append(culling); document.body.append(stage);
    const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
    const check = async (name: string, operation: () => Promise<unknown>) => {
      try { const details = await operation(); results.push({ name, passed: true, ...(details === undefined ? {} : { details }) }); }
      catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    const image = async (visibility: string, culled = true) => {
      const node = document.createElement('img'); node.src = SOURCE_IMAGE; node.style.cssText = `width:120px;height:80px;visibility:${visibility}`;
      if (culled) { node.setAttribute(OFFSCREEN, ''); node.setAttribute(AUTHORED, visibility); }
      stage.append(node); await node.decode(); return node;
    };
    const clone = async (node: HTMLElement, uncullImages: boolean) => {
      const result = await cloneNode(node, { uncullImages } as Parameters<typeof cloneNode>[1], true);
      assert(result, 'The real clone helper returned no native node.'); return result!;
    };
    try {
      await check('Capture unculls a visible native image without changing its live paint-culling state', async () => {
        const source = await image('visible'), before = source.outerHTML, copied = await clone(source, true);
        assert(getComputedStyle(source).visibility === 'hidden', 'Fixture did not apply real public culling CSS.');
        assert(copied.style.visibility === 'visible' && copied.style.getPropertyPriority('visibility') === 'important', 'Capture did not restore recorded visible paint.');
        assert(!copied.hasAttribute(OFFSCREEN) && !copied.hasAttribute(AUTHORED), 'Capture retained public culling metadata.');
        assert(source.outerHTML === before && getComputedStyle(source).visibility === 'hidden', 'Capture changed the live image or source visibility.');
      });
      for (const visibility of ['hidden', 'collapse']) await check(`Capture preserves authored ${visibility} on an offscreen native image`, async () => {
        const source = await image(visibility), copied = await clone(source, true);
        assert(copied.style.visibility === visibility, 'Capture revealed intentionally hidden image content.');
        assert(!copied.hasAttribute(OFFSCREEN) && !copied.hasAttribute(AUTHORED), 'Capture retained public culling metadata.');
      });
      await check('Capture preserves ordinary authored-hidden images and normal cloning remains unchanged', async () => {
        const authored = await image('hidden', false), hiddenCopy = await clone(authored, true);
        assert(hiddenCopy.style.visibility === 'hidden', 'Unculling revealed an image without any paint-culling marker.');
        const culled = await image('visible'), ordinaryCopy = await clone(culled, false);
        assert(ordinaryCopy.style.visibility === 'hidden' && ordinaryCopy.hasAttribute(OFFSCREEN), 'Opt-in feedback capture changed default cloning behavior.');
      });
      await check('Unculling handles image descendants without revealing authored-hidden siblings', async () => {
        const group = document.createElement('div'); stage.append(group);
        const visible = await image('visible'), hidden = await image('hidden'); group.append(visible, hidden);
        const copied = await clone(group, true), children = copied.querySelectorAll('img');
        assert(children.length === 2 && children[0].style.visibility === 'visible' && children[1].style.visibility === 'hidden', 'Nested images lost their separate authored visibility.');
      });
      for (const rotation of [0, 23]) await check(`Placed native owner at world coordinates captures actual SVG image pixels with ${rotation}° rotation`, async () => {
        const owner = document.createElement('div'); owner.style.cssText = `position:absolute;left:65536px;top:66000px;width:120px;height:80px;rotate:${rotation}deg;transform-origin:60px 40px;visibility:visible`;
        const picture = await image('visible'); owner.append(picture); stage.append(owner);
        const before = owner.outerHTML, bounds = owner.getBoundingClientRect();
        const dataUrl = await toCooperativeJpeg(owner, { width: 120, height: 80, pixelRatio: 1, outputType: 'image/png', normalizeRoot: true, uncullImages: true, skipFonts: true }, () => owner.isConnected);
        images.push({ name: `Native SVG image · ${rotation}°`, dataUrl });
        const decoded = new Image(); decoded.src = dataUrl; await decoded.decode();
        const pixels = document.createElement('canvas'); pixels.width = decoded.naturalWidth; pixels.height = decoded.naturalHeight;
        const context = pixels.getContext('2d')!; context.drawImage(decoded, 0, 0);
        const data = context.getImageData(0, 0, pixels.width, pixels.height).data;
        let red = 0, cyan = 0, transparent = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 20) transparent++; else if (data[i] > 180 && data[i + 1] < 70 && data[i + 2] < 70) red++; else if (data[i] < 70 && data[i + 1] > 180 && data[i + 2] > 180) cyan++; }
        assert(red > 3000 && cyan > 3000, 'Placed object image is blank, cropped or lost one half of its actual SVG pixels.');
        assert(Math.abs(decoded.naturalWidth - bounds.width) <= 2 && Math.abs(decoded.naturalHeight - bounds.height) <= 2, 'Capture bounds do not reflect authored rotation.');
        if (rotation) assert(transparent > 500, 'Rotated paint was flattened to an unrotated rectangular image.');
        assert(owner.outerHTML === before, 'Capturing positioned paint mutated the live native subtree.');
        return { width: decoded.naturalWidth, height: decoded.naturalHeight, redPixels: red, cyanPixels: cyan, transparentPixels: transparent };
      });
      await check('A remote 12000×8000 world decodes only the bounded raster while preserving camera paint and source', async () => {
        const owner=document.createElement('div');owner.style.cssText='position:relative;width:12000px;height:8000px;overflow:visible';
        const region=document.createElement('div');region.style.cssText='position:absolute;left:65536px;top:66000px;width:12000px;height:8000px;background:rgb(255,0,0)';
        const accent=document.createElement('div');accent.style.cssText='position:absolute;left:6000px;top:4000px;width:2000px;height:2000px;background:rgb(0,0,255)';region.append(accent);owner.append(region);stage.append(owner);
        const before=owner.outerHTML,NativeImage=window.Image,intermediates:Array<{width:number;height:number}>=[];
        // Observe real images created by the production capture helper. Final
        // PNG bounds alone would miss a giant intermediate SVG decode.
        window.Image=new Proxy(NativeImage,{construct(target,args){const image=Reflect.construct(target,args) as HTMLImageElement;image.addEventListener('load',()=>{if(image.src.startsWith('data:image/svg+xml'))intermediates.push({width:image.naturalWidth,height:image.naturalHeight})});return image}});
        let dataUrl:string;
        try{dataUrl=await toCooperativeJpeg(owner,{width:12000,height:8000,canvasWidth:300,canvasHeight:200,pixelRatio:1,outputType:'image/png',skipFonts:true,captureCamera:{bounds:{x:65536,y:66000,width:12000,height:8000},scale:1,translateX:-65536,translateY:-66000}},()=>owner.isConnected)}finally{window.Image=NativeImage}
        assert(intermediates.length===1&&intermediates[0].width===300&&intermediates[0].height===200,'Capture decoded a world-sized SVG instead of the bounded300×200 raster.');
        const decoded=new NativeImage();decoded.src=dataUrl;await decoded.decode();assert(decoded.naturalWidth===300&&decoded.naturalHeight===200,'Final PNG dimensions changed.');
        const canvas=document.createElement('canvas');canvas.width=300;canvas.height=200;const context=canvas.getContext('2d')!;context.drawImage(decoded,0,0);const red=context.getImageData(20,20,1,1).data,blue=context.getImageData(175,125,1,1).data;
        assert(red[0]>240&&red[1]<15&&red[2]<15&&red[3]>240,'Remote world camera lost the red source background.');assert(blue[2]>240&&blue[0]<15&&blue[1]<15&&blue[3]>240,'Remote world camera lost the correctly placed blue accent.');assert(owner.outerHTML===before,'Bounded rasterization changed source coordinates or styling.');
        images.push({name:'Bounded raster from remote 12000×8000 world',dataUrl});return{nativeWorld:{width:12000,height:8000},intermediateSVG:intermediates[0],finalPNG:{width:decoded.naturalWidth,height:decoded.naturalHeight},redSample:[...red],blueSample:[...blue],sourceUnchanged:true};
      });
    } finally { stage.remove(); setChecks(results); setPreviews(images); setBusy(false); }
  };
  return <section style={{ marginTop: 24, borderTop: '1px solid #61546f', paddingTop: 24 }}>
    <h2>Native feedback capture contracts</h2>
    <p>Real DOM clones and generated PNG pixels from isolated placed/rotated SVG-image fixtures. These checks do not measure board performance or model quality.</p>
    <button type="button" disabled={busy} onClick={() => void run()}>{busy ? 'Checking native feedback captures…' : 'Run native feedback capture contracts'}</button>
    <p role="status">{checks ? `${checks.filter(check => check.passed).length}/${checks.length} native capture contracts passed` : busy ? 'Running asynchronous native capture checks' : 'Native capture not checked'}</p>
    <pre data-testid="native-feedback-capture-results" style={{ whiteSpace: 'pre-wrap' }}>{checks ? JSON.stringify({ passed: checks.every(check => check.passed), checks }, null, 2) : ''}</pre>
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{previews.map(preview => <figure key={preview.name}><figcaption>{preview.name}</figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.dataUrl} alt={preview.name} style={{ background: '#494453', maxWidth: 200 }} /><textarea readOnly aria-label={`Exact PNG data URL · ${preview.name}`} value={preview.dataUrl} rows={2} /></figure>)}</div>
  </section>;
}
