"use client";
import { downloadArtifact } from "@/lib/canvas-v2/creative/download";
import { Download, FileText } from "lucide-react";
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
  const images = artifacts.filter(artifact => /^image\/(png|jpeg|webp|gif)$/.test(artifact.mimeType));
  const files = artifacts.filter(artifact => !images.includes(artifact));
  const download = (artifact: NorthstarArtifact, name: string) => (
    <button
      type="button"
      onClick={() => void downloadArtifact(artifact)}
      aria-label={`Download ${name}`}
      title={`Download ${name}`}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8c8596] transition hover:bg-[#ece8f5] hover:text-[#6653ce] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8976ee] dark:text-[#aaa2b6] dark:hover:bg-white/[.07] dark:hover:text-[#d3c8ff]"
    >
      <Download aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
  return (
    <div className="mt-4 space-y-4" aria-label="Created files">
      {images.length > 0 && <section aria-label="Created images">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-medium text-[#81788f] dark:text-[#a39aad]">
          <span>Images</span><span className="text-[#aaa2b6] dark:text-[#746b82]">{images.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {images.map(artifact => {
            const name = displayName(artifact);
            return <figure key={artifact.id} className="min-w-0 overflow-hidden rounded-[14px] border border-[#e5e0ed] bg-[#faf9fc] dark:border-[#39333f] dark:bg-[#211d27]">
              <button
                type="button"
                aria-label={`Expand ${name}`}
                title={`View ${name}`}
                className="group/image relative block aspect-square w-full overflow-hidden bg-[#efedf3] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8976ee] dark:bg-[#15121b]"
                onClick={event => {
                  const img = event.currentTarget.querySelector("img");
                  if (!img) return;
                  onOpenImage({
                    id: artifact.id,
                    kind: "image",
                    name,
                    mimeType: artifact.mimeType as CanvasV2ChatImageAttachment["mimeType"],
                    dataUrl: artifact.dataUrl,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    byteSize: artifact.bytes,
                    createdAt: artifact.createdAt,
                  });
                }}
              >
                {/* Keep the complete image visible; expansion uses the original retained pixels. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artifact.dataUrl} alt={name} className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200 group-hover/image:opacity-90" />
              </button>
              <figcaption className="flex min-h-[48px] items-center gap-1 px-2.5 py-1.5">
                <span title={name} className="min-w-0 flex-1 text-[11px] font-medium leading-[1.4] text-[#4b435b] dark:text-[#d5ccdf]">
                  <span className="line-clamp-2">{name}</span>
                </span>
                {download(artifact, name)}
              </figcaption>
            </figure>;
          })}
        </div>
      </section>}
      {files.length > 0 && <section aria-label="Created documents" className="space-y-2">
        {files.map(artifact => {
          const name = displayName(artifact);
          return <div key={artifact.id} className="flex items-center gap-3 rounded-[14px] border border-[#e5e0ed] bg-[#faf9fc] px-3 py-2.5 dark:border-[#39333f] dark:bg-[#211d27]">
            <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-[#91859f] dark:text-[#a99cb8]" />
            <div className="min-w-0 flex-1">
              <p title={name} className="truncate text-[12px] font-medium text-[#4b435b] dark:text-[#d5ccdf]">{name}</p>
              <p className="mt-0.5 truncate text-[10px] text-[#91879e] dark:text-[#9b90a8]">{artifact.name}</p>
            </div>
            {download(artifact, name)}
          </div>;
        })}
      </section>}
    </div>
  );
}
