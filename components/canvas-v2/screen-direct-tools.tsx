'use client';
import { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X, Pencil, Trash2, ArrowUp, ArrowDown, Plus, SlidersHorizontal } from 'lucide-react';
import type { CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import type { ScreenDirectOptions, ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';

export function ScreenDirectMenu({options,scale,onClose,onEdit,onAppearance,onRemove,onMove,onAdd}:{options:ScreenDirectOptions;scale:number;onClose:()=>void;onEdit:(target:CanvasV2ScreenFeedbackTarget)=>void;onAppearance:()=>void;onRemove:(target:CanvasV2ScreenFeedbackTarget)=>void;onMove:(direction:'up'|'down')=>void;onAdd:(position:'before'|'after')=>void}) {
  const itemClass='flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]';
  return <DropdownMenu.Root open modal={false} onOpenChange={open=>{if(!open)onClose()}}>
    <DropdownMenu.Trigger asChild><button aria-label="Screen editing options" tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" style={{left:options.x*scale,top:options.y*scale}}/></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} aria-label="Edit screen content" align="start" sideOffset={5} onCloseAutoFocus={event=>event.preventDefault()} className="z-[1000] min-w-[180px] rounded-[14px] border border-[#e2ddeb] bg-[#fcfbfe] p-1.5 text-[13px] text-[#433b51] shadow-[0_10px_35px_#24153625] dark:border-white/[.09] dark:bg-[#231f2c] dark:text-[#e5deec]">
      {options.text && <DropdownMenu.Item onSelect={()=>onEdit(options.text!)} className="flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]"><Pencil size={15} strokeWidth={1.6}/>{options.textNeedsAgent?'Edit with Northstar':'Edit text'}</DropdownMenu.Item>}
      {options.appearance && <DropdownMenu.Item onSelect={onAppearance} className={itemClass}><SlidersHorizontal size={15} strokeWidth={1.6}/>{options.appearanceNeedsAgent?'Style with Northstar':'Appearance'}</DropdownMenu.Item>}
      {options.section && <>
        {options.text && <DropdownMenu.Separator className="mx-2 my-1 h-px bg-[#433b51]/10 dark:bg-white/[.08]"/>}
        <DropdownMenu.Item onSelect={()=>onAdd('before')} className={itemClass}><Plus size={15} strokeWidth={1.6}/>Add section above</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={()=>onAdd('after')} className={itemClass}><Plus size={15} strokeWidth={1.6}/>Add section below</DropdownMenu.Item>
        {(options.moves?.up || options.moves?.down) && <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className={itemClass}><ArrowUp size={15} strokeWidth={1.6}/>Move section<span aria-hidden="true" className="ml-auto text-[#968aa3]">›</span></DropdownMenu.SubTrigger>
          <DropdownMenu.Portal><DropdownMenu.SubContent data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} className="z-[1001] min-w-[170px] rounded-[14px] border border-[#e2ddeb] bg-[#fcfbfe] p-1.5 text-[13px] text-[#433b51] shadow-[0_10px_35px_#24153625] dark:border-white/[.09] dark:bg-[#231f2c] dark:text-[#e5deec]" sideOffset={6}>
            {options.moves.up && <DropdownMenu.Item onSelect={()=>onMove('up')} className={itemClass}><ArrowUp size={15} strokeWidth={1.6}/>{options.moveNeedsAgent?'Up with Northstar':'Up'}</DropdownMenu.Item>}
            {options.moves.down && <DropdownMenu.Item onSelect={()=>onMove('down')} className={itemClass}><ArrowDown size={15} strokeWidth={1.6}/>{options.moveNeedsAgent?'Down with Northstar':'Down'}</DropdownMenu.Item>}
          </DropdownMenu.SubContent></DropdownMenu.Portal>
        </DropdownMenu.Sub>}
        <DropdownMenu.Separator className="mx-2 my-1 h-px bg-[#433b51]/10 dark:bg-white/[.08]"/>
      </>}
      {options.section && <DropdownMenu.Item onSelect={()=>onRemove(options.section!)} className="flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2.5 outline-none data-[highlighted]:bg-[#f0ebf8] dark:data-[highlighted]:bg-white/[.06]"><Trash2 size={15} strokeWidth={1.6}/>{options.sectionNeedsAgent?'Remove with Northstar':'Remove section'}</DropdownMenu.Item>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function ScreenAppearanceEditor({target,position,onSave,onCancel}:{target:CanvasV2ScreenFeedbackTarget;position:{x:number;y:number};onSave:(styles:Record<string,string>)=>Promise<ScreenDirectResult>;onCancel:()=>void}) {
  const [changes,setChanges]=useState<Record<string,string>>({}),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const busy=useRef(false);
  const set=(property:string,value:string)=>{setError('');setChanges(previous=>{const next={...previous};if(value===target.styles[property])delete next[property];else next[property]=value;return next})};
  const value=(property:string)=>changes[property]??target.styles[property]??'';
  const save=async()=>{
    if(busy.current)return;
    if(!Object.keys(changes).length){onCancel();return;}
    busy.current=true;setSaving(true);setError('');
    try{const result=await onSave(changes);if(!result.ok)setError(result.error||'This item changed. Select it again.')}catch{setError('The appearance could not be saved. Try again.')}finally{busy.current=false;setSaving(false)}
  };
  const colourHex=(value:string)=>{if(/^#[0-9a-f]{6}$/i.test(value))return value;const channels=value.match(/^rgba?\(([^)]+)\)/)?.[1].match(/[\d.]+/g)?.slice(0,3).map(Number);return channels?.length===3?'#'+channels.map(channel=>Math.round(channel).toString(16).padStart(2,'0')).join(''):'#000000'};
  const inputClass='mt-1.5 w-full rounded-lg border border-[#ded7e8] bg-transparent px-2.5 py-2 text-[13px] outline-none focus:border-[#8b73f8] dark:border-white/[.12]';
  return <Dialog.Root open modal={false} onOpenChange={open=>{if(!open&&!saving)onCancel()}}><Dialog.Portal>
    <Dialog.Content aria-describedby={undefined} data-canvas-v2-direct-editing="true" onPointerDown={event=>event.stopPropagation()} onPointerUp={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!saving)onCancel()}} onCloseAutoFocus={event=>event.preventDefault()} style={{left:position.x,top:position.y}} className="fixed z-[1001] max-h-[calc(100vh-24px)] w-[300px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[16px] border border-[#e2ddeb] bg-[#fcfbfe] p-5 text-[#433b51] shadow-[0_12px_40px_#24153630] outline-none dark:border-white/[.1] dark:bg-[#231f2c] dark:text-[#e5deec]">
      <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-sm font-semibold">Appearance</Dialog.Title><p className="mt-1 line-clamp-1 max-w-[225px] text-xs text-[#968aa3] dark:text-[#a99bb7]">{target.label}</p></div><button aria-label="Close appearance editor" disabled={saving} onClick={onCancel} className="text-[#968aa3]"><X size={16}/></button></div>
      <form className="mt-5 space-y-3" onSubmit={event=>{event.preventDefault();void save()}}>
        <label className="block text-xs">Text colour<div className="flex items-center gap-2"><input aria-label="Choose text colour" type="color" disabled={saving} value={colourHex(value('color'))} onChange={event=>set('color',event.target.value)} className="mt-1.5 h-9 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent"/><input aria-label="Text colour" disabled={saving} className={inputClass} value={value('color')} onChange={event=>set('color',event.target.value)}/></div></label>
        <label className="block text-xs">Background<div className="flex items-center gap-2"><input aria-label="Choose background colour" type="color" disabled={saving} value={colourHex(value('background-color'))} onChange={event=>set('background-color',event.target.value)} className="mt-1.5 h-9 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent"/><input aria-label="Background colour" disabled={saving} className={inputClass} value={value('background-color')} onChange={event=>set('background-color',event.target.value)}/></div></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs">Text size (px)<input aria-label="Text size" type="number" min={1} max={200} step="any" disabled={saving} className={inputClass} value={parseFloat(value('font-size'))||''} onChange={event=>set('font-size',event.target.value+'px')}/></label><label className="text-xs">Corners (px)<input aria-label="Corner radius" type="number" min={0} max={500} step="any" disabled={saving} className={inputClass} value={Number.isFinite(parseFloat(value('border-radius')))?parseFloat(value('border-radius')):''} onChange={event=>set('border-radius',event.target.value+'px')}/></label></div>
        <label className="block text-xs">Text weight<select aria-label="Text weight" disabled={saving} className={inputClass} value={value('font-weight')} onChange={event=>set('font-weight',event.target.value)}>{['100','200','300','400','500','600','700','800','900'].map(weight=><option key={weight} value={weight}>{{'100':'Thin','200':'Extra light','300':'Light','400':'Regular','500':'Medium','600':'Semibold','700':'Bold','800':'Extra bold','900':'Black'}[weight]}</option>)}</select></label>
        {error&&<p role="alert" className="text-xs leading-5 text-[#7d475d] dark:text-[#e1b3c4]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={saving} onClick={onCancel} className="rounded-lg px-3 py-2 text-xs text-[#968aa3]">Cancel</button><button type="submit" disabled={saving||!Object.keys(changes).length} className="rounded-lg bg-[#785ec7] px-4 py-2 text-xs font-medium text-white disabled:opacity-40">Apply</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function ScreenTextEditor({target,value,scale,fontCss,onSave,onCancel}:{target:CanvasV2ScreenFeedbackTarget;value:string;scale:number;fontCss:string;onSave:(text:string)=>Promise<ScreenDirectResult>;onCancel:()=>void}) {
  const [draft,setDraft]=useState(value),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null),container=useRef<HTMLDivElement>(null),busy=useRef(false),cancelled=useRef(false);
  const cancel=()=>{cancelled.current=true;onCancel()};
  useEffect(()=>{input.current?.focus({preventScroll:true});input.current?.select()},[]);
  const save=async()=>{
    if(busy.current||cancelled.current)return;
    if(draft===value){cancel();return;}
    busy.current=true;setSaving(true);setError('');
    try{const result=await onSave(draft);if(!result.ok)setError(result.error||'This text changed. Select it again.')}catch{setError('The text could not be saved. Try again.')}finally{busy.current=false;setSaving(false)}
  };
  const rect=target.rect, styles=target.styles;
  const background=styles['background-color']==='rgba(0, 0, 0, 0)'?'#fff':styles['background-color']||'#fff';
  const backgroundChannels=background.match(/[\d.]+/g)?.slice(0,3).map(Number);
  const dark=backgroundChannels?.length===3 && backgroundChannels.reduce((sum,value)=>sum+value,0)<384;
  const transparent=styles.color==='transparent'||/rgba\([^)]*,\s*0\s*\)$|\/\s*0\s*\)$/.test(styles.color);
  // Gradient headings can have a transparent computed text color. The editor
  // stays readable without changing the product's gradient or text styling.
  const color=transparent?(dark?'#f4eff8':'#272131'):styles.color||(dark?'#f4eff8':'#272131');

  return <div ref={container} data-canvas-v2-direct-editing="true" role="group" aria-label="Edit screen text" className="absolute z-20" style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale}} onPointerDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
    <style>{fontCss}</style>
    <textarea ref={input} aria-label="Screen text" maxLength={3000} value={draft} disabled={saving} onChange={event=>setDraft(event.target.value)} onBlur={event=>{if(!container.current?.contains(event.relatedTarget as Node|null))void save()}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cancel()}else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save()}}} className="block w-full resize-y rounded-[5px] border-0 p-0 outline outline-2 outline-[#8b73f8] shadow-[0_0_0_4px_#8b73f81a]" style={{height:Math.max(24,rect.height*scale),color,caretColor:color,backgroundColor:background,fontFamily:styles['font-family'],fontSize:parseFloat(styles['font-size'])*scale,fontWeight:styles['font-weight'],fontStyle:styles['font-style'],fontVariant:styles['font-variant'],fontFeatureSettings:styles['font-feature-settings'],fontKerning:styles['font-kerning'] as 'auto',textTransform:styles['text-transform'] as 'none',lineHeight:styles['line-height']==='normal'?'normal':parseFloat(styles['line-height'])*scale+'px',letterSpacing:styles['letter-spacing']==='normal'?'normal':parseFloat(styles['letter-spacing'])*scale+'px',textAlign:styles['text-align'] as 'left'|'center'|'right'}}/>
    <div className="mt-2 flex w-fit items-center gap-0.5 rounded-[10px] border border-[#e2ddeb] bg-[#fcfbfe] p-1 shadow-[0_5px_20px_#24153620] dark:border-white/[.1] dark:bg-[#231f2c]">
      <button type="button" aria-label="Save text" title="Save · Enter" disabled={saving} onClick={()=>void save()} className="grid h-7 w-8 place-items-center rounded-[7px] text-[#7058ba] hover:bg-[#f0ebf8] disabled:opacity-40 dark:text-[#bca7e6] dark:hover:bg-white/[.06]"><Check size={16}/></button>
      <button type="button" aria-label="Cancel text edit" title="Cancel · Escape" disabled={saving} onClick={cancel} className="grid h-7 w-8 place-items-center rounded-[7px] text-[#968aa3] hover:bg-[#f0ebf8] dark:text-[#a99bb7] dark:hover:bg-white/[.06]"><X size={15}/></button>
    </div>
    {error && <p role="alert" className="mt-2 rounded-lg bg-[#fcfbfe] p-2 text-xs leading-4 text-[#7d475d] shadow dark:bg-[#231f2c] dark:text-[#e1b3c4]">{error}</p>}
  </div>;
}
