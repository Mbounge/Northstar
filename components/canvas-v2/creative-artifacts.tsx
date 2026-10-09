"use client";
import { useId, useState } from "react";
import { downloadArtifact } from "@/lib/canvas-v2/creative/download";
import { ChevronDown, Download, FileText, Images } from "lucide-react";
import type { NorthstarArtifact } from "@/lib/canvas-v2/creative/types";
import type { CanvasV2ChatImageAttachment } from "@/lib/canvas-v2/chat-attachments";

/** Display names are presentation only; downloads and asset identities stay intact. */
function displayName(artifact: NorthstarArtifact) {
  const label = artifact.label.trim() || artifact.name;
  const stem = label.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+){2,}$/.test(stem)) {
    const words = stem.replace(/[-_]+/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return label;
}

export function CreativeArtifacts({
  artifacts,
  onOpenImage,
}: {
  artifacts: NorthstarArtifact[];
  onOpenImage: (image: CanvasV2ChatImageAttachment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!artifacts.length) return null;
  return (
    <section className="mt-4 overflow-hidden rounded-[16px] border border-[#e7e3ec] bg-[#f8f7fa] dark:border-white/[.08] dark:bg-white/[.025]" aria-label="Created assets">
      <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)} className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#f0edf5] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8976ee] dark:hover:bg-white/[.035]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#eee9f7] text-[#817094] dark:bg-[#30283e] dark:text-[#baa8d2]"><Images aria-hidden="true" size={17} strokeWidth={1.6}/></span>
        <span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-[#4b435b] dark:text-[#ded6e8]">Assets <span className="ml-1 text-[#94899f] dark:text-[#a89ab6]">{artifacts.length}</span></span><span className="mt-0.5 block text-[11px] text-[#91859f] dark:text-[#a297ad]">Images and files from this work</span></span>
        <ChevronDown aria-hidden="true" size={15} className={`shrink-0 text-[#91859f] dark:text-[#aa9cb8] ${expanded ? 'rotate-180' : ''}`}/>
      </button>
      <div id={listId} hidden={!expanded}>
        {expanded && <ul aria-label="Asset list" className="max-h-[360px] overflow-y-auto overscroll-contain border-t border-[#e7e3ec] px-2 py-1.5 [scrollbar-width:thin] dark:border-white/[.07]">
          {artifacts.map(artifact => {
            const name = displayName(artifact);
            const image = /^image\/(png|jpeg|webp|gif)$/.test(artifact.mimeType);
            const description = image ? (artifact.origin === 'generated' ? 'Generated image' : 'Prepared image') : 'Created file';
            const label = <span className="min-w-0 flex-1 py-1"><span title={name} className="line-clamp-2 text-[12px] font-medium leading-[1.45] text-[#4b435b] dark:text-[#ded6e8]">{name}</span><span className="mt-0.5 block text-[10px] text-[#93879f] dark:text-[#a297ad]">{description}</span></span>;
            return <li key={artifact.id} className="flex items-center gap-1 rounded-[12px] p-1.5 hover:bg-white/70 dark:hover:bg-white/[.035]">
              {image ? <button type="button" aria-label={`Preview ${name}`} title={`View ${name}`} className="group/asset flex min-w-0 flex-1 items-center gap-3 rounded-[9px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8976ee]" onClick={event => {
                const img = event.currentTarget.querySelector('img');
                if (!img) return;
                onOpenImage({ id: artifact.id, kind: 'image', name, mimeType: artifact.mimeType as CanvasV2ChatImageAttachment['mimeType'], dataUrl: artifact.dataUrl, width: img.naturalWidth, height: img.naturalHeight, byteSize: artifact.bytes, createdAt: artifact.createdAt });
              }}>
                <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-[9px] border border-black/[.04] bg-[#efedf3] dark:border-white/[.05] dark:bg-[#16131d]">
                  {/* Keep the entire retained image visible, including small icons and portrait assets. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artifact.dataUrl} alt="" className="h-full w-full object-contain group-hover/asset:opacity-90"/>
                </span>{label}
              </button> : <div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-[9px] bg-[#efedf3] text-[#91859f] dark:bg-[#24202c] dark:text-[#b4a4c5]"><FileText aria-hidden="true" size={20} strokeWidth={1.5}/></span>{label}</div>}
              <button type="button" onClick={() => void downloadArtifact(artifact)} aria-label={`Download ${name}`} title={`Download ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8c8596] transition-colors hover:bg-[#ece8f5] hover:text-[#6653ce] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8976ee] dark:text-[#aaa2b6] dark:hover:bg-white/[.07] dark:hover:text-[#d3c8ff]"><Download aria-hidden="true" size={14}/></button>
            </li>;
          })}
        </ul>}
      </div>
    </section>
  );
}
