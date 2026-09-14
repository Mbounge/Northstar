import { canvasV2SourcePageSnapshot } from "./source-page-context";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { canvasV2VideoEmbedUrl } from "./canvas-media";
import type { CanvasV2EvidencePacket } from "./types";

type MediaCandidate = { url: string; type: "image" | "gif" | "video"; label: string };
export type CanvasV2MediaRead = (url: string, signal: AbortSignal) => Promise<{ bytes: Buffer; mimeType: string; url: string }>;

/** Public IPv4 only. Requests pin the checked address, including each redirect. */
export function canvasV2PublicMediaAddress(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return a !== 0 && a !== 10 && a !== 127 && a < 224
    && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31)
    && !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 198 && (b === 18 || b === 19));
}

export const readCanvasV2PublicMedia: CanvasV2MediaRead = async (input, signal) => {
  let url = new URL(input);
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  for (let hop = 0; hop < 4; hop++) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("Unsupported public media address.");
    const addresses = await lookup(url.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some(item => !canvasV2PublicMediaAddress(item.address))) throw new Error("Media address is not public.");
    const address = addresses[0].address;
    const result = await new Promise<{ bytes: Buffer; mimeType: string; location?: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        signal: boundedSignal, family: 4,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: { Accept: "text/html,image/png,image/jpeg,image/webp,image/gif", "User-Agent": "Northstar-Media/1.0" },
      }, response => {
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume(); resolve({ bytes: Buffer.alloc(0), mimeType: "", location: response.headers.location }); return;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { response.resume(); reject(new Error("Source media is unavailable.")); return; }
        const mimeType = (response.headers["content-type"] ?? "").split(";")[0].toLowerCase();
        // Never download video bytes. Hosted clips remain linked native players.
        if (!["text/html", "image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)) { response.destroy(); reject(new Error("Source is not a supported image or page.")); return; }
        const chunks: Buffer[] = []; let length = 0;
        response.on("data", (chunk: Buffer) => { length += chunk.length; if (length > 2_500_000) response.destroy(new Error("Source media exceeds the capture budget.")); else chunks.push(chunk); });
        response.on("end", () => resolve({ bytes: Buffer.concat(chunks), mimeType }));
        response.on("error", reject);
      });
      request.on("error", reject); request.end();
    });
    if (result.location) { url = new URL(result.location, url); continue; }
    return { ...result, url: url.toString() };
  }
  throw new Error("Too many source redirects.");
};

