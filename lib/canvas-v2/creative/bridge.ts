import type { CanvasV2EvidenceAsset } from "../types";
import { object, string, type JsonObject } from "../managed-agent/protocol";
import { artifactMetadata } from "./types";
import type {
  CreativeContext,
  CreativeJob,
  CreativeResult,
  NorthstarArtifact,
} from "./types";

/** Transfer only explicitly referenced, retained session assets. Preserve original media bytes. */
export async function creativeInputContext(
  raw: JsonObject,
  decoded: JsonObject,
  assets: CanvasV2EvidenceAsset[],
  artifacts: NorthstarArtifact[],
  canvas: CreativeContext["canvas"],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CreativeContext> {
  const refs = Array.isArray(raw.inputAssetIds)
    ? raw.inputAssetIds
    : Array.isArray(raw.inputs)
      ? raw.inputs.map((v) => object(v).assetId)
      : [];
  const ids = Array.isArray(decoded.inputAssetIds)
    ? decoded.inputAssetIds
    : Array.isArray(decoded.inputs)
      ? decoded.inputs.map((v) => object(v).assetId)
      : [];
  if (refs.length > 16)
    throw new Error("Import media in batches of at most 16 files.");
  let total = 0;
  const inputs: CreativeContext["inputs"] = [];
  for (let i = 0; i < refs.length; i++) {
    const asset = assets.find((a) => a.id === ids[i]),
      artifact = artifacts.find((a) => a.id === ids[i]);
    if ((!asset && !artifact) || asset?.source?.permission === "unavailable")
      throw new Error(
        "This input is not in the session’s retained media. Read or inspect it first.",
      );
    if (asset?.mediaType === "video")
      throw new Error("Linked videos cannot be imported as image bytes.");
    const url = artifact?.dataUrl ?? asset!.url;
    const response = await fetcher(url, { signal, credentials: "omit" });
    if (!response.ok)
      throw new Error("Could not read the retained input file.");
    if (Number(response.headers.get("content-length")) > 6_000_000) {
      await response.body?.cancel();
      throw new Error("This input exceeds the 6 MB import batch limit.");
    }
    if (!response.body) throw new Error("The retained input has no content.");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 6_000_000)
          throw new Error(
            "Import batch exceeds 6 MB. Import fewer or smaller inputs.",
          );
        parts.push(value);
      }
    } catch (e) {
      await reader.cancel();
      throw e;
    } finally {
      reader.releaseLock();
    }
    const blob = new Blob(
      parts.map((p) => new Uint8Array(p)),
      {
        type:
          artifact?.mimeType ??
          asset?.mimeType ??
          response.headers.get("content-type") ??
          "application/octet-stream",
      },
    );
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not prepare retained media."));
      r.readAsDataURL(blob);
    });
    inputs.push({
      reference: string(refs[i]),
      id: string(ids[i]),
      label: artifact?.label ?? asset!.label,
      dataUrl,
    });
  }
  signal.throwIfAborted();
  return { inputs, canvas };
}
export async function runCreativeJob(
  request: (body: JsonObject, signal: AbortSignal) => Promise<Response>,
  action: JsonObject,
  context: CreativeContext,
  signal: AbortSignal,
): Promise<CreativeResult> {
  const identity = { callId: action.call_id, turnId: action.turn_id };
  let response: Response;
  try {
    response = await request({ op: "creative", ...identity, context }, signal);
  } catch (error) {
    signal.throwIfAborted();
    // The POST may have reached the worker. Poll its existing receipt; never replay paid work blindly.
    try {
      response = await request({ op: "creative-poll", ...identity }, signal);
    } catch {
      throw error;
    }
  }
  while (true) {
    const job = (await response.json()) as CreativeJob;
    if (job.status === "completed") return job.result;
    if (job.status === "failed") throw new Error(job.error);
    if (job.status !== "running")
      throw new Error("Invalid creative operation status.");
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 900);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    response = await request({ op: "creative-poll", ...identity }, signal);
  }
}
/** The model sees handles and verified receipts; large bytes stay in saved session memory. */
export function creativeResultForModel(result: CreativeResult) {
  return {
    summary: result.summary,
    execution: result.execution,
    warnings: result.warnings,
    artifacts: result.artifacts.map((a) => ({
      ...artifactMetadata(a),
      downloadUrl: `artifact:${a.id}`,
    })),
    assets: result.assets.map((asset) => ({
      ...asset,
      url: `northstar-asset:${asset.id}`,
    })),
    next: result.assets.length
      ? "Inspect the retained image pixels with inspect_asset before using them. Read canvas_read for current media handles; use canvas_edit to place editable structure and these assets."
      : "Output files are retained for download and can be re-imported with workspace_run. Use computed values to update native editable canvas objects when requested.",
  };
}
