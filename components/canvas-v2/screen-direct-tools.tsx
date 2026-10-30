'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X, PenTool, Pencil, Trash2, ArrowUp, ArrowDown, Plus, SlidersHorizontal, Sparkles, Eye, ImagePlus, Type, Move, Palette, AlignLeft, AlignCenter, AlignRight, ChevronDown, ChevronRight, ArrowLeft, Search, Layers, Lock, Square, Image as ImageIcon, Folder, MousePointer2, MessageSquare } from 'lucide-react';
import { resolveCanvasV2ContextToolbarPosition } from '@/lib/canvas-v2/context-toolbar-placement';
import { CanvasV2RichTextToolbar } from './rich-text-toolbar';
import type { ScreenEditableLayer } from '@/lib/canvas-v2/screen-vector-edit';
import { canvasV2EditorFontFamily, canvasV2EditorInlineFontRules, type CanvasV2EditorFonts } from '@/lib/canvas-v2/screen-editor-fonts';
import { screenInlineTextMarkup } from '@/lib/canvas-v2/screen-inline-text';
import { CanvasV2ColorPalette } from './color-palette';
import type { CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { SCREEN_DIRECT_SAVE_FAILURE_EVENT, registerScreenDirectFlush, flushScreenDirectEdits, screenElementDragOffset, type ScreenDirectOptions, type ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';

/** Drain an in-flight save and any typing that arrived while it committed. */
function useScreenEditFlush(save: RefObject<() => Promise<void>>, pending: RefObject<Promise<ScreenDirectResult> | undefined>, dirty: RefObject<boolean>, failure: RefObject<string>) {
  const subscription = useRef(0);
  useEffect(() => {
    const generation = ++subscription.current;
    const drain=async()=>{
      for (let attempt = 0; attempt < 90; attempt++) {
        await pending.current;
        await save.current();
        await new Promise(resolve => setTimeout(resolve, 16));
        if (failure.current) throw new Error(failure.current);
        if (!dirty.current && !pending.current) return;
      }
      throw new Error('Your changes are still saving. Try sending again.');
    };
    const unregister=registerScreenDirectFlush(drain);
    // Keep participating in a chat handoff until the unmounted editor's last
    // draft has drained. Pending work lives in refs, independent of rerenders.
    return()=>{queueMicrotask(()=>{
      // React's development effect replay is not a completed human edit.
      // Its abandoned drain must not save keystrokes from the live remount.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Compare the live generation; this is not a DOM ref captured for cleanup.
      if(subscription.current!==generation){unregister();return;}
      void drain().catch(error=>window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_SAVE_FAILURE_EVENT,{detail:error instanceof Error?error.message:'Your last edit could not be saved. Select the element and try again.'}))).finally(unregister);
    })};
  }, [save, pending, dirty, failure]);
}

/** Menus share the canvas object toolbar, including keyboard selection. */
export function StudioSelect({label,value,options,onChange,disabled=false,previewFont=false,display,compact=false}:{label:string;value:string;options:Array<{value:string;label:string}>;onChange:(value:string)=>void;disabled?:boolean;previewFont?:boolean;display?:string;compact?:boolean}) {
  return <DropdownMenu.Root modal={false}><DropdownMenu.Trigger type="button" aria-label={label} disabled={disabled} className={"mt-1.5 flex h-9 w-full items-center justify-between rounded-lg border border-[#e3dfe9] outline-none transition-colors hover:bg-black/[.035] focus-visible:ring-2 focus-visible:ring-[#9b87ef]/30 disabled:opacity-40 dark:border-white/[.08] dark:hover:bg-white/[.06] "+(compact?"gap-1 px-1.5 text-[11px]":"gap-2 px-2.5 text-[12px]")}><span className="truncate">{display??options.find(option=>option.value===value)?.label??value}</span><ChevronDown size={12} className="shrink-0 text-[#968aa3]"/></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content data-canvas-v2-direct-editing="true" aria-label={label+' options'} side="bottom" align="start" sideOffset={6} onCloseAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="z-[1004] max-h-[280px] min-w-[160px] max-w-[280px] overflow-y-auto rounded-[12px] border border-[#ddd8e5] bg-white/[.98] p-1.5 text-[#514a60] shadow-[0_6px_20px_rgba(0,0,0,.22)] outline-none backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/[.08] dark:bg-[#211d28]/[.98] dark:text-[#eee7f5]"><DropdownMenu.RadioGroup value={value} onValueChange={onChange}>{options.map(option=><DropdownMenu.RadioItem key={option.value} value={option.value} style={previewFont?{fontFamily:option.value}:undefined} className="flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-[13px] outline-none data-[highlighted]:bg-black/[.045] dark:data-[highlighted]:bg-white/[.08]"><span className="flex w-3 items-center"><DropdownMenu.ItemIndicator><Check size={12}/></DropdownMenu.ItemIndicator></span>{option.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

function StudioSize({label,value,onChange,disabled,inputClass}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean;inputClass:string}){
  const match=/^(\d+(?:\.\d+)?)(px|%|rem|em|vw|vh)$/.exec(value),unit=match?.[2]??(['auto','none','min-content','max-content','fit-content','normal'].includes(value)?value:'px');
  return <label className="block text-xs capitalize">{label}<div className="flex items-end gap-1"><input aria-label={label+' value'} type="number" min={0} max={8192} step="any" disabled={disabled||!match&&unit!=='px'} value={match?.[1]??''} placeholder={unit==='px'?'Current':unit==='none'?'None':'Auto'} className={inputClass+' min-w-0'} onChange={e=>{if(e.target.value)onChange(e.target.value+(match?.[2]??'px'))}}/><div className="w-[56px] shrink-0"><StudioSelect compact label={label+' unit'} value={unit} disabled={disabled} options={[...['px','%','rem','em','vw','vh'].map(item=>({value:item,label:item})),{value:label.startsWith('max')?'none':'auto',label:label.startsWith('max')?'None':'Auto'},{value:'fit-content',label:'Fit'}]} onChange={next=>onChange(['auto','none','fit-content'].includes(next)?next:(match?.[1]??'100')+next)}/></div></div></label>;
}

export function StudioColour({label,value,display,onChange,disabled=false,inputClass}:{label:string;value:string;display:string;onChange:(value:string)=>void;disabled?:boolean;inputClass:string}) {
  const gradient=/^url\(/i.test(value),transparent=['none','transparent','rgba(0, 0, 0, 0)',''].includes(value);
  return <div className="flex items-center gap-2"><DropdownMenu.Root modal={false}><DropdownMenu.Trigger type="button" disabled={disabled} aria-label={label+' palette'} className="mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-black/[.04] focus-visible:ring-2 focus-visible:ring-[#9b87ef]/30 dark:hover:bg-white/[.06]"><span className="relative h-5 w-5 overflow-hidden rounded-full border border-black/15 dark:border-white/20" style={{background:(display==='Mixed'||gradient)?'conic-gradient(#e796a0,#9b87ef,#68b8cb,#e796a0)':transparent?'repeating-conic-gradient(#747078 0% 25%,#302c38 0% 50%) 0 0 / 8px 8px':value}}>{transparent&&<span className="absolute left-1/2 top-0 h-full w-px rotate-45 bg-[#ddd5e7]"/>}</span></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content data-canvas-v2-direct-editing="true" side="left" align="start" sideOffset={12} onCloseAutoFocus={e=>e.preventDefault()} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="z-[1004] outline-none"><CanvasV2ColorPalette label={label+' palette'} colors={transparent||gradient||display==='Mixed'?[]:[value]} customColor={value} onChange={onChange} header={<><span className="px-2 text-[11px] font-semibold">{label}</span>{label==='Background colour'&&<button type="button" onClick={()=>onChange('transparent')} className="ml-auto rounded-md px-2 py-1 text-[11px] hover:bg-white/10">No fill</button>}</>}/></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><input aria-label={label} disabled={disabled} className={inputClass+' font-mono text-[11px]'} placeholder="None" value={display} onChange={e=>onChange(e.target.value||'transparent')}/></div>;
}

/** The drag surface is host-owned. Authored iframe messages never authorize a move. */
function ScreenElementOutline({target,frame,screenWidth,canMove,onMove,onPreview,onEditText,selectionRect,onToggle,nestedSelection=false}:{nestedSelection?:boolean;target:CanvasV2ScreenFeedbackTarget;frame:RefObject<HTMLIFrameElement|null>;screenWidth:number;canMove:boolean;onMove:(x:number,y:number)=>Promise<ScreenDirectResult>;onPreview:()=>void;onEditText?:()=>void;onToggle?:()=>void;selectionRect?:RefObject<CanvasV2ScreenFeedbackTarget['rect']|undefined>}) {
  const guideX=useRef<HTMLDivElement>(null),guideY=useRef<HTMLDivElement>(null);
  const outline=useRef<HTMLDivElement>(null),gesture=useRef<{id:number;x:number;y:number;dx:number;dy:number;scale:number;guideX?:number;guideY?:number}|undefined>(undefined),[error,setError]=useState('');
  const translate=target.styles.translate??'none';
  const movable=canMove&&(translate==='none'||/^-?\d+(?:\.\d+)?px(?: -?\d+(?:\.\d+)?px)?$/.test(translate));
  const offset=translate==='none'?[0,0]:translate.split(' ').map(parseFloat);
  const toLocal=(x:number,y:number)=>{const m=target.vectorMatrix,det=m?m.a*m.d-m.b*m.c:0;return m&&Math.abs(det)>1e-9?{x:(m.d*x-m.c*y)/det,y:(-m.b*x+m.a*y)/det}:{x,y}};
  const commit=async(x:number,y:number)=>{try{const result=await onMove(Math.round(x*10)/10,Math.round(y*10)/10);if(!result.ok)setError(result.error||'This item could not be moved.')}catch{setError('This item could not be moved.')}};
  useLayoutEffect(()=>{
    let raf=0;
    const place=()=>{
      const bounds=frame.current?.getBoundingClientRect(),box=outline.current;
      if(bounds&&box){
        const scale=bounds.width/screenWidth,r=selectionRect?.current??target.rect,drag=gesture.current;
        const left=bounds.left+r.x*scale+(drag?.dx??0),top=bounds.top+r.y*scale+(drag?.dy??0);
        const x=Math.max(0,bounds.left,left),y=Math.max(0,bounds.top,top);
        const width=Math.max(0,Math.min(window.innerWidth,bounds.right,left+r.width*scale)-x),height=Math.max(0,Math.min(window.innerHeight,bounds.bottom,top+r.height*scale)-y);
        Object.assign(box.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',visibility:width&&height?'visible':'hidden'});
        if(guideX.current)Object.assign(guideX.current.style,{display:drag?.guideX===undefined?'none':'block',left:bounds.left+(drag?.guideX??0)*scale+'px',top:Math.max(0,bounds.top)+'px',height:Math.max(0,Math.min(window.innerHeight,bounds.bottom)-Math.max(0,bounds.top))+'px'});
        if(guideY.current)Object.assign(guideY.current.style,{display:drag?.guideY===undefined?'none':'block',top:bounds.top+(drag?.guideY??0)*scale+'px',left:Math.max(0,bounds.left)+'px',width:Math.max(0,Math.min(window.innerWidth,bounds.right)-Math.max(0,bounds.left))+'px'});
      }
      raf=requestAnimationFrame(place);
    };
    place();return()=>cancelAnimationFrame(raf);
  },[frame,screenWidth,target,selectionRect]);
  return createPortal(<><div ref={guideX} aria-hidden className="pointer-events-none fixed z-[997] w-px bg-[#9b87ef]/70" style={{display:'none'}}/><div ref={guideY} aria-hidden className="pointer-events-none fixed z-[997] h-px bg-[#9b87ef]/70" style={{display:'none'}}/><div ref={outline} role="button" tabIndex={0} aria-label="Move selected element" data-canvas-v2-direct-editing="true" className="fixed z-[998] touch-none rounded-[3px] border-[1.5px] border-[#9b87ef] outline-none focus-visible:shadow-[0_0_0_3px_#9b87ef25]" style={{cursor:movable?'move':'default',pointerEvents:['svg','g','main','section','article','div','header','footer','form','nav','ul','ol'].includes(target.tag)||nestedSelection&&!onEditText?'none':'auto'}} onDoubleClick={e=>{e.stopPropagation();onEditText?.()}} onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.stopPropagation();if(e.shiftKey||e.metaKey||e.ctrlKey){e.preventDefault();onToggle?.();return}if(!movable||e.button!==0||!e.nativeEvent.isTrusted)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);const bounds=frame.current?.getBoundingClientRect();if(bounds)gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,scale:bounds.width/screenWidth}}} onPointerMove={e=>{const g=gesture.current;if(g?.id===e.pointerId){e.stopPropagation();const snap=screenElementDragOffset(selectionRect?.current??target.rect,{width:screenWidth,height:frame.current?.clientHeight??1},g.scale,e.clientX-g.x,e.clientY-g.y,{axisLock:e.shiftKey,free:e.altKey});g.dx=snap.x*g.scale;g.dy=snap.y*g.scale;g.guideX=snap.guideX;g.guideY=snap.guideY}}} onPointerUp={e=>{const g=gesture.current;if(g?.id!==e.pointerId)return;e.stopPropagation();gesture.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(Math.hypot(g.dx,g.dy)>4){const delta=toLocal(g.dx/g.scale,g.dy/g.scale);void commit(offset[0]+delta.x,(offset[1]??0)+delta.y)}}} onPointerCancel={()=>{gesture.current=undefined}} onLostPointerCapture={()=>{gesture.current=undefined}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();gesture.current=undefined;onPreview()}else if(movable&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const step=e.shiftKey?10:1,delta=toLocal(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);void commit(offset[0]+delta.x,(offset[1]??0)+delta.y)}}}><span className="pointer-events-auto absolute -top-5 left-0 flex h-5 items-center gap-1 rounded-t-md bg-[#9b87ef] px-1.5 text-[9px] font-medium text-[#171220]"><Move size={10}/>{target.tag==='img'?'Image':['h1','h2','h3','p','span','label','button','a'].includes(target.tag)?'Text':'Element'}</span></div>{error&&<div role="alert" className="fixed bottom-20 right-5 z-[1002] rounded-lg bg-[#231f2c] p-3 text-xs text-[#e1b3c4]">{error}</div>}</>,document.body);
}

