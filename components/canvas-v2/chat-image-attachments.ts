"use client";

import {
  CANVAS_V2_MAX_CHAT_IMAGE_BYTES,
  CANVAS_V2_MAX_CHAT_ATTACHMENTS,
  CANVAS_V2_MAX_CHAT_TEXT_CHARACTERS,
  type CanvasV2ChatImageAttachment,
  type CanvasV2ChatTextAttachment,
} from "@/lib/canvas-v2/chat-attachments";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SOURCE_BYTES = 15_000_000;
const MAX_DIMENSION = 2_048;

function attachmentId(): string {
  return `image-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 12)}`;
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("The image could not be prepared.")),
    mimeType,
    quality,
  ));
}

async function normalizeFile(file: File): Promise<CanvasV2ChatImageAttachment> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported PNG, JPEG, or WebP image.`);
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is too large.`);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) throw new Error(`${file.name} could not be prepared.`);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    let mimeType: CanvasV2ChatImageAttachment["mimeType"] = file.type as CanvasV2ChatImageAttachment["mimeType"];
    let blob = await canvasBlob(canvas, mimeType, mimeType === "image/png" ? undefined : 0.88);
    if (blob.size > CANVAS_V2_MAX_CHAT_IMAGE_BYTES && mimeType === "image/png") {
      mimeType = "image/webp";
      blob = await canvasBlob(canvas, mimeType, 0.88);
    }
    if (blob.size > CANVAS_V2_MAX_CHAT_IMAGE_BYTES) {
      mimeType = "image/webp";
      blob = await canvasBlob(canvas, mimeType, 0.76);
    }
    if (blob.size > CANVAS_V2_MAX_CHAT_IMAGE_BYTES) throw new Error(`${file.name} remains too large after optimization.`);
    return {
      kind: "image",
      id: attachmentId(),
      name: file.name.slice(0, 180),
      mimeType,
      dataUrl: await blobDataUrl(blob),
      width,
      height,
      byteSize: blob.size,
      createdAt: new Date().toISOString(),
    };
  } finally {
    bitmap.close();
  }
}

export async function prepareCanvasV2ChatImages(
  files: readonly File[],
  availableSlots: number,
): Promise<CanvasV2ChatImageAttachment[]> {
  const selected = [...files].slice(0, Math.max(0, Math.min(availableSlots, CANVAS_V2_MAX_CHAT_ATTACHMENTS)));
  return Promise.all(selected.map(normalizeFile));
}

export function prepareCanvasV2PastedText(text: string, ordinal: number): CanvasV2ChatTextAttachment {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("The pasted text is empty.");
  if (normalized.length > CANVAS_V2_MAX_CHAT_TEXT_CHARACTERS) {
    throw new Error(`Pasted text may contain up to ${CANVAS_V2_MAX_CHAT_TEXT_CHARACTERS.toLocaleString("en-US")} characters.`);
  }
  return {
    kind: "text",
    id: `text-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 12)}`,
    name: `Pasted text ${Math.max(1, ordinal)}`,
    mimeType: "text/plain",
    text: normalized,
    charCount: normalized.length,
    createdAt: new Date().toISOString(),
  };
}
