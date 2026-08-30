import type { CanvasV2ModelInputPart } from "@/lib/canvas-v2/structured-provider";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidenceAsset,
  type CanvasV2EvidencePacket,
} from "@/lib/canvas-v2/types";

export const CANVAS_V2_MAX_CHAT_ATTACHMENTS = 8;
export const CANVAS_V2_MAX_CHAT_IMAGES = 8;
export const CANVAS_V2_MAX_CHAT_IMAGE_BYTES = 2_500_000;
export const CANVAS_V2_MAX_CHAT_IMAGE_TOTAL_BYTES = 7_000_000;
export const CANVAS_V2_MAX_CHAT_TEXT_CHARACTERS = 30_000;
export const CANVAS_V2_MAX_CHAT_TEXT_TOTAL_CHARACTERS = 80_000;
export const CANVAS_V2_LONG_PASTE_CHARACTER_THRESHOLD = 1_200;
export const CANVAS_V2_LONG_PASTE_LINE_THRESHOLD = 16;

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export interface CanvasV2ChatImageAttachment {
  kind: "image";
  id: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}

export interface CanvasV2ChatTextAttachment {
  kind: "text";
  id: string;
  name: string;
  mimeType: "text/plain";
  text: string;
  charCount: number;
  createdAt: string;
}

export type CanvasV2ChatAttachment = CanvasV2ChatImageAttachment | CanvasV2ChatTextAttachment;

function decodedBytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function safeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 120);
}

function createdAt(value: unknown): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : new Date().toISOString();
}

export function parseCanvasV2ChatAttachments(value: unknown): CanvasV2ChatAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CANVAS_V2_MAX_CHAT_ATTACHMENTS) {
    throw new Error(`A message may include up to ${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attachments.`);
  }
  let totalImageBytes = 0;
  let totalTextCharacters = 0;
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Attachment ${index + 1} is invalid.`);
    const source = entry as Record<string, unknown>;
    const id = typeof source.id === "string" ? safeId(source.id) : "";
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 180) : "";
    if (!id || ids.has(id)) throw new Error(`Attachment ${index + 1} requires a unique identity.`);
    if (!name) throw new Error(`Attachment ${index + 1} requires a name.`);
    ids.add(id);

    if (source.kind === "text" || (source.mimeType === "text/plain" && typeof source.text === "string")) {
      const text = typeof source.text === "string" ? source.text.replace(/\r\n?/g, "\n").trim() : "";
      if (!text) throw new Error(`Text attachment ${index + 1} is empty.`);
      if (text.length > CANVAS_V2_MAX_CHAT_TEXT_CHARACTERS) throw new Error(`Text attachment ${index + 1} is too long.`);
      totalTextCharacters += text.length;
      if (totalTextCharacters > CANVAS_V2_MAX_CHAT_TEXT_TOTAL_CHARACTERS) throw new Error("The attached text is too long as a group.");
      return {
        kind: "text",
        id,
        name,
        mimeType: "text/plain",
        text,
        charCount: text.length,
        createdAt: createdAt(source.createdAt),
      } satisfies CanvasV2ChatTextAttachment;
    }

    const match = typeof source.dataUrl === "string" ? DATA_URL.exec(source.dataUrl) : undefined;
    const width = Math.floor(Number(source.width));
    const height = Math.floor(Number(source.height));
    if (!match || !SUPPORTED_IMAGE_TYPES.has(match[1])) throw new Error(`Image ${index + 1} must be PNG, JPEG, or WebP.`);
    if (source.mimeType !== match[1]) throw new Error(`Image ${index + 1} has inconsistent media metadata.`);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10_000 || height > 10_000) {
      throw new Error(`Image ${index + 1} has invalid dimensions.`);
    }
    const byteSize = decodedBytes(match[2]);
    if (byteSize < 1 || byteSize > CANVAS_V2_MAX_CHAT_IMAGE_BYTES) throw new Error(`Image ${index + 1} is too large.`);
    totalImageBytes += byteSize;
    if (totalImageBytes > CANVAS_V2_MAX_CHAT_IMAGE_TOTAL_BYTES) throw new Error("The attached images are too large as a group.");
    return {
      kind: "image",
      id,
      name,
      mimeType: match[1] as CanvasV2ChatImageAttachment["mimeType"],
      dataUrl: source.dataUrl as string,
      width,
      height,
      byteSize,
      createdAt: createdAt(source.createdAt),
    } satisfies CanvasV2ChatImageAttachment;
  });
}

/** Backwards-compatible image parser retained for focused callers and fixtures. */
export function parseCanvasV2ChatImageAttachments(value: unknown): CanvasV2ChatImageAttachment[] {
  const attachments = parseCanvasV2ChatAttachments(value);
  if (attachments.some((attachment) => attachment.kind !== "image")) throw new Error("Only image attachments are accepted here.");
  return attachments as CanvasV2ChatImageAttachment[];
}

export function canvasV2ChatImageAttachments(attachments: readonly CanvasV2ChatAttachment[]): CanvasV2ChatImageAttachment[] {
  return attachments.filter((attachment): attachment is CanvasV2ChatImageAttachment => attachment.kind === "image");
}

export function canvasV2ChatTextAttachments(attachments: readonly CanvasV2ChatAttachment[]): CanvasV2ChatTextAttachment[] {
  return attachments.filter((attachment): attachment is CanvasV2ChatTextAttachment => attachment.kind === "text");
}

export function canvasV2ChatAttachmentModelParts(
  attachments: readonly CanvasV2ChatAttachment[],
  detail: "low" | "high" = "low",
): CanvasV2ModelInputPart[] {
  return attachments.flatMap((attachment): CanvasV2ModelInputPart[] => {
    if (attachment.kind === "text") return [{ text: `Human-supplied text attachment \"${attachment.name}\":\n${attachment.text}` }];
    const match = DATA_URL.exec(attachment.dataUrl)!;
    return [{ inlineData: { mimeType: attachment.mimeType, data: match[2], detail, purpose: "reference" } }];
  });
}

