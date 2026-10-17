'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { SCREEN_ASSET_DRAG_TYPE, setScreenAssetDrag } from '@/lib/canvas-v2/screen-asset-edit';
import { CanvasV2ScreenAssets } from './interactive-screen';
import { CanvasV2NativeModelObject } from './native-model-object';

export function ProjectAssets({assets,onUpload,onUploadModel,onInsertModel}:{assets:readonly CanvasV2EvidenceAsset[];onUpload:()=>void;onUploadModel:()=>void;onInsertModel:(asset:CanvasV2EvidenceAsset)=>void}) {
  const [preview,setPreview]=useState<CanvasV2EvidenceAsset>();
  return <><section aria-label="Project assets" className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-5">
    <div className="mb-4 flex items-center justify-between px-1">
      <div><h2 className="text-base font-semibold tracking-[-.02em] text-[#433b51] dark:text-[#e5deec]">Your assets</h2><p className="mt-1 text-xs leading-5 text-[#968aa3] dark:text-[#a99bb7]">Images and 3D models to use across your project.</p></div>
      <button type="button" aria-label="Add project images" onClick={onUpload} className="flex items-center gap-1.5 rounded-[10px] bg-[#f0edf8] px-3 py-2 text-xs font-medium text-[#715ac4] hover:bg-[#e9e3f5] dark:bg-white/[.06] dark:text-[#c3b4e4] dark:hover:bg-white/[.1]"><Plus size={14}/>Add</button><button type="button" aria-label="Add 3D model" onClick={onUploadModel} className="ml-2 rounded-[10px] border border-[#ded8eb] px-2 py-2 text-[11px] font-medium text-[#715ac4] hover:bg-[#f0edf8] dark:border-white/[.1] dark:text-[#c3b4e4]">3D model</button>
    </div>
    <p className="mb-3 px-1 text-[11px] leading-5 text-[#968aa3] dark:text-[#a99bb7]">Import GLB or glTF exports from Blender and Unreal. For glTF, select its .bin and texture files together with the model.</p>
    {assets.length ? <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-1 [scrollbar-width:thin]">{assets.map(asset=>{
      const label=asset.label.replace(/\.(png|jpe?g|webp)$/i,'').replace(/[-_]+/g,' ');
      return <li key={asset.id}><button type="button" draggable={asset.mediaType !== "model"} onClick={()=>setPreview(asset)} aria-label={`Preview ${label}`} title={asset.mediaType === "model" ? "Use this retained GLB handle in a 3D screen" : "Drag onto the canvas or an image in a screen"} onDragEnd={()=>setScreenAssetDrag(false)} onDragStart={event=>{if(asset.mediaType === "model") return;setScreenAssetDrag(true);event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(SCREEN_ASSET_DRAG_TYPE,JSON.stringify({assetId:asset.id}));}} className="flex w-full cursor-grab items-center gap-3 rounded-xl p-2 text-left hover:bg-[#f0edf6] active:cursor-grabbing dark:hover:bg-white/[.04]">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-black/[.04] bg-[#eeeaf2] dark:border-white/[.06] dark:bg-[#15131c]">
          {asset.mediaType === "model" ? <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-[.12em] text-[#715ac4]">GLB</span> : <><span className="sr-only">Image thumbnail</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt="" draggable={false} className="h-full w-full object-contain" />
          </>}
        </span><span className="min-w-0"><span className="line-clamp-2 text-[13px] font-medium leading-[1.45] text-[#4b435b] dark:text-[#ded6e8]">{label}</span><span className="mt-1 block text-[11px] text-[#968aa3] dark:text-[#a99bb7]">{asset.tags?.includes('generated')?'Created with Northstar':asset.source?.sourceType==='uploaded'?(asset.mediaType==='model'?'Your model':'Your image'):'From this project'}</span></span>
      </button></li>;
    })}</ul>:<div className="px-5 py-8 text-center text-[12px] leading-5 text-[#968aa3] dark:text-[#a99bb7]">Images and 3D models you add or create will be ready to reuse here.</div>}
  </section>{preview && <Dialog.Root open onOpenChange={open=>{if(!open)setPreview(undefined)}}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[9999] bg-[#0e0b15]/90 backdrop-blur-md"/>
    <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[10000] -translate-x-1/2 -translate-y-1/2 outline-none">
      <Dialog.Title className="sr-only">Preview {preview.label}</Dialog.Title>
      <Dialog.Close aria-label="Close asset preview" className="absolute -right-4 -top-4 z-10 rounded-full bg-[#292331] p-3 text-white shadow-lg hover:bg-[#3a3045]"><X size={20}/></Dialog.Close>
      {preview.mediaType === "model" ? <CanvasV2ScreenAssets.Provider value={assets}><div className="h-[min(70vh,520px)] w-[min(82vw,700px)]"><CanvasV2NativeModelObject nodeId={`asset-preview-${preview.id}`} showCaption={false} encodedModel={JSON.stringify({ version: 1, evidenceId: preview.id, label: preview.label })}/></div><button type="button" onClick={()=>{onInsertModel(preview);setPreview(undefined)}} className="mt-3 w-full rounded-lg bg-[#715ac4] px-3 py-2 text-xs font-semibold text-white">Add to canvas</button><a href={preview.url} download={`${preview.label.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'model'}.glb`} className="mt-2 block text-center text-xs text-[#715ac4] underline">Download GLB</a></CanvasV2ScreenAssets.Provider> : <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.url} alt={preview.label} className="max-h-[85vh] max-w-[90vw] object-contain" />
      </>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>}</>;

}