export function ScreenDirectMenu({options,scale,onClose,onEdit,onAppearance,onRemove,onMove,onAdd,onDesign,previewOnly=false}:{onDesign?:()=>void;previewOnly?:boolean;options:ScreenDirectOptions;scale:number;onClose:()=>void;onEdit:(target:CanvasV2ScreenFeedbackTarget)=>void;onAppearance:()=>void;onRemove:(target:CanvasV2ScreenFeedbackTarget)=>void;onMove:(direction:'up'|'down')=>void;onAdd:(position:'before'|'after')=>void}) {
  const itemClass='flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]';
  return <DropdownMenu.Root open modal={false} onOpenChange={open=>{if(!open)onClose()}}>
    <DropdownMenu.Trigger asChild><button aria-label="Screen editing options" tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" style={{left:options.x*scale,top:options.y*scale}}/></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} aria-label="Edit screen content" align="start" sideOffset={5} onCloseAutoFocus={event=>event.preventDefault()} className="z-[1000] min-w-[180px] rounded-[14px] border border-[#e2ddeb] bg-[#fcfbfe] p-1.5 text-[13px] text-[#433b51] shadow-[0_10px_35px_#24153625] dark:border-white/[.09] dark:bg-[#211d28] dark:text-[#e5deec]">
      {onDesign&&<DropdownMenu.Item onSelect={onDesign} className={itemClass}><PenTool size={15} strokeWidth={1.6}/>Edit design</DropdownMenu.Item>}
      {!previewOnly&&<>
      {options.text && <DropdownMenu.Item onSelect={()=>onEdit(options.text!)} className="flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]"><Pencil size={15} strokeWidth={1.6}/>{options.textNeedsAgent?'Edit with Northstar':'Edit text'}</DropdownMenu.Item>}
      {options.appearance && <DropdownMenu.Item onSelect={onAppearance} className={itemClass}><SlidersHorizontal size={15} strokeWidth={1.6}/>{options.appearanceNeedsAgent?'Style with Northstar':'Appearance'}</DropdownMenu.Item>}
      {options.section && <>
        {options.text && <DropdownMenu.Separator className="mx-2 my-1 h-px bg-[#433b51]/10 dark:bg-white/[.08]"/>}
        <DropdownMenu.Item onSelect={()=>onAdd('before')} className={itemClass}><Plus size={15} strokeWidth={1.6}/>Add section above</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>onAdd('after')} className={itemClass}><Plus size={15} strokeWidth={1.6}/>Add section below</DropdownMenu.Item>
        {(options.moves?.up || options.moves?.down) && <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className={itemClass}><ArrowUp size={15} strokeWidth={1.6}/>Move section<span aria-hidden="true" className="ml-auto text-[#968aa3]">›</span></DropdownMenu.SubTrigger>
          <DropdownMenu.Portal><DropdownMenu.SubContent data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} className="z-[1001] min-w-[170px] rounded-[14px] border border-[#e2ddeb] bg-[#fcfbfe] p-1.5 text-[13px] text-[#433b51] shadow-[0_10px_35px_#24153625] dark:border-white/[.09] dark:bg-[#211d28] dark:text-[#e5deec]" sideOffset={6}>
            {options.moves.up && <DropdownMenu.Item onSelect={()=>onMove('up')} className={itemClass}><ArrowUp size={15} strokeWidth={1.6}/>{options.moveNeedsAgent?'Up with Northstar':'Up'}</DropdownMenu.Item>}
            {options.moves.down && <DropdownMenu.Item onSelect={()=>onMove('down')} className={itemClass}><ArrowDown size={15} strokeWidth={1.6}/>{options.moveNeedsAgent?'Down with Northstar':'Down'}</DropdownMenu.Item>}
          </DropdownMenu.SubContent></DropdownMenu.Portal>
        </DropdownMenu.Sub>}
        <DropdownMenu.Separator className="mx-2 my-1 h-px bg-[#433b51]/10 dark:bg-white/[.08]"/>
      </>}
      {options.section && <DropdownMenu.Item onSelect={()=>onRemove(options.section!)} className="flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]"><Trash2 size={15} strokeWidth={1.6}/>{options.sectionNeedsAgent?'Remove with Northstar':'Remove section'}</DropdownMenu.Item>}
      </>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** Persistent navigation is independent of the selected properties editor. */
export function ScreenLayerRail({title,layers,selected,selectedSelectors,onSelect,onHover,onExit,onChat,covered=false}:{title:string;layers:ScreenEditableLayer[];selected?:string;selectedSelectors?:string[];onSelect:(selector:string,mode?:'replace'|'toggle'|'range',ordered?:string[])=>void;onHover?:(selector?:string)=>void;onExit:()=>void;onChat?:()=>void;covered?:boolean}) {
  const [query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const tree=useRef<HTMLDivElement>(null);
  const bySelector=useMemo(()=>new Map(layers.map(layer=>[layer.selector,layer])),[layers]);
  const parents=useMemo(()=>new Set(layers.flatMap(layer=>layer.parentSelector?[layer.parentSelector]:[])),[layers]);
  const toggle=(selector:string)=>setCollapsed(current=>{const next=new Set(current);if(next.has(selector))next.delete(selector);else next.add(selector);return next});
  useEffect(()=>{
    if(!selected)return;
    const ancestors:string[]=[];let parent=bySelector.get(selected)?.parentSelector;
    while(parent){ancestors.push(parent);parent=bySelector.get(parent)?.parentSelector}
    setCollapsed(current=>{if(!ancestors.some(id=>current.has(id)))return current;const next=new Set(current);ancestors.forEach(id=>next.delete(id));return next});
    requestAnimationFrame(()=>tree.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'}));
  },[selected,bySelector]);
  const matches=new Set(layers.filter(layer=>(layer.label+' '+layer.tag).toLowerCase().includes(query.toLowerCase())).map(layer=>layer.selector));
  if(query)for(const selector of [...matches]){let parent=bySelector.get(selector)?.parentSelector;while(parent){matches.add(parent);parent=bySelector.get(parent)?.parentSelector}}
  const visible=layers.filter(layer=>{
    if(query)return matches.has(layer.selector);
    let parent=layer.parentSelector;while(parent){if(collapsed.has(parent))return false;parent=bySelector.get(parent)?.parentSelector}return true;
  });
  return createPortal(<aside inert={covered?true:undefined} aria-hidden={covered?true:undefined} aria-label="Object layers" data-canvas-v2-direct-editing="true" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} className="fixed bottom-4 left-4 top-[90px] z-[1001] flex w-[232px] flex-col overflow-hidden rounded-2xl border border-[#e2ddeb] bg-[#fcfbfe]/[.98] text-[#514a60] shadow-[0_8px_30px_#100b2315] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#1d1a24]/[.98] dark:text-[#eee7f5] max-[900px]:w-[184px]">
    <div className="border-b border-current/[.08] p-3"><button type="button" onClick={onExit} aria-label="Back to canvas" className="flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] text-[#968aa3] hover:bg-black/5 dark:hover:bg-white/5"><ArrowLeft size={13}/>Back to canvas</button><div className="mt-3 flex items-center gap-2 px-2"><Layers size={14} className="shrink-0 text-[#a18adf]"/><h2 className="truncate text-xs font-medium">{title}</h2></div></div>
    <div className="flex items-center justify-between px-4 pb-2 pt-4"><span className="text-[10px] font-medium uppercase tracking-[.12em] text-[#968aa3]">Layers</span><span className="text-[10px] tabular-nums text-[#968aa3]">{selectedSelectors&&selectedSelectors.length>1?selectedSelectors.length+' selected':layers.length}</span></div>
    <label className="mx-3 mb-3 flex h-8 items-center gap-2 rounded-lg border border-current/10 px-2 text-[#968aa3]"><Search size={12}/><input aria-label="Search layers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a layer…" className="min-w-0 flex-1 bg-transparent text-[11px] text-[#514a60] outline-none placeholder:text-[#968aa3] dark:text-[#eee7f5]"/></label>
    <div ref={tree} role="tree" aria-multiselectable="true" aria-label="Editable layers" onPointerLeave={()=>onHover?.()} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{visible.map(layer=>{const expandable=parents.has(layer.selector),open=!!query||!collapsed.has(layer.selector),Icon=layer.tag==='img'||layer.tag==='image'?ImageIcon:['h1','h2','h3','h4','p','text','tspan','label','button'].includes(layer.tag)?Type:expandable?Folder:Square;return <div key={layer.selector} role="treeitem" tabIndex={selected===layer.selector||!visible.some(item=>item.selector===selected)&&visible[0]===layer?0:-1} aria-level={layer.depth+1} aria-expanded={expandable?open:undefined} aria-selected={(selectedSelectors??(selected?[selected]:[])).includes(layer.selector)} aria-label={'Select layer '+layer.label} data-layer-selector={layer.selector} onPointerEnter={()=>onHover?.(layer.selector)} onPointerLeave={()=>onHover?.()} onClick={e=>onSelect(layer.selector,e.shiftKey?'range':e.metaKey||e.ctrlKey?'toggle':'replace',visible.map(item=>item.selector))} onKeyDown={e=>{
      const index=visible.indexOf(layer);let next:ScreenEditableLayer|undefined;
      if(e.key==='ArrowDown')next=visible[index+1];else if(e.key==='ArrowUp')next=visible[index-1];else if(e.key==='ArrowRight'){if(expandable&&!open)toggle(layer.selector);else next=visible[index+1]?.parentSelector===layer.selector?visible[index+1]:undefined}else if(e.key==='ArrowLeft'){if(expandable&&open)toggle(layer.selector);else next=bySelector.get(layer.parentSelector??'')}else if(e.key==='Home')next=visible[0];else if(e.key==='End')next=visible.at(-1);else if(e.key==='Enter'||e.key===' '){onSelect(layer.selector,e.shiftKey?'range':e.metaKey||e.ctrlKey?'toggle':'replace',visible.map(item=>item.selector))}else return;
      e.preventDefault();if(next){const selector=next.selector;tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]').forEach(row=>{if(row.dataset.layerSelector===selector)row.focus()});onSelect(selector,e.shiftKey?'range':'replace',visible.map(item=>item.selector))}
    }} style={{paddingLeft:4+Math.min(layer.depth,8)*12}} className="group flex h-8 cursor-default items-center gap-1 rounded-lg pr-2 text-[11px] outline-none transition-colors hover:bg-black/[.035] focus-visible:ring-1 focus-visible:ring-[#a18adf] aria-selected:bg-[#8b73f8]/[.14] aria-selected:text-[#755cbb] dark:hover:bg-white/[.04] dark:aria-selected:text-[#d2c4fb]">{expandable?<button type="button" tabIndex={-1} aria-label={(open?'Collapse ':'Expand ')+layer.label} onClick={e=>{e.stopPropagation();toggle(layer.selector)}} className="grid h-5 w-4 shrink-0 place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10">{open?<ChevronDown size={11}/>:<ChevronRight size={11}/>}</button>:<span className="w-4 shrink-0"/>}<Icon size={12} strokeWidth={1.5} className="mr-1 shrink-0 text-[#968aa3]"/><span className={'truncate '+(layer.hidden?'opacity-45':'')}>{layer.label}</span>{layer.locked&&<Lock size={10} className="ml-auto shrink-0 opacity-50"/>}{layer.hidden&&<Eye size={11} className="ml-auto shrink-0 opacity-40"/>}</div>})}{!visible.length&&<p className="px-3 py-6 text-center text-xs text-[#968aa3]">No matching layers</p>}</div>
    <div className="shrink-0 border-t border-current/[.08] p-3"><button type="button" aria-label="Open Northstar chat in edit view" onClick={onChat} className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#8b73f8]/10 text-[11px] text-[#8068b5] hover:bg-[#8b73f8]/15 dark:text-[#c4b4f7]"><MessageSquare size={13}/>Chat with Northstar</button><p className="mt-2 px-1 text-[10px] leading-4 text-[#968aa3]">Shift selects a range · ⌘ / Ctrl adds a layer</p></div>
  </aside>,document.body);
}

/** Multi-selection is explicit: this panel scopes AI work, not single-layer fields. */
export function ScreenSelectionInspector({targets,targetRects,frame,screenWidth,onAsk,onSelect,onRemove,onClear,children}:{children?:ReactNode;targets:CanvasV2ScreenFeedbackTarget[];targetRects:RefObject<CanvasV2ScreenFeedbackTarget[]>;frame:RefObject<HTMLIFrameElement|null>;screenWidth:number;onAsk:()=>void;onSelect:(selector:string)=>void;onRemove:(selector:string)=>void;onClear:()=>void}) {
  const overlays=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    let raf=0;const place=()=>{
      const bounds=frame.current?.getBoundingClientRect();if(bounds)for(const node of overlays.current?.children??[]){const element=node as HTMLElement,target=targetRects.current.find(part=>part.selector===element.dataset.selector);if(!target){element.style.visibility='hidden';continue}const scale=bounds.width/screenWidth,r=target.rect,left=bounds.left+r.x*scale,top=bounds.top+r.y*scale,x=Math.max(bounds.left,left),y=Math.max(bounds.top,top),width=Math.max(0,Math.min(bounds.right,left+r.width*scale)-x),height=Math.max(0,Math.min(bounds.bottom,top+r.height*scale)-y);Object.assign(element.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',visibility:width&&height?'visible':'hidden'})}raf=requestAnimationFrame(place);
    };place();return()=>cancelAnimationFrame(raf);
  },[frame,screenWidth,targetRects]);
  return createPortal(<><div ref={overlays} className="pointer-events-none fixed inset-0 z-[998]" aria-hidden>{targets.map(target=><div key={target.selector} data-selector={target.selector} className="fixed rounded-[2px] border border-[#a18adf]"/>)}</div><aside aria-label="Selected layers" data-canvas-v2-direct-editing="true" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} className="fixed bottom-4 right-4 top-[90px] z-[1001] flex w-[280px] flex-col overflow-hidden rounded-2xl border border-[#e2ddeb] bg-[#fcfbfe]/[.98] p-4 text-[#514a60] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#1d1a24]/[.98] dark:text-[#eee7f5]"><div className="flex shrink-0 items-center justify-between"><h2 className="text-[13px] font-medium">{targets.length} layers selected</h2><button type="button" aria-label="Clear layer selection" onClick={onClear} className="grid h-7 w-7 place-items-center rounded-lg text-[#968aa3] hover:bg-current/5"><X size={13}/></button></div><p className="mb-4 mt-2 shrink-0 text-[11px] leading-5 text-[#968aa3]">Edit shared properties, arrange your selection, or work with Northstar.</p><button type="button" aria-label="Ask Northstar about selected layers" onClick={onAsk} className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#8b73f8]/10 text-[11px] font-medium text-[#8068b5] hover:bg-[#8b73f8]/15 dark:text-[#c4b4f7]"><Sparkles size={13}/>Ask Northstar about selection</button><div className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}{targets.map(target=><div key={target.selector} className="flex h-10 items-center gap-2 rounded-lg border border-current/[.06] px-2"><button type="button" onClick={()=>onSelect(target.selector)} aria-label={'Edit properties of '+target.label} className="min-w-0 flex-1 truncate text-left text-[11px]">{target.label}</button><button type="button" aria-label={'Deselect '+target.label} onClick={()=>onRemove(target.selector)} className="grid h-6 w-6 shrink-0 place-items-center rounded text-[#968aa3] hover:bg-current/5"><X size={11}/></button></div>)}</div><p className="mt-4 shrink-0 text-[10px] leading-4 text-[#968aa3]">Your selection stays in place while you chat.</p></aside></>,document.body);
}

export function ScreenInspectorEmpty({title}:{title:string}) {
  return createPortal(<aside aria-label="Design properties" data-canvas-v2-direct-editing="true" onWheel={e=>e.stopPropagation()} className="fixed bottom-4 right-4 top-[90px] z-[1001] flex w-[280px] flex-col rounded-2xl border border-[#e2ddeb] bg-[#fcfbfe]/[.98] p-4 text-[#514a60] backdrop-blur-xl dark:border-white/[.08] dark:bg-[#1d1a24]/[.98] dark:text-[#eee7f5]"><h2 className="text-xs font-medium">Design</h2><div className="m-auto max-w-[190px] text-center"><MousePointer2 size={22} strokeWidth={1.3} className="mx-auto mb-4 text-[#a18adf]"/><p className="text-xs font-medium">Choose a layer</p><p className="mt-2 text-[11px] leading-5 text-[#968aa3]">Select something in {title} or use the layers on the left to edit its properties.</p></div></aside>,document.body);
}

export function ScreenLayerActions({frame,screenWidth,selectionRect,target,onEditText,onAsk,onDraw}:{frame:RefObject<HTMLIFrameElement|null>;screenWidth:number;selectionRect?:RefObject<CanvasV2ScreenFeedbackTarget['rect']|undefined>;target:CanvasV2ScreenFeedbackTarget;onEditText?:()=>void;onAsk?:()=>void;onDraw?:()=>void}){
  const toolbar=useRef<HTMLDivElement>(null);
  const anchor = useRef<{ key: string; position?: ReturnType<typeof resolveCanvasV2ContextToolbarPosition> }>({ key: '' });
  const key = JSON.stringify([target.nodeId, target.selector]);
  if (anchor.current.key !== key) anchor.current = { key };
  useLayoutEffect(()=>{
    let raf=0,last='';
    const place=()=>{
      const box=frame.current?.getBoundingClientRect(),element=toolbar.current;
      if(box&&element){
        const rect=selectionRect?.current??target.rect,scale=box.width/screenWidth;
        const left=Math.max(box.left,box.left+rect.x*scale),right=Math.min(box.right,box.left+(rect.x+rect.width)*scale),top=Math.max(box.top,box.top+rect.y*scale),bottom=Math.min(box.bottom,box.top+(rect.y+rect.height)*scale);
        const width=element.offsetWidth,height=element.offsetHeight;
        const minX=innerWidth>900?256:16, maxRight=Math.max(minX+width,innerWidth-312);
        const visible=right>Math.max(left,minX)&&left<maxRight&&bottom>top&&bottom>96&&top<innerHeight-92;
        // The app's move handle and Reset control are real interactive chrome.
        // A selection near the top of an app must not place its layer toolbar
        // over that header, including when retaining a screen-space anchor.
        const header=frame.current?.closest('[data-canvas-v2-interactive-screen]')?.querySelector('[data-canvas-v2-preview-chrome]')?.getBoundingClientRect();
        // Keep a small clearance too, rather than parking against the header
        // and immediately flipping sides on the next few pixels of panning.
        const headerClearance=header?{left:header.left-12,right:header.right+12,top:header.top-28,bottom:header.bottom+28}:undefined;
        const position=resolveCanvasV2ContextToolbarPosition({selection:{left,right,top,bottom},toolbar:{width,height},viewport:{left:minX,right:maxRight,top:96,bottom:innerHeight-92},obstacles:[],chrome:headerClearance?[headerClearance]:[],gap:28,previous:anchor.current.position});
        if(visible)anchor.current.position=position;
        const x=position.center-width/2,y=position.top;
        const signature=[x,y,visible].join('|');
        if(signature!==last){last=signature;Object.assign(element.style,{left:x+'px',top:y+'px',visibility:visible?'visible':'hidden'});}
      }
      raf=requestAnimationFrame(place);
    };place();return()=>cancelAnimationFrame(raf);
  },[frame,screenWidth,selectionRect,target]);
  return createPortal(<div ref={toolbar} role="toolbar" aria-label="Selected element tools" data-canvas-v2-direct-editing="true" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} className="fixed z-[1002] flex h-9 items-center gap-1 rounded-xl border border-[#ddd8e5] bg-white/[.98] px-1.5 text-[#514a60] shadow-lg dark:border-white/[.08] dark:bg-[#211d28]/[.98] dark:text-[#eee7f5]" style={{visibility:'hidden'}}>
    {onEditText&&<button type="button" aria-label="Edit selected text on canvas" onClick={onEditText} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] hover:bg-black/5 dark:hover:bg-white/10"><Type size={13}/>Edit text</button>}
    <button type="button" aria-label="Give feedback on selected element" onClick={onAsk} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] hover:bg-black/5 dark:hover:bg-white/10"><MessageSquare size={13}/>Feedback</button>
    <button type="button" aria-label="Draw feedback on selected element" onClick={onDraw} className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] hover:bg-black/5 dark:hover:bg-white/10"><Pencil size={13}/>Draw</button>
  </div>,document.body);
}