export function canvasV2UploadedEvidenceModelParts(
  assets: readonly CanvasV2EvidenceAsset[],
  detail: "low" | "high" = "low",
): CanvasV2ModelInputPart[] {
  return assets.slice(-CANVAS_V2_MAX_CHAT_IMAGES).flatMap((asset) => {
    if (asset.source?.sourceType !== "uploaded" || asset.kind !== "image") return [];
    const match = DATA_URL.exec(asset.url);
    return match ? [{ inlineData: { mimeType: match[1], data: match[2], detail, purpose: "reference" } }] : [];
  });
}

export function canvasV2ChatAttachmentEvidence(attachments: readonly CanvasV2ChatAttachment[]): {
  assets: CanvasV2EvidenceAsset[];
  packets: CanvasV2EvidencePacket[];
} {
  const packets = attachments.map((attachment, index): CanvasV2EvidencePacket => {
    const packetId = `packet:chat-upload:${attachment.id}`;
    const isImage = attachment.kind === "image";
    const asset: CanvasV2EvidenceAsset = {
      id: `upload:${attachment.id}`,
      // Exact text lives once in the packet summary below. A stable internal
      // locator avoids duplicating a large percent-encoded payload in every
      // evidence asset projection and long-context cache write.
      url: isImage ? attachment.dataUrl : `northstar-text://human-supplied/${attachment.id}`,
      label: attachment.name,
      description: isImage
        ? `Image supplied by the person with the current North Star message (${attachment.width} × ${attachment.height}).`
        : `Text supplied by the person with the current North Star message (${attachment.charCount.toLocaleString("en-US")} characters).`,
      kind: isImage ? "image" : "document",
      authority: "supplied",
      packetId,
      capturedAt: attachment.createdAt,
      mimeType: attachment.mimeType,
      tags: ["human-supplied", "chat-attachment", isImage ? "visual" : "pasted-text", `attachment-${index + 1}`],
      limitations: [isImage
        ? "The image was supplied by the person. Visual interpretation must not be presented as independently verified fact."
        : "The text was supplied by the person. Its statements retain supplied authority and must not be presented as independently verified fact."],
      source: {
        providerId: "northstar-chat-upload",
        providerLabel: "Human supplied",
        sourceId: `chat-upload:${attachment.id}`,
        sourceType: "uploaded",
        label: attachment.name,
        sourceClass: "primary",
        access: "open",
        retrievedAt: attachment.createdAt,
        capturedAt: attachment.createdAt,
        permission: "authorized",
        freshness: "current-snapshot",
      },
    };
    return {
      schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
      id: packetId,
      kind: isImage ? "image" : "document",
      title: attachment.name,
      summary: isImage
        ? "An image supplied directly in the conversation for North Star to inspect and use when material to the inquiry."
        : `Text supplied directly in the conversation. Exact content:\n${attachment.text}`,
      authority: "supplied",
      source: asset.source!,
      assets: [asset],
      facts: [],
      metrics: [],
      limitations: [...(asset.limitations ?? [])],
      tags: [...(asset.tags ?? [])],
      createdAt: attachment.createdAt,
      continuationKey: `chat-upload:${attachment.id}`,
      presentation: {
        state: "graph-only",
        materiality: 0.5,
        reason: "Available to North Star as supplied evidence; it earns canvas space only when it materially strengthens the answer.",
      },
    };
  });
  return { packets, assets: packets.flatMap((packet) => packet.assets) };
}

export function canvasV2ChatAttachmentHandle(assetId: string, index: number): string {
  return `upload-${index + 1}-${safeId(assetId).slice(-36)}`;
}