function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Candidates are page-owned references, not assertions about what their pixels prove. */
export function canvasV2PageMediaCandidates(html: string, sourceUrl: string, subject = ""): MediaCandidate[] {
  const result: MediaCandidate[] = [];
  const responsiveUrls = new Set<string>();
  const source = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const captions = [...source.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi)].map(figure => ({
    start: figure.index!, end: figure.index! + figure[0].length,
    text: decode((/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(figure[0])?.[1] ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(),
  }));
  for (const tag of source.matchAll(/<(img|video|source|iframe|meta)\b[^>]*>/gi)) {
    const attrs = new Map([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4])]));
    const name = tag[1].toLowerCase();
    const property = attrs.get("property") ?? attrs.get("name");
    if (name === "meta" && !["og:image", "og:video", "og:video:url", "twitter:image"].includes(property ?? "")) continue;
    // Pick a useful inspection/rendering size, not a tiny placeholder or a huge
    // original. This chooses a source variant; it never crops the image.
    const variants = (attrs.get("data-srcset") ?? attrs.get("srcset") ?? "").split(",").map(item => {
      const [url, descriptor = "1x"] = item.trim().split(/\s+/);
      return { url, size: parseFloat(descriptor) * (descriptor.endsWith("x") ? 1280 : 1) };
    }).filter(item => item.url && Number.isFinite(item.size)).sort((a, b) => a.size - b.size);
    const responsive = (variants.find(item => item.size >= 1280) ?? variants.at(-1))?.url;
    const direct = attrs.get("src");
    const raw = name === "meta" ? attrs.get("content") : (responsive ?? attrs.get("data-src") ?? attrs.get("data-original") ?? direct);
    if (!raw) continue;
    let url: URL; try { url = new URL(raw, sourceUrl); } catch { continue; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
    if (responsive) responsiveUrls.add(url.toString());
    const caption = captions.find(item => tag.index! >= item.start && tag.index! < item.end)?.text;
    const label = [...new Set([attrs.get("alt")?.trim(), attrs.get("title")?.trim(), caption].filter(Boolean))].join(" — ").slice(0, 480);
    if (/favicon|tracking|pixel|spacer/i.test(`${label} ${url.pathname}`)) continue;
    if (Number(attrs.get("width")) > 0 && Number(attrs.get("width")) <= 2) continue;
    const isVideo = Boolean(canvasV2VideoEmbedUrl(url.toString())) || /\.(mp4|webm)$/i.test(url.pathname);
    if (["iframe", "video"].includes(name) && !isVideo) continue;
    if (name === "source" && !isVideo && !responsive) continue;
    if (name === "meta" && property?.includes("video") && !isVideo) continue;
    result.push({ url: url.toString(), type: isVideo ? "video" : /\.gif$/i.test(url.pathname) ? "gif" : "image", label });
  }
  const unique = new Map<string, MediaCandidate>();
  for (const item of result) {
    const identity = new URL(item.url);
    // Responsive variants of one file are one candidate, not two pieces of evidence.
    if (/\.(?:png|jpe?g|webp|gif)$/i.test(identity.pathname)) for (const key of ["f", "w", "h", "width", "height", "format", "quality"]) identity.searchParams.delete(key);
    const key = identity.toString(); const previous = unique.get(key);
    if (!previous) unique.set(key, item);
    else unique.set(key, {
      ...previous,
      url: responsiveUrls.has(item.url) && !responsiveUrls.has(previous.url) ? item.url : previous.url,
      label: item.label || previous.label,
    });
  }
  // Retrieval order often puts navigation, coffee, or lifestyle imagery before
  // the actual subject. Rank page-owned candidates using the retained finding;
  // the visual director still inspects pixels and can reject every candidate.
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const generic = new Set(["https", "http", "image", "images", "media", "with", "from", "that", "this", "have", "their", "which", "what", "does", "into", "only", "also", "than", "more", "menu", "page", "official", "source", "price", "prices", "shows", "lists", "about", "after", "before"]);
  const terms = words(subject); for (const word of generic) terms.delete(word);
  const relevance = (item: MediaCandidate) => [...words(`${item.label} ${new URL(item.url).pathname}`)].filter(word => terms.has(word)).length;
  return [...unique.values()].sort((a, b) => relevance(b) - relevance(a));
}

export function actualImageType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  return undefined;
}

/** Inspect the bounded result set; text-only lead pages must not hide later visual sources. */
export async function enrichCanvasV2SourceMedia(packets: CanvasV2EvidencePacket[], signal: AbortSignal, read: CanvasV2MediaRead = readCanvasV2PublicMedia, options: { collectMedia?: boolean } = {}): Promise<CanvasV2EvidencePacket[]> {
  const selected = [...packets].filter(p => p.source.access !== "inaccessible" && p.source.access !== "paywalled")
    .sort((a, b) => (b.presentation?.materiality ?? 0) - (a.presentation?.materiality ?? 0)).slice(0, 8);
  const enriched = await Promise.all(selected.map(async packet => {
    const assets = [...packet.assets];
    try {
      const pageUrl = packet.source.sourceUrl!;
      const page = await read(pageUrl, signal).catch(() => undefined);
      const sourceSnapshot = page?.mimeType === "text/html" ? canvasV2SourcePageSnapshot(page.bytes.toString("utf8"), page.url, packet) : packet.sourceSnapshot;
      if (options.collectMedia === false) return { ...packet, sourceSnapshot };
      const candidates = page?.mimeType === "text/html" ? canvasV2PageMediaCandidates(page.bytes.toString("utf8"), page.url, `${packet.title} ${packet.summary}`) : [];
      const pending = [...assets.map(asset => ({ url: asset.originalUrl ?? asset.url, type: asset.mediaType ?? "image" as const, label: asset.label })), ...candidates];
      const unique = [...new Map(pending.map(candidate => [candidate.url, candidate])).values()].slice(0, 2);
      const captured = await Promise.all(unique.map(async candidate => {
        try {
          const originalUrl = candidate.url;
          let url = originalUrl; let mediaType = candidate.type; let mimeType: string | undefined;
          if (mediaType !== "video") {
            const image = await read(url, signal);
            mimeType = actualImageType(image.bytes);
            if (!mimeType || mimeType !== image.mimeType) return undefined;
            mediaType = mimeType === "image/gif" ? "gif" : "image";
            // Still-image captures are retained for both model inspection and reliable rendering.
            // Animated media remains linked; no video/GIF frames are sent to the model.
            if (mediaType === "image") url = `data:${mimeType};base64,${image.bytes.toString("base64")}`;
          }
          const existing = assets.find(asset => (asset.originalUrl ?? asset.url) === originalUrl);
          return { ...existing, id: `external-media:${createHash("sha256").update(`${pageUrl}:${originalUrl}:${url}`).digest("hex").slice(0, 16)}`,
            url, originalUrl, label: candidate.label || `Media from ${packet.source.label}`, kind: "image" as const, mediaType, mimeType,
            source: packet.source, packetId: packet.id, authority: "observed" as const,
            description: `Media linked by ${packet.source.label}. Select only after checking its relevance; page association alone does not establish what the media proves.`,
            limitations: mediaType === "video" || mediaType === "gif" ? ["Linked playback; motion and audio have not been inspected by the model."] : [],
          };
        } catch { return undefined; }
      }));
      const accepted = captured.filter(item => item !== undefined);
      const replaced = new Set(accepted.map(asset => asset.originalUrl));
      return { ...packet, sourceSnapshot, assets: [...assets.filter(asset => !replaced.has(asset.originalUrl ?? asset.url)), ...accepted] };
    } catch { return packet; }
  }));
  if (signal.aborted) throw signal.reason;
  const byId = new Map(enriched.map(packet => [packet.id, packet]));
  return packets.map(packet => byId.get(packet.id) ?? packet);
}

