import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { screenCaptureImageSourceIsSafe, screenMediaCaptureReplacement } from '../lib/canvas-v2/interactive-screen-runtime';

function fixture(kind: 'image' | 'video', options: { loaded?: boolean; candidate?: string; source?: string; width?: number; height?: number; unreadable?: boolean } = {}) {
  const pixels='data:image/png;base64,ZnJhbWU=';
  const draws: unknown[][]=[];
  const created: ReturnType<typeof element>[]=[];
  function element(tag: string) {
    const attributes=new Map<string,string>();
    const style=new Map<string,string>();
    return {tagName:tag.toUpperCase(),id:'',attributes,style:{setProperty:(key:string,value:string)=>style.set(key,value)},styles:style,textContent:'',width:0,height:0,
      setAttribute(key:string,value:string){attributes.set(key,value);},getAttribute(key:string){return attributes.get(key)??null;},removeAttribute(key:string){attributes.delete(key);},
      getContext(){return {drawImage(...args:unknown[]){draws.push(args);}};},toDataURL(){if(options.unreadable)throw Error('Tainted actual pixels');return pixels;}};
  }
  const document={createElement(tag:string){const result=element(tag);created.push(result);return result;}};
  const copy=Object.assign(element('img'),{ownerDocument:document});copy.id='hero';copy.setAttribute('style','width:240px;height:120px;object-fit:cover');copy.setAttribute('src',options.source??'fallback.png');copy.setAttribute('srcset','other.png 2x');copy.setAttribute('sizes','100vw');
  const source={id:'hero',clientWidth:240,clientHeight:120,naturalWidth:options.width??480,naturalHeight:options.height??240,videoWidth:options.width??480,videoHeight:options.height??240,readyState:options.loaded===false?0:2,complete:options.loaded!==false,currentSrc:options.candidate??'',alt:'Actual artwork',getAttribute:(key:string)=>key==='src'?(options.source??''):null};
  const capture=(paint=true,maximum?:number)=>screenMediaCaptureReplacement(source as unknown as HTMLImageElement,copy as unknown as Element,paint,kind,maximum);
  return {capture,copy,source,created,draws,pixels};
}

test('responsive images freeze their displayed retained candidate without rasterizing or mutating live source',()=>{
  const candidate='data:image/webp;base64,Y2FuZGlkYXRl';const f=fixture('image',{candidate,source:'data:image/png;base64,ZmFsbGJhY2s='});const result=f.capture();
  assert.equal(result.replacement,f.copy);assert.equal(result.missing,undefined);assert.equal(f.copy.getAttribute('src'),candidate);
  assert.equal(f.copy.getAttribute('srcset'),null);assert.equal(f.copy.getAttribute('sizes'),null);assert.equal(f.created.length,0);
  assert.equal(f.source.currentSrc,candidate);assert.equal(f.source.getAttribute('src'),'data:image/png;base64,ZmFsbGJhY2s=');
});

test('GIF, decoded blob and other readable loaded images capture actual displayed pixels with bounded raster size',()=>{
  for(const candidate of ['data:image/gif;base64,Z2lm','blob:actual-decoded-image','data:image/svg+xml;base64,c3Zn']){
    const f=fixture('image',{candidate,source:'wrong-fallback.png',width:24000,height:12000});const result=f.capture();
    assert.equal(result.missing,undefined);assert.equal((result.replacement as unknown as typeof f.copy).getAttribute('src'),f.pixels);
    assert.equal(f.draws[0][0],f.source,'Rasterize the displayed live image, never refetch the fallback src.');
    const raster=f.created[0];assert.ok(raster.width<=8192&&raster.height<=8192&&raster.width*raster.height<=16_000_000);
  }
});

test('unready video and missing or unreadable painted image report explicit unavailable paint, never empty IMG',()=>{
  for(const [kind,options] of [['video',{loaded:false,width:0,height:0}],['image',{loaded:false,source:''}],['image',{candidate:'blob:tainted',unreadable:true}]] as const){
    const f=fixture(kind,options);const result=f.capture();const replacement=result.replacement as unknown as typeof f.copy;
    assert.equal(replacement.tagName,'DIV');assert.equal(replacement.getAttribute('src'),null);assert.equal(replacement.getAttribute('style'),'width:240px;height:120px;object-fit:cover');
    assert.equal(result.missing?.kind,kind);assert.equal(result.missing?.selector,'#hero');assert.match(replacement.textContent,/frame unavailable/);
    assert.equal(f.copy.getAttribute('src'),options.source??'fallback.png','The captured clone alone may be replaced.');
  }
});