export function ScreenAppearanceEditor({target,position,layers,fontFamilies=[],docked=false,frame,screenWidth=1,canMove=false,canStyle=true,textValue,onSave,onMove,onAsk,onPreview,onReplace,onEditText,onToggle,screenTitle,sourceVersion,ready=true,selectionRect,onPreviewDraft,onDrawFeedback,onCancel,children}:{onPreviewDraft?:(draft:{text?:string;styles:Record<string,string>;attributes:Record<string,string>},signal:AbortSignal)=>Promise<void>;onDrawFeedback?:()=>void;children?:ReactNode;target:CanvasV2ScreenFeedbackTarget;position:{x:number;y:number};fontFamilies?:string[];docked?:boolean;frame?:RefObject<HTMLIFrameElement|null>;screenWidth?:number;canMove?:boolean;canStyle?:boolean;textValue?:string;onSave:(styles:Record<string,string>,text?:string,version?:string,attributes?:Record<string,string>)=>Promise<ScreenDirectResult>;onMove?:(x:number,y:number)=>Promise<ScreenDirectResult>;onAsk?:()=>void;onPreview?:()=>void;onReplace?:(file:File)=>void;onEditText?:()=>void;onToggle?:()=>void;screenTitle?:string;sourceVersion?:string;ready?:boolean;selectionRect?:RefObject<CanvasV2ScreenFeedbackTarget['rect']|undefined>;layers?:ScreenEditableLayer[];onSelectLayer?:(selector:string)=>void;onCancel:()=>void}) {
  const [changes,setChanges]=useState<Record<string,string>>({}),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [draftText,setDraftText]=useState(textValue);
  const replacementFile=useRef<HTMLInputElement>(null);
  const hasType=textValue!==undefined||!docked;
  const families=[target.styles['font-family'],...fontFamilies,'Arial, sans-serif','Georgia, serif','Verdana, sans-serif','Courier New, monospace'].filter((family,index,all)=>family&&all.findIndex(candidate=>candidate?.split(',')[0].replaceAll('\"','').trim().toLowerCase()===family.split(',')[0].replaceAll('\"','').trim().toLowerCase())===index);
  const savedText=useRef(textValue),pendingText=useRef<string|undefined>(undefined),ownCommit=useRef(false),lastAttempt=useRef('');
  const saveRef=useRef<()=>Promise<void>>(async()=>{});
  const pendingSave=useRef<Promise<ScreenDirectResult>|undefined>(undefined),saveFailure=useRef(''),dirty=useRef(false);
  const draft=useRef({styles:changes,text:draftText}),version=useRef(sourceVersion);draft.current={styles:changes,text:draftText};
  const changed=Object.keys(changes).length>0||draftText!==savedText.current;dirty.current=changed;
  useScreenEditFlush(saveRef,pendingSave,dirty,saveFailure);
  const layoutGroup=target.styles.display==='contents';
  const vector=target.namespace==='svg';
  const dimensions=target.tag==='rect'?['x','y','width','height','rx','ry']:target.tag==='circle'?['cx','cy','r']:target.tag==='ellipse'?['cx','cy','rx','ry']:target.tag==='line'?['x1','y1','x2','y2']:['text','tspan','image','use'].includes(target.tag)?['x','y']:[];
  const kind=layoutGroup?'Group':vector?(target.tag==='g'?'Group':'Vector part'):target.tag==='img'?'Image':target.tag==='button'?'Button':textValue!==undefined?'Text':'Element';
  const KindIcon=target.tag==='img'?ImagePlus:textValue!==undefined?Type:Palette;
  const busy=useRef(false);
  const previewDraft=useRef(onPreviewDraft);previewDraft.current=onPreviewDraft;
  const savedAppearance=useRef<{before?:string;after:string;styles:Record<string,string>;delivered:boolean}|undefined>(undefined);
  useLayoutEffect(()=>{const saved=savedAppearance.current;if(saved&&sourceVersion===saved.after)saved.delivered=true;},[sourceVersion,ready,changes]);
  useLayoutEffect(()=>{
    if(!ready||!previewDraft.current)return;
    const aborter=new AbortController();
    const styles=Object.fromEntries(Object.entries(changes).filter(([key])=>!key.startsWith('attr:')));
    const attributes=Object.fromEntries(Object.entries(changes).filter(([key])=>key.startsWith('attr:')).map(([key,value])=>[key.slice(5),value]));
    const text=draftText===savedText.current?undefined:draftText;
    // Send the validated draft before paint. The controller serializes source
    // patches and drops aborted drafts; waiting another frame here only adds
    // latency to typing and colour changes inside the live app.
    void previewDraft.current({text,styles,attributes},aborter.signal).catch(()=>{});
    return()=>aborter.abort();
  },[changes,draftText,sourceVersion,ready]);
  const set=(property:string,value:string)=>{setError('');setChanges(previous=>{const next={...previous};if(value===target.styles[property]&&target.styles[property+'-mixed']!=='true'&&!busy.current)delete next[property];else next[property]=value;return next})};
  const acknowledged=savedAppearance.current;
  // Source commits before the iframe returns fresh computed styles. Keep its
  // acknowledged values through that exact handoff, never across peer/history.
  const handoffStyles=acknowledged&&(sourceVersion===acknowledged.after&&!ready||!acknowledged.delivered&&sourceVersion===acknowledged.before)?acknowledged.styles:undefined;
  const value=(property:string)=>changes[property]??handoffStyles?.[property]??(property.startsWith('attr:')?target.attributes?.[property.slice(5)]:target.styles[property])??'';
  const save=async()=>{
    if(busy.current)return;
    const changes=draft.current.styles,text=draft.current.text!==savedText.current?draft.current.text:undefined;
    dirty.current=Object.keys(changes).length>0||text!==undefined;
    if(!Object.keys(changes).length&&text===undefined)return;
    const expectedVersion=version.current;
    const signature=JSON.stringify([expectedVersion,changes,text]);
    if(signature===lastAttempt.current)return;
    lastAttempt.current=signature;busy.current=true;ownCommit.current=true;pendingText.current=text;setSaving(true);setError('');saveFailure.current='';
    try{
      const styles=Object.fromEntries(Object.entries(changes).filter(([key])=>!key.startsWith('attr:'))),attributes=Object.fromEntries(Object.entries(changes).filter(([key])=>key.startsWith('attr:')).map(([key,value])=>[key.slice(5),value]));
      pendingSave.current=onSave(styles,text,expectedVersion,Object.keys(attributes).length?attributes:undefined);
      const result=await pendingSave.current;
      if(!result.ok){void previewDraft.current?.({styles:{},attributes:{}},new AbortController().signal).catch(()=>{});ownCommit.current=false;saveFailure.current=result.error||'This item changed. Select it again.';setError(saveFailure.current);}
      else{
        if(result.encoded){
          savedAppearance.current={before:expectedVersion,after:result.encoded,styles:{...changes},delivered:sourceVersion===result.encoded};
          version.current=result.encoded;
        }
        if(text!==undefined)savedText.current=text;
        const remaining=Object.fromEntries(Object.entries(draft.current.styles).filter(([property,value])=>changes[property]!==value));
        draft.current={styles:remaining,text:draft.current.text};
        dirty.current=Object.keys(remaining).length>0||draft.current.text!==savedText.current;
        setChanges(current=>Object.fromEntries(Object.entries(current).filter(([property,value])=>changes[property]!==value)));
      }
    }catch{void previewDraft.current?.({styles:{},attributes:{}},new AbortController().signal).catch(()=>{});ownCommit.current=false;saveFailure.current='This change could not be saved. Try again.';setError(saveFailure.current);}
    finally{pendingSave.current=undefined;busy.current=false;setSaving(false);}
  };
  saveRef.current=save;
  useLayoutEffect(()=>{
    version.current=sourceVersion;lastAttempt.current='';saveFailure.current='';setError('');
    if(ownCommit.current){
      setDraftText(current=>current===pendingText.current||current===savedText.current?textValue:current);
      ownCommit.current=false;
    }else if(dirty.current){
      // A delivered revision is a new baseline, not permission to discard
      // typing. Retain only the fields this person is actively changing;
      // their next save uses the current version and leaves other fields
      // alone. Same-field edits follow normal last-writer ordering, with
      // Undo based on the delivered peer value rather than the old source.
      const text=draft.current.text!==savedText.current?draft.current.text:textValue;
      draft.current={styles:draft.current.styles,text};
      setDraftText(text);
    }else{
      // History/peer revisions replace the inspector's baseline atomically.
      // Its unmount drain can run before state setters render; leaving these
      // refs on the old draft would save that draft over the restored source.
      draft.current={styles:{},text:textValue};dirty.current=false;
      setDraftText(textValue);setChanges({});
    }
    savedText.current=textValue;
  },[sourceVersion,textValue]);
  useEffect(()=>{
    if(!changed||saving||!ready)return;
    const timer=window.setTimeout(()=>void saveRef.current(),350);
    return()=>window.clearTimeout(timer);
  },[changes,draftText,changed,saving,sourceVersion,ready]);
  // Switching selection or returning to Preview flushes the last typed value.
  // It still crosses the host's current-source and ownership checks.
  const colourHex=(value:string)=>{if(/^#[0-9a-f]{6}$/i.test(value))return value;const channels=value.match(/^rgba?\(([^)]+)\)/)?.[1].match(/[\d.]+/g)?.slice(0,3).map(Number);return channels?.length===3?'#'+channels.map(channel=>Math.round(channel).toString(16).padStart(2,'0')).join(''):'#000000'};
  const inputClass='mt-1.5 w-full rounded-lg border border-[#e3dfe9] bg-[#f6f4f8] px-2.5 py-2 text-[13px] text-[#433b51] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none transition-colors focus:border-[#a492d5] focus:ring-2 focus:ring-[#9b87ef]/10 disabled:opacity-40 dark:border-white/[.07] dark:bg-white/[.035] dark:text-[#e5deec]';
  return <>{docked&&frame&&<ScreenLayerActions frame={frame} screenWidth={screenWidth} selectionRect={selectionRect} target={target} onEditText={onEditText} onAsk={()=>{void flushScreenDirectEdits().then(onAsk).catch(error=>setError(String(error)))}} onDraw={()=>{void flushScreenDirectEdits().then(onDrawFeedback).catch(error=>setError(String(error)))}}/>}{docked&&frame&&onMove&&onPreview&&<ScreenElementOutline nestedSelection={layers?.some(layer=>layer.parentSelector===target.selector)} target={target} frame={frame} screenWidth={screenWidth} canMove={canMove} selectionRect={selectionRect} onMove={onMove} onPreview={onPreview} onEditText={onEditText} onToggle={onToggle}/>}<Dialog.Root open modal={false} onOpenChange={open=>{if(!open&&!saving)onCancel()}}><Dialog.Portal>
    <Dialog.Content aria-describedby={undefined} onWheel={event=>event.stopPropagation()} onOpenAutoFocus={e=>{if(docked)e.preventDefault()}} onInteractOutside={e=>{if(docked)e.preventDefault()}} data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!saving)onCancel()}} onCloseAutoFocus={event=>event.preventDefault()} style={docked?{right:16,top:90,bottom:16}:{left:position.x,top:position.y}} className="fixed z-[1001] max-h-[calc(100vh-106px)] w-[280px] max-w-[calc(100vw-24px)] flex flex-col overflow-hidden rounded-[16px] border border-[#e2ddeb] bg-[#fcfbfe]/95 p-4 text-[#433b51] shadow-[0_16px_60px_#100b2325] backdrop-blur-xl outline-none dark:border-white/[.1] dark:bg-[#211d28]/[.98] dark:text-[#e5deec]">
      <div className="shrink-0" data-testid="screen-inspector-header">
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.14em] text-[#968aa3]"><span className="h-1 w-1 rounded-full bg-[#a694d5]"/> {docked?'Design':'Appearance'}</span><button aria-label="Close appearance editor" disabled={saving} onClick={onCancel} className="flex h-6 w-6 items-center justify-center rounded-md text-[#968aa3] transition-colors hover:bg-current/5 hover:text-[#785ec7]"><X size={14}/></button></div>
      <div className="mt-3 flex items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#9b87ef]/15 bg-[#9b87ef]/8 text-[#9984d5]"><KindIcon size={16} strokeWidth={1.6}/></div><div className="min-w-0"><Dialog.Title className="truncate text-[13px] font-medium">{docked?target.label||kind:'Appearance'}</Dialog.Title><p className="mt-0.5 truncate text-[11px] text-[#968aa3] dark:text-[#a99bb7]">{docked?kind:screenTitle??target.label}</p></div></div>
      {docked&&<div className="mt-3 flex items-center gap-1 border-b border-[#e3dfe9] pb-3 dark:border-white/[.06]"><button type="button" onClick={()=>{void flushScreenDirectEdits().then(onAsk).catch(error=>setError(error instanceof Error?error.message:'Save your changes before asking Northstar.'))}} aria-label="Ask Northstar about selection" className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#8b73f8]/8 text-[11px] font-medium text-[#8068b5] transition-colors hover:bg-[#8b73f8]/15 dark:text-[#c4b4f7]"><Sparkles size={13} strokeWidth={1.6}/>Ask Northstar</button></div>}
      {target.tag==='img'&&onReplace&&<><input ref={replacementFile} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Choose replacement image" onChange={e=>{const file=e.target.files?.[0];if(file)onReplace(file);e.target.value=''}}/><button type="button" onClick={()=>replacementFile.current?.click()} aria-label="Replace selected image" className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-current/10 text-xs"><ImagePlus size={14}/>Replace image</button></>}
      {!canStyle&&<p className="mt-3 text-xs leading-5 text-[#968aa3]">This element changes with the app. Ask Northstar to adjust its appearance.</p>}
      </div>
      <form className="-mx-4 mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onSubmit={event=>{event.preventDefault();void save()}}>
        {!layoutGroup&&<>
        {hasType&&target.tag!=='img'&&<details open className="space-y-3 border-b border-current/[.08] pb-5"><summary className="cursor-pointer text-[11px] font-medium">Typography</summary><div className="space-y-3 pt-2">
          {textValue!==undefined&&<label className="block text-xs">Text<textarea aria-label="Element text" value={draftText??''} onChange={e=>{const text=e.target.value;draft.current={...draft.current,text};dirty.current=true;setDraftText(text)}} maxLength={3000} rows={2} className={inputClass+' resize-y'}/>{onEditText&&<button type="button" onClick={onEditText} aria-label="Edit text on canvas" className="mt-2 flex items-center gap-1.5 text-[11px] text-[#968aa3] hover:text-[#b5a3e6]"><Pencil size={11}/>Highlight and edit on canvas</button>}</label>}
          <label className="block text-xs">Font family<StudioSelect label="Font family" display={target.styles['font-family-mixed']==='true'&&!changes['font-family']?'Mixed':undefined} value={value('font-family')} options={families.map(family=>({value:family,label:family.split(',')[0].replaceAll('"','')}))} previewFont disabled={!canStyle} onChange={family=>set('font-family',family)}/></label>
          {textValue!==undefined&&<label className="block text-xs">Text flow<StudioSelect label="Text flow" value={value('white-space')==='nowrap'?'nowrap':'pre-wrap'} options={[{value:'pre-wrap',label:'Wrap · auto height'},{value:'nowrap',label:'Single line'}]} onChange={next=>{set('white-space',next);set('overflow-wrap',next==='nowrap'?'normal':'anywhere')}}/></label>}
          <div className="grid grid-cols-2 gap-3"><label className="text-xs">Size<input aria-label="Text size" type="number" min={1} max={200} step="any" disabled={!canStyle} className={inputClass} placeholder="Mixed" value={target.styles['font-size-mixed']==='true'&&!changes['font-size']?'':parseFloat(value('font-size'))||''} onChange={e=>set('font-size',e.target.value+'px')}/></label><label className="text-xs">Weight<StudioSelect label="Text weight" display={target.styles['font-weight-mixed']==='true'&&!changes['font-weight']?'Mixed':undefined} value={value('font-weight')} options={['100','200','300','400','500','600','700','800','900'].map(weight=>({value:weight,label:({'100':'Thin','200':'Extra light','300':'Light','400':'Regular','500':'Medium','600':'Semibold','700':'Bold','800':'Extra bold','900':'Black'} as Record<string,string>)[weight]}))} disabled={!canStyle} onChange={weight=>set('font-weight',weight)}/></label></div>
          <label className="block text-xs">Text colour<StudioColour label="Text colour" value={value(vector?'fill':'color')} display={changes[vector?'fill':'color']??handoffStyles?.[vector?'fill':'color']??(target.styles['color-mixed']==='true'?'Mixed':colourHex(value(vector?'fill':'color')).toUpperCase())} disabled={!canStyle} inputClass={inputClass} onChange={colour=>set(vector?'fill':'color',colour)}/></label>
          <div className="flex gap-1" role="group" aria-label="Text alignment">{['left','center','right'].map(align=><button key={align} type="button" aria-label={'Align text '+align} aria-pressed={value('text-align')===align} disabled={!canStyle} onClick={()=>set('text-align',align)} className="h-8 flex-1 rounded-lg border border-current/10 text-xs capitalize aria-pressed:bg-[#8b73f8]/15">{align==='left'?<AlignLeft size={14} className="mx-auto"/>:align==='center'?<AlignCenter size={14} className="mx-auto"/>:<AlignRight size={14} className="mx-auto"/>}</button>)}<button type="button" aria-label="Italic text" aria-pressed={value('font-style')==='italic'} disabled={!canStyle} onClick={()=>set('font-style',value('font-style')==='italic'?'normal':'italic')} className="h-8 w-9 rounded-lg border border-current/10 text-xs italic aria-pressed:bg-[#8b73f8]/15">I</button></div>
          <details><summary className="cursor-pointer text-xs text-[#968aa3]">Spacing</summary><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs">Letters (px)<input aria-label="Letter spacing" className={inputClass} type="number" min={-20} max={100} step="0.1" disabled={!canStyle} value={parseFloat(value('letter-spacing'))||0} onChange={e=>set('letter-spacing',e.target.value+'px')}/></label><label className="text-xs">Line height<StudioSelect label="Line height" value={value('line-height')||'normal'} options={[{value:target.styles['line-height']||'normal',label:'Current ('+(target.styles['line-height']||'normal')+')'},{value:'normal',label:'Default'},...['0.8','1','1.1','1.2','1.4','1.5','1.8','2'].map(n=>({value:n,label:n}))].filter((option,index,all)=>all.findIndex(item=>item.value===option.value)===index)} disabled={!canStyle} onChange={height=>set('line-height',height)}/></label></div></details>
        </div></details>}
        {docked&&canMove&&<details open className="space-y-3 border-b border-current/[.08] pb-5"><summary className="cursor-pointer text-[11px] font-medium">Position</summary><div className="space-y-3 pt-2"><p className="text-xs leading-5 text-[#968aa3]">Drag on the canvas, or set an offset below. Arrow keys nudge; Shift moves by 10. The surrounding layout stays in place.</p><div className="grid grid-cols-2 gap-3">{['X','Y'].map((axis,index)=>{const parts=value('translate')==='none'||!value('translate')?['0','0']:value('translate').split(' ');return <label key={axis} className="text-xs">{axis} offset<input aria-label={axis+' position'} type="number" step="1" min={-8192} max={8192} disabled={!canMove} className={inputClass} value={parseFloat(parts[index]??'0')||0} onChange={e=>{const xy=parts.map(part=>parseFloat(part)||0);xy[index]=Number(e.target.value);set('translate',xy[0]+'px '+(xy[1]??0)+'px')}}/></label>})}</div>{vector&&<><div className="grid grid-cols-2 gap-3"><label className="text-xs">Rotation<input aria-label="Vector rotation" type="number" step="1" value={parseFloat(value('rotate'))||0} disabled={!canMove} className={inputClass} onChange={e=>set('rotate',e.target.value+'deg')}/></label><label className="text-xs">Scale<input aria-label="Vector scale" type="number" min={0.01} max={100} step="0.05" value={parseFloat(value('scale'))||1} disabled={!canMove} className={inputClass} onChange={e=>set('scale',e.target.value)}/></label></div>{dimensions.length>0&&<details open><summary className="cursor-pointer text-xs text-[#968aa3]">Shape dimensions</summary><div className="mt-3 grid grid-cols-2 gap-3">{dimensions.map(property=><label key={property} className="text-xs">{({cx:'Center X',cy:'Center Y',r:'Radius',rx:'Radius X',ry:'Radius Y'} as Record<string,string>)[property]??property}<input aria-label={'Vector '+property} type="number" step="any" disabled={!canMove} value={parseFloat(value('attr:'+property))||0} className={inputClass} onChange={e=>set('attr:'+property,e.target.value)}/></label>)}</div></details>}</>}{!canMove&&<p className="text-xs leading-5 text-[#968aa3]">Ask Northstar to adjust this element and its behaviour together.</p>}</div></details>}
        {!vector&&canStyle&&<details open className="space-y-3 border-b border-current/[.08] pb-5"><summary className="cursor-pointer text-[11px] font-medium">Layout</summary><div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">{['width','height'].map(property=><StudioSize key={property} label={property==='width'?'Width':'Height'} value={value(property)} disabled={!canStyle} inputClass={inputClass} onChange={next=>set(property,next)}/>)}</div>
          <details><summary className="cursor-pointer text-xs text-[#968aa3]">Size limits</summary><div className="mt-3 grid grid-cols-2 gap-3">{['min-width','max-width','min-height','max-height'].map(property=><StudioSize key={property} label={property.replace('-',' ')} value={value(property)} disabled={!canStyle} inputClass={inputClass} onChange={next=>set(property,next)}/>)}</div></details>
          <label className="block text-xs">Layout<StudioSelect label="Element layout" value={value('display')} options={[{value:'block',label:'Flow'},{value:'flex',label:'Stack / row'},{value:'grid',label:'Grid'},{value:'inline-block',label:'Fit content'}]} disabled={!canStyle} onChange={next=>set('display',next)}/></label>
          {value('display').includes('flex')&&<label className="block text-xs">Direction<StudioSelect label="Layout direction" value={value('flex-direction')} options={[{value:'column',label:'Vertical stack'},{value:'row',label:'Horizontal row'}]} disabled={!canStyle} onChange={next=>set('flex-direction',next)}/></label>}
          {value('display').includes('grid')&&<label className="block text-xs">Columns<StudioSelect label="Grid columns" value={value('grid-template-columns')} display={/^repeat\((\d+)/.exec(value('grid-template-columns'))?.[1]??'Current layout'} options={[1,2,3,4,5,6].map(count=>({value:'repeat('+count+', minmax(0, 1fr))',label:count+(count===1?' column':' columns')}))} disabled={!canStyle} onChange={next=>set('grid-template-columns',next)}/></label>}
          {/(?:flex|grid)/.test(value('display'))&&<><div className="grid grid-cols-2 gap-3"><StudioSize label="Row gap" value={value('row-gap')} disabled={!canStyle} inputClass={inputClass} onChange={next=>set('row-gap',next)}/><StudioSize label="Column gap" value={value('column-gap')} disabled={!canStyle} inputClass={inputClass} onChange={next=>set('column-gap',next)}/></div><label className="block text-xs">Align items<StudioSelect label="Align layout items" value={value('align-items')} options={['start','center','end','stretch'].map(item=>({value:item,label:item[0].toUpperCase()+item.slice(1)}))} disabled={!canStyle} onChange={next=>set('align-items',next)}/></label><label className="block text-xs">Distribution<StudioSelect label="Distribute layout items" value={value('justify-content')} options={['start','center','end','space-between','space-around','space-evenly'].map(item=>({value:item,label:item.replaceAll('-',' ')}))} disabled={!canStyle} onChange={next=>set('justify-content',next)}/></label></>}
          <details open><summary className="cursor-pointer text-xs text-[#968aa3]">Padding</summary><div className="mt-3 grid grid-cols-2 gap-3">{['top','right','bottom','left'].map(side=><StudioSize key={side} label={'Padding '+side} value={value('padding-'+side)} disabled={!canStyle} inputClass={inputClass} onChange={next=>set('padding-'+side,next)}/>)}</div></details>
          <p className="text-[10px] leading-4 text-[#968aa3]">Relative sizes follow the parent. Auto lets content and the surrounding layout determine the size.</p>
        </div></details>}
        {canStyle&&<details open className="space-y-3 pb-3"><summary className="cursor-pointer text-[11px] font-medium">{vector?'Fill & stroke':target.tag==='img'?'Image & appearance':'Appearance'}</summary><div className="space-y-3 pt-2">
          {target.tag==='img'&&<label className="block text-xs">Image fit<StudioSelect label="Image fit" value={value('object-fit')||'fill'} options={[{value:'cover',label:'Fill the frame'},{value:'contain',label:'Fit whole image'},{value:'fill',label:'Stretch'},{value:'none',label:'Original size'},{value:'scale-down',label:'Scale down'}]} disabled={!canStyle} onChange={fit=>set('object-fit',fit)}/></label>}
          {target.tag==='img'&&<details><summary className="cursor-pointer text-xs text-[#968aa3]">Crop position</summary><div className="mt-3 space-y-3">{['Horizontal','Vertical'].map((axis,index)=>{const parts=value('object-position').split(' ');return <label key={axis} className="block text-xs">{axis}<input aria-label={axis+' crop position'} type="range" min={0} max={100} disabled={!canStyle} className="mt-2 w-full accent-[#8b73f8]" value={parseFloat(parts[index]??'50')||0} onChange={e=>{const xy=parts.map(part=>parseFloat(part)||0);xy[index]=Number(e.target.value);set('object-position',(xy[0]??50)+'% '+(xy[1]??50)+'%')}}/></label>})}</div></details>}
          {vector&&<><label className="block text-xs">Fill<StudioColour label="Vector fill" value={value('fill')} display={changes.fill??(/^rgb\(/.test(value('fill'))?colourHex(value('fill')).toUpperCase():value('fill'))} disabled={!canStyle} inputClass={inputClass} onChange={next=>set('fill',next)}/></label><label className="block text-xs">Stroke<StudioColour label="Vector stroke" value={value('stroke')} display={changes.stroke??(/^rgb\(/.test(value('stroke'))?colourHex(value('stroke')).toUpperCase():value('stroke'))} disabled={!canStyle} inputClass={inputClass} onChange={next=>set('stroke',next)}/></label><label className="block text-xs">Stroke width<input aria-label="Vector stroke width" type="number" min={0} max={500} step="0.5" value={parseFloat(value('stroke-width'))||0} disabled={!canStyle} className={inputClass} onChange={e=>set('stroke-width',e.target.value+'px')}/></label></>}
          {!vector&&<label className="block text-xs">Background<StudioColour label="Background colour" value={value('background-color')} display={changes['background-color']??(['transparent','rgba(0, 0, 0, 0)'].includes(value('background-color'))?'':colourHex(value('background-color')).toUpperCase())} disabled={!canStyle} inputClass={inputClass} onChange={colour=>set('background-color',colour)}/></label>}
          {!vector&&<label className="block text-xs">Corners (px)<input aria-label="Corner radius" type="number" min={0} max={500} step="any" disabled={!canStyle} className={inputClass} value={Number.isFinite(parseFloat(value('border-radius')))?parseFloat(value('border-radius')):''} onChange={e=>set('border-radius',e.target.value+'px')}/></label>}
          <label className="block text-xs">Opacity<input aria-label="Element opacity" type="range" min={0} max={1} step={0.01} value={value('opacity')||'1'} disabled={!canStyle} onChange={e=>set('opacity',e.target.value)} className="mt-2 w-full accent-[#8b73f8]"/></label>
          <label className="flex items-center justify-between text-xs">Visible<button type="button" role="switch" aria-label="Layer visible" aria-checked={value('visibility')!=='hidden'} disabled={!canStyle} onClick={()=>set('visibility',value('visibility')==='hidden'?'visible':'hidden')} className="relative h-5 w-9 rounded-full bg-black/10 aria-checked:bg-[#8b73f8] dark:bg-white/10"><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{left:value('visibility')==='hidden'?2:18}}/></button></label>
        </div></details>}
        </>}{children}
        {error&&<p role="alert" className="text-xs leading-5 text-[#7d475d] dark:text-[#e1b3c4]">{error}</p>}
      </form>
        <div className="-mx-4 mt-3 flex min-h-10 shrink-0 items-center justify-between border-t border-[#e3dfe9] bg-[#fcfbfe] px-4 pb-3 pt-3 dark:border-white/[.06] dark:bg-[#211d28]"><span role="status" aria-live="polite" className="flex items-center gap-1.5 text-[10px] text-[#968aa3]">{!saving&&!changed&&!error&&<Check size={11}/>} {saving?'Saving…':error?'Could not save':changed?'Editing…':'All changes saved'}</span>{error&&<button type="button" onClick={()=>{lastAttempt.current='';void saveRef.current()}} className="rounded-md px-2 text-[11px] text-[#b5a3e6]">Retry</button>}<span className="text-[10px] text-[#968aa3]/70">Changes save automatically</span></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root></>;
}

export function ScreenTextEditor({target,html,sourceVersion,frame,screenWidth,fonts,onSave,onCancel,selectionRect}:{target:CanvasV2ScreenFeedbackTarget;html:string;sourceVersion:string;frame:RefObject<HTMLIFrameElement|null>;screenWidth:number;fonts:CanvasV2EditorFonts;onSave:(html:string,version?:string)=>Promise<ScreenDirectResult>;selectionRect?:RefObject<CanvasV2ScreenFeedbackTarget['rect']|undefined>;onCancel:()=>void}) {
  const editor=useRef<HTMLDivElement>(null),[editable,setEditable]=useState<HTMLDivElement|null>(null),[tick,setTick]=useState(0),[error,setError]=useState('');
  const [inlineFontRules,setInlineFontRules]=useState('');
  const version=useRef(sourceVersion),initialized=useRef(false);
  const busy=useRef(false),saved=useRef(html),ownCommit=useRef(false),saveAgain=useRef(false),lastAttempt=useRef('');
  const saveRef=useRef<()=>Promise<void>>(async()=>{});
  const pendingSave=useRef<Promise<ScreenDirectResult>|undefined>(undefined),saveFailure=useRef(''),dirty=useRef(false);
  dirty.current=!!editor.current&&editor.current.innerHTML!==saved.current;
  useScreenEditFlush(saveRef,pendingSave,dirty,saveFailure);
  const bindEditor=useCallback((node:HTMLDivElement|null)=>{if(node)editor.current=node;setEditable(node)},[]);
  const styles=target.styles,background=styles['background-color']==='rgba(0, 0, 0, 0)'?'#fff':styles['background-color']||'#fff';
  const flex=styles.display?.includes('flex'),horizontal=flex&&styles['flex-direction']!=='column'?styles['justify-content']:flex?styles['align-items']:undefined;
  const textAlign=horizontal==='center'?'center':['end','flex-end'].includes(horizontal??'')?'right':styles['text-align'] as 'left';
  const channels=background.match(/[\d.]+/g)?.slice(0,3).map(Number),dark=channels?.length===3&&channels.reduce((a,b)=>a+b,0)<384;
  const transparent=styles.color==='transparent'||/rgba\([^)]*,\s*0\s*\)$|\/\s*0\s*\)$/.test(styles.color);
  const colour=transparent?(dark?'#f4eff8':'#272131'):styles.color;
  const save=async()=>{
    if(busy.current){saveAgain.current=true;return;}
    const node=editor.current;if(!node)return;
    let markup:string;try{markup=screenInlineTextMarkup(node.innerHTML,new DOMParser())}catch(e){saveFailure.current=e instanceof Error?e.message:'Choose native text formatting.';setError(saveFailure.current);return;}
    dirty.current=markup!==saved.current;
    if(markup===saved.current||markup===lastAttempt.current)return;
    busy.current=true;ownCommit.current=true;lastAttempt.current=markup;saveFailure.current='';
    try{pendingSave.current=onSave(markup,version.current);const result=await pendingSave.current;if(result.ok){if(result.encoded)version.current=result.encoded;saved.current=markup;dirty.current=editor.current?.innerHTML!==markup;setError('')}else{ownCommit.current=false;saveFailure.current=result.error||'This text changed. Select it again.';setError(saveFailure.current)}}catch{ownCommit.current=false;saveFailure.current='The text could not be saved. Try again.';setError(saveFailure.current)}finally{pendingSave.current=undefined;busy.current=false;if(saveAgain.current){saveAgain.current=false;setTick(value=>value+1)}}
  };
  saveRef.current=save;
  useLayoutEffect(()=>{
    version.current=sourceVersion;const node=editor.current;if(!node)return;
    if(!initialized.current){initialized.current=true;node.innerHTML=html;saved.current=html;dirty.current=false;return;}
    if(ownCommit.current){ownCommit.current=false;saved.current=html;return;}
    // The inline editor owns its unsaved markup, just as the inspector owns
    // its pending fields. A peer revision updates the save baseline without
    // replacing local typing or its DOM selection.
    const pending=node.innerHTML!==saved.current;
    if(!pending)node.innerHTML=html;
    saved.current=html;dirty.current=node.innerHTML!==html;lastAttempt.current='';saveFailure.current='';setError('');
    if(pending)setTick(value=>value+1);
  },[html,sourceVersion]);
  useLayoutEffect(()=>{const node=editor.current;if(!node)return;const refresh=()=>setInlineFontRules(canvasV2EditorInlineFontRules(node,fonts));refresh();const observer=new MutationObserver(refresh);observer.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});return()=>observer.disconnect()},[fonts,html,sourceVersion]);
  useEffect(()=>{const node=editor.current;if(!node)return;node.focus({preventScroll:true});const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(node);selection?.removeAllRanges();selection?.addRange(range);},[]);
  useEffect(()=>{if(!tick)return;const timer=window.setTimeout(()=>void saveRef.current(),300);return()=>window.clearTimeout(timer)},[tick]);
  useLayoutEffect(()=>{
    let raf=0;
    const place=()=>{const bounds=frame.current?.getBoundingClientRect(),node=editor.current;if(bounds&&node){const scale=bounds.width/screenWidth,rect=selectionRect?.current??target.rect,left=bounds.x+rect.x*scale,top=bounds.y+rect.y*scale;Object.assign(node.style,{left:left+'px',top:top+'px',width:rect.width+'px',transform:'scale('+scale+')',clipPath:'inset('+Math.max(0,bounds.top-top)/scale+'px '+Math.max(0,left+node.offsetWidth*scale-bounds.right)/scale+'px '+Math.max(0,top+node.offsetHeight*scale-bounds.bottom)/scale+'px '+Math.max(0,bounds.left-left)/scale+'px)'});if(target.textRect){const range=document.createRange();range.selectNodeContents(node);const glyph=range.getBoundingClientRect(),actual=(glyph.top-top)/scale,desired=target.textRect.y-target.rect.y,delta=desired-actual;if(glyph.height>0&&Math.abs(delta)>.25)node.style.paddingTop=Math.max(0,(parseFloat(node.style.paddingTop)||0)+delta)+'px'}}raf=requestAnimationFrame(place)};
    place();return()=>cancelAnimationFrame(raf);
  },[frame,screenWidth,target.rect,target.textRect,selectionRect]);
  const finish=()=>{void flushScreenDirectEdits().then(onCancel).catch(error=>setError(error instanceof Error?error.message:'Save your changes before finishing.'))};
  return createPortal(<><style>{fonts.css+inlineFontRules}</style><div ref={bindEditor} data-canvas-v2-editor-font-scope={fonts.scope} data-canvas-v2-direct-editing="true" role="textbox" aria-label="Screen text" aria-multiline contentEditable suppressContentEditableWarning onInput={()=>{lastAttempt.current='';setTick(value=>value+1)}} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onPaste={e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}} onBlur={e=>{if(!(e.relatedTarget as Element|null)?.closest('[data-canvas-v2-rich-toolbar]'))finish()}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'||e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish()}else if(e.key==='Enter'){e.preventDefault();document.execCommand('insertLineBreak')}}} className="fixed z-[1002] origin-top-left select-text [&_*]:select-text whitespace-pre-wrap rounded-[3px] p-0 outline outline-2 outline-[#9b87ef] shadow-[0_0_0_4px_#9b87ef15] [overflow-wrap:anywhere]" style={{boxSizing:'border-box',minHeight:target.rect.height,paddingTop:styles['padding-top'],paddingRight:styles['padding-right'],paddingBottom:styles['padding-bottom'],paddingLeft:styles['padding-left'],borderStyle:'solid',borderColor:'transparent',borderTopWidth:styles['border-top-width']||0,borderRightWidth:styles['border-right-width']||0,borderBottomWidth:styles['border-bottom-width']||0,borderLeftWidth:styles['border-left-width']||0,borderRadius:styles['border-radius'],backgroundClip:'padding-box',whiteSpace:styles['white-space'] as 'normal',direction:styles.direction as 'ltr',color:colour,caretColor:colour,backgroundColor:background,fontFamily:canvasV2EditorFontFamily(styles['font-family']||'',fonts.aliases),fontSize:styles['font-size'],fontWeight:styles['font-weight'],fontStyle:styles['font-style'],fontVariant:styles['font-variant'],fontFeatureSettings:styles['font-feature-settings'],fontKerning:styles['font-kerning'] as 'auto',textTransform:styles['text-transform'] as 'none',lineHeight:styles['line-height'],letterSpacing:styles['letter-spacing'],textAlign}}/>{editable&&<CanvasV2RichTextToolbar editable={editable} finish={finish} inlineOnly/>}{error&&<div role="alert" className="fixed bottom-20 right-5 z-[1004] max-w-72 rounded-xl bg-[#211d28] p-3 text-xs text-[#e1b3c4]">{error}</div>}</>,document.body);
}
