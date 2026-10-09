import type { CanvasV2InteractiveScreen } from './interactive-screen';

// Fixed, bundled resources only. Model-authored URLs never enter this loader.
const faces = [
  [400, 'normal', 'Regular'], [500, 'normal', 'Medium'],
  [600, 'normal', 'SemiBold'], [700, 'normal', 'Bold'],
  [800, 'normal', 'ExtraBold'], [900, 'normal', 'Black'],
  [700, 'italic', 'BoldItalic'],
] as const;
export const CANVAS_V2_SCREEN_FONTS = [{
  family: 'Mona Sans', aliases: ['MonaSans', 'GraetMona'],
  weights: [400, 500, 600, 700, 800, 900], italicWeights: [700],
  source: 'Bundled font files; available in live screens, private journeys and exported review pixels.',
  provenance: 'Bundled with the GRAET reference simulation. Availability is not evidence that another product uses this family.',
  usage: 'Optional resource, not a default product typeface. Choose typography from the target product references or brief. Reuse another retained font when available; do not call a substitute an exact reference match.',
}];

export function canvasV2ScreenFontFamilies(screen: Pick<CanvasV2InteractiveScreen, 'html' | 'css' | 'javascript'>) {
  const source = [screen.html, screen.css, screen.javascript].join('\n');
  return ['Mona Sans', 'MonaSans', 'GraetMona'].filter(family => new RegExp(`(?<![\\w-])${family}(?![\\w-])`, 'i').test(source));
}

export function canvasV2ScreenFontCss(families: readonly string[], bytes: readonly string[]) {
  if (families.some(family => !['Mona Sans', 'MonaSans', 'GraetMona'].includes(family)) || bytes.length !== faces.length
    || bytes.some(value => !/^data:font\/ttf;base64,[A-Za-z0-9+/=]+$/.test(value))) throw new Error('Use bundled screen fonts.');
  return families.flatMap(family => faces.map(([weight, style], i) =>
    `@font-face{font-family:"${family}";src:url("${bytes[i]}") format("truetype");font-weight:${weight};font-style:${style};font-display:block}`)).join('\n');
}

let bundledBytes: Promise<string[]> | undefined;
export async function readCanvasV2ScreenFontCss(screen: Pick<CanvasV2InteractiveScreen, 'html' | 'css' | 'javascript'>, signal: AbortSignal) {
  const families = canvasV2ScreenFontFamilies(screen);
  if (!families.length) return '';
  signal.throwIfAborted();
  bundledBytes ??= Promise.all(faces.map(async ([, , name]) => {
    const fixture=process.env.NODE_ENV!=='production'&&typeof window!=='undefined'&&window.location.pathname.startsWith('/canvas-v2-e2e/');
    const response = await fetch(`${fixture?'/canvas-v2-e2e/fonts':'/graet-replica/fonts'}/MonaSans-${name}.ttf`, { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    if (!response.ok || response.redirected) throw new Error('A bundled product font is unavailable.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 12 || bytes.length > 300_000 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) throw new Error('The product font could not be loaded.');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:font/ttf;base64,${btoa(binary)}`;
  })).catch(error => { bundledBytes = undefined; throw error; });
  const bytes = await bundledBytes;
  signal.throwIfAborted();
  return canvasV2ScreenFontCss(families, bytes);
}


/** The unique temporary family is used only by this specimen canvas, removed
 * afterwards, and never changes Northstar's own interface typography. */
export async function inspectCanvasV2FontPixels(pixels:string,signal:AbortSignal){
  const {isCanvasV2FontBytes}=await import('./screen-asset-pixels');
  if(!isCanvasV2FontBytes(pixels))throw new Error('Inspect retained valid font bytes.');
  const family='NorthstarSpecimen'+crypto.randomUUID().replaceAll('-','');
  const face=new FontFace(family,`url("${pixels}")`);
  try{
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]);
    bounded.throwIfAborted();
    await new Promise<void>((resolve,reject)=>{
      const aborted=()=>reject(bounded.reason);
      bounded.addEventListener('abort',aborted,{once:true});
      face.load().then(()=>resolve(),reject).finally(()=>bounded.removeEventListener('abort',aborted));
    });
    signal.throwIfAborted();document.fonts.add(face);
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=440;
    const context=canvas.getContext('2d');if(!context)throw new Error('The font specimen is unavailable.');
    context.fillStyle='#fff';context.fillRect(0,0,1000,440);context.fillStyle='#111';
    for(const [size,text,y] of [[42,'Career · Your next season',78],[28,'Home  Explore  Goals  Profile',150],[18,'Your last 5 games · Score 12 goals',215],[36,'Aa Bb Cc Gg Mm 0123456789',300],[24,'Hamburgefontsiv · Regular glyphs',375]] as const){context.font=`${size}px "${family}"`;context.fillText(text,28,y);}
    signal.throwIfAborted();return {pixels:canvas.toDataURL('image/png'),loaded:face.status==='loaded',note:'Actual glyph specimen from the retained font bytes. This is typeface inspection, not proof of a matching reference, source font weight, or app layout.'};
  }finally{document.fonts.delete(face);}
}