/** Inspect retained captures without placing them on the canvas. Only authorized
 * source assets are eligible; a bounded sample is explicitly labelled as such.
 * Successful bytes remain in inquiry memory so later passes do not fetch again.
 */
export async function prepareCanvasV2DiscoveryCaptures(packets: readonly CanvasV2EvidencePacket[], signal: AbortSignal, read: CanvasV2MediaRead = readCanvasV2PublicMedia) {
  const selected = packets.filter(packet => packet.source.permission === "authorized" && packet.source.sourceType !== "uploaded")
    .flatMap(packet => packet.assets.filter(asset => (asset.kind === "image" || asset.kind === "screenshot") && (!asset.mediaType || asset.mediaType === "image")).map(asset => ({packet, asset}))).slice(-4);
  const captured = await Promise.all(selected.map(async ({packet, asset}) => {
    try {
      const data = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(asset.url);
      const loaded = data ? {bytes:Buffer.from(data[2], "base64"), mimeType:data[1], url:asset.url} : await read(asset.url, signal);
      const mimeType = actualImageType(loaded.bytes);
      if (!mimeType || !["image/png", "image/jpeg", "image/webp"].includes(mimeType) || mimeType !== loaded.mimeType || loaded.bytes.length > 2_500_000) return undefined;
      return {packetId:packet.id, asset, source:packet.title, mimeType, data:loaded.bytes.toString("base64")};
    } catch { return undefined; }
  }));
  if (signal.aborted) throw signal.reason;
  const usable = captured.filter(item => item !== undefined);
  return {
    packets: packets.map(packet => ({...packet, assets:packet.assets.map(asset => {
      const found = usable.find(item => item.packetId === packet.id && item.asset.id === asset.id);
      return found ? {...asset, originalUrl:asset.originalUrl ?? asset.url, url:`data:${found.mimeType};base64,${found.data}`} : asset;
    })})),
    parts: usable.flatMap(item => [
      {text:`Inspected source image: ${item.source} — ${item.asset.label}. Only these supplied frames are inspected; do not claim to have watched motion or inspected an entire journey. Asset: ${item.asset.id}.`},
      {inlineData:{mimeType:item.mimeType,data:item.data,detail:"high" as const,purpose:"reference" as const}},
    ]),
  };
}

/** Source text is research input, independent of whether a visual is requested. */
export async function prepareCanvasV2SourceText(packets: CanvasV2EvidencePacket[], signal: AbortSignal, read: CanvasV2MediaRead = readCanvasV2PublicMedia): Promise<CanvasV2EvidencePacket[]> {
  const missing = packets.filter(packet => packet.source.providerId === "openai-web-search" && packet.source.permission === "authorized" && !packet.sourceSnapshot).slice(-8);
  if (!missing.length) return packets;
  const hydrated = await enrichCanvasV2SourceMedia(missing, signal, read, { collectMedia: false });
  const byId = new Map(hydrated.map(packet => [packet.id, packet]));
  return packets.map(packet => byId.get(packet.id) ?? packet);
}
