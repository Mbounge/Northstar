"use client";
import { downloadArtifact } from "@/lib/canvas-v2/creative/download";
import { Download, FileText } from "lucide-react";
import type { NorthstarArtifact } from "@/lib/canvas-v2/creative/types";
import type { CanvasV2ChatImageAttachment } from "@/lib/canvas-v2/chat-attachments";

export function CreativeArtifacts({
  artifacts,
  onOpenImage,
}: {
  artifacts: NorthstarArtifact[];
  onOpenImage: (image: CanvasV2ChatImageAttachment) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Created files">
      {artifacts.map((artifact) => {
        const image = /^image\/(png|jpeg|webp|gif)$/.test(artifact.mimeType);
        return (
          <div
            key={artifact.id}
            className="max-w-full overflow-hidden rounded-xl border border-black/10 bg-black/[.025] dark:border-white/10 dark:bg-white/[.035]"
          >
            {image && (
              <button
                type="button"
                aria-label={`Expand ${artifact.label}`}
                className="block"
                onClick={(event) => {
                  const img = event.currentTarget.querySelector("img");
                  if (img)
                    onOpenImage({
                      id: artifact.id,
                      kind: "image",
                      name: artifact.label,
                      mimeType:
                        artifact.mimeType as CanvasV2ChatImageAttachment["mimeType"],
                      dataUrl: artifact.dataUrl,
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      byteSize: artifact.bytes,
                      createdAt: artifact.createdAt,
                    });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artifact.dataUrl}
                  alt={artifact.label}
                  className="block max-h-48 max-w-[240px] object-contain"
                />
              </button>
            )}
            <button
              type="button"
              onClick={() => void downloadArtifact(artifact)}
              aria-label={`Download ${artifact.label}`}
              className="flex max-w-[260px] items-center gap-2 px-3 py-2 text-left text-xs text-[#55505f] hover:bg-black/5 dark:text-[#c9c3d6] dark:hover:bg-white/5"
            >
              {!image && <FileText className="h-4 w-4 shrink-0" />}
              <span className="min-w-0">
                <span className="block truncate">{artifact.label}</span>
                <span className="text-[10px] opacity-60">
                  {artifact.origin === "generated"
                    ? "Generated image"
                    : artifact.name}
                </span>
              </span>
              <Download className="ml-auto h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