test('unpainted unavailable media preserve atomic inline geometry and hidden CSS without missing-paint blockers',()=>{
  for(const kind of ['image','video'] as const)for(const style of ['display:none;width:240px;height:120px','display:inline;width:240px;height:120px;vertical-align:baseline']){const f=fixture(kind,{loaded:false});f.copy.setAttribute('style',style);const result=f.capture(false);const replacement=result.replacement as unknown as typeof f.copy;
    assert.equal(result.missing,undefined);assert.equal(replacement.tagName,'IMG','Nonpainting media must retain replaced-element sizing in inline flow.');assert.equal(replacement.id,'hero');assert.equal(replacement.textContent,'');assert.equal(replacement.styles.has('display'),false);assert.equal(replacement.getAttribute('style'),style);assert.equal(replacement.getAttribute('data-northstar-capture-unavailable'),kind);
    assert.equal(screenCaptureImageSourceIsSafe(replacement.getAttribute('src'),[]),true);
    // Decode the actual PNG scanline: the substitute has one fully transparent
    // RGBA pixel, while the original computed used dimensions remain unchanged.
    const bytes=Buffer.from(replacement.getAttribute('src')!.split(',')[1],'base64');assert.equal(bytes.readUInt32BE(16),1);assert.equal(bytes.readUInt32BE(20),1);assert.deepEqual([...inflateSync(bytes.subarray(41,41+bytes.readUInt32BE(33)))],[0,0,0,0,0]);
  }
});

test('loaded video captures its current decoded frame without seeking, playback changes or empty sources',()=>{
  const f=fixture('video');const result=f.capture();assert.equal(result.missing,undefined);assert.equal(f.draws[0][0],f.source);assert.equal((result.replacement as unknown as typeof f.copy).getAttribute('src'),f.pixels);
});

test('host capture image allowlist rejects absent, unsafe and unowned sources before any embed fetch',()=>{
  for(const source of [null,'','data:,','data:text/html;base64,ZmFsc2U=','/current-page','https://example.test/photo.png','blob:unowned','#fragment','northstar-capture-image:99'])assert.equal(screenCaptureImageSourceIsSafe(source,['blob:retained']),false);
  for(const source of ['data:image/png;base64,cGl4ZWxz','data:image/gif;base64,Z2lm','blob:retained'])assert.equal(screenCaptureImageSourceIsSafe(source,['blob:retained']),true);
});

test('presentation-only media readback caps canvas and video copies at640 without changing strict review resolution',()=>{
 for(const kind of ['canvas','video']as const){
  const f=fixture('video',{width:3840,height:2160}),source=Object.assign(f.source,{width:3840,height:2160,toDataURL:()=>f.pixels});
  const result=screenMediaCaptureReplacement(source as unknown as HTMLCanvasElement,f.copy as unknown as Element,true,kind,640);
  assert.equal(result.missing,undefined);assert.equal(f.created[0].width,640);assert.equal(f.created[0].height,360);assert.equal(f.draws[0][0],source);assert.deepEqual([source.width,source.height],[3840,2160]);
  const strict=fixture('video',{width:3840,height:2160});strict.capture();assert.deepEqual([strict.created[0].width,strict.created[0].height],[3840,2160],'Strict review must retain full requested media pixels.');
 }
 const original=fixture('video',{width:3840,height:2160});let directReads=0;const canvas=Object.assign(original.source,{width:3840,height:2160,toDataURL:()=>{directReads++;return original.pixels;}});screenMediaCaptureReplacement(canvas as unknown as HTMLCanvasElement,original.copy as unknown as Element,true,'canvas');assert.equal(directReads,1);assert.equal(original.created.length,1,'Strict canvas capture uses its original buffer without an intermediate raster.');
});
