'use client';
import {useContext,useEffect,useRef,useState} from 'react';
import {CanvasV2ScreenAssets} from './interactive-screen';
import {parseCanvasV2Screen,canvasV2ScreenBoundAssets} from '@/lib/canvas-v2/interactive-screen';
import {readCanvasV2ScreenAssetPixels} from '@/lib/canvas-v2/screen-asset-pixels';
import {readCanvasV2ScreenFontCss} from '@/lib/canvas-v2/screen-fonts';
import {buildScreenDesignExport} from '@/lib/canvas-v2/screen-design-export';
/** Source-only design preview: no authored scripts, host bridge or live state. */
export function ScreenDesignPreview({encoded,width}:{encoded:string;width?:number}){
 const assets=useContext(CanvasV2ScreenAssets),host=useRef<HTMLDivElement>(null),[available,setAvailable]=useState(300),[source,setSource]=useState(''),[error,setError]=useState('');const screen=parseCanvasV2Screen(encoded),viewport=width??screen.width;
 useEffect(()=>{const node=host.current;if(!node)return;const observer=new ResizeObserver(entries=>setAvailable(entries[0].contentRect.width));observer.observe(node);return()=>observer.disconnect()},[]);
 useEffect(()=>{const aborter=new AbortController();setSource('');setError('');void(async()=>{const screen=parseCanvasV2Screen(encoded),bytes=new Map(await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id=>{const asset=assets.find(a=>a.id===id);if(!asset?.url)throw Error('A preview image is unavailable.');return[id,await readCanvasV2ScreenAssetPixels(asset.url,aborter.signal)]as const;})));const file=buildScreenDesignExport({...screen,javascript:'',css:screen.css+'\n*{animation-play-state:paused!important;transition:none!important} video{visibility:hidden}'},bytes,await readCanvasV2ScreenFontCss(screen,aborter.signal),'html',undefined,new DOMParser());if(!aborter.signal.aborted)setSource(file.source);})().catch(e=>{if(!aborter.signal.aborted)setError(e instanceof Error?e.message:'Preview unavailable.')});return()=>aborter.abort()},[encoded,assets]);
 const scale=Math.min(1,available/viewport);return <div ref={host} className="relative w-full overflow-hidden rounded-lg" style={{height:Math.ceil(screen.height*scale)}}>{error?<p role="alert" className="p-3 text-xs text-[#bd6077]">{error}</p>:source?<iframe title={'Read-only design at '+viewport+' pixels'} sandbox="" tabIndex={-1} inert srcDoc={source} style={{width:viewport,height:screen.height,transform:'scale('+scale+')',transformOrigin:'0 0',border:0,pointerEvents:'none',background:'transparent'}}/>:<p className="p-3 text-xs text-[#968aa3]">Preparing design preview…</p>}</div>;
}
