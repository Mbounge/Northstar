import { createHash, randomUUID } from "node:crypto";
import { posix } from "node:path";
import { object, string, type JsonObject } from "../managed-agent/protocol";
import { actualImageType } from "../source-media.server";
import type { CanvasV2EvidenceAsset } from "../types";
import { CreativeApiError, CreativeOpenAI, pause } from "./openai.server";
import type {
  CreativeContext,
  CreativeJob,
  CreativeResult,
  CreativeTool,
  NorthstarArtifact,
} from "./types";

export const WORKSPACE = "/mnt/data/northstar";
const MAX_FILE = 8_000_000;
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
export function workspacePath(value: unknown): string {
  const s = string(value);
  if (
    !s ||
    s.length > 240 ||
    s.startsWith("/") ||
    /[\x00-\x1f\\]/.test(s) ||
    s.split("/").some((p) => p === ".." || !p)
  )
    throw new Error("Use a relative workspace path without traversal.");
  return posix.join(WORKSPACE, s);
}
function rows(value: unknown, limit: number): JsonObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit)
    throw new Error(
      `Use at most ${limit} files per operation; split larger work across calls.`,
    );
  return value.map(object);
}
function decodeData(url: string) {
  const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(url);
  if (!match || match[2].length > 11_000_000)
    throw new Error(
      "Input must be retained file bytes, not a URL or filesystem path.",
    );
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_FILE)
    throw new Error("Input exceeds the per-file transfer limit.");
  return { bytes, mimeType: match[1] };
}
function mimeFor(path: string, bytes: Buffer) {
  return (
    actualImageType(bytes) ??
    ({
      ".json": "application/json",
      ".csv": "text/csv",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".pdf": "application/pdf",
      ".svg": "image/svg+xml",
      ".html": "text/html",
      ".zip": "application/zip",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[posix.extname(path).toLowerCase()] ||
      "application/octet-stream")
  );
}
export function creativeArtifact(
  bytes: Buffer,
  name: string,
  label: string,
  origin: "generated" | "computed",
  inputAssetIds: string[],
  model?: string,
): { artifact: NorthstarArtifact; asset?: CanvasV2EvidenceAsset } {
  const mimeType = mimeFor(name, bytes);
  const createdAt = new Date().toISOString();
  const id = `creative-${createHash("sha256").update(bytes).update(JSON.stringify({ origin, inputAssetIds })).digest("hex").slice(0, 24)}`;
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  const artifact: NorthstarArtifact = {
    id,
    name: posix.basename(name),
    label,
    mimeType,
    dataUrl,
    bytes: bytes.length,
    origin,
    createdAt,
    inputAssetIds,
    ...(name.startsWith(`${WORKSPACE}/`) ? { workspacePath: name } : {}),
  };
  const image = actualImageType(bytes);
  const asset: CanvasV2EvidenceAsset | undefined = image
    ? {
        id,
        url: dataUrl,
        label,
        kind: "image",
        mimeType,
        mediaType: image === "image/gif" ? "gif" : "image",
        authority: origin === "generated" ? "inferred" : "calculated",
        tags: [origin, ...inputAssetIds.map((id) => `derived-from:${id}`)],
        description:
          origin === "generated"
            ? `AI-generated illustration${model ? ` (${model})` : ""}. Not documentary evidence.`
            : "Created by code from the supplied inputs; inspect before using.",
        limitations:
          origin === "generated"
            ? ["Synthetic media; not a photograph or proof of a real event."]
            : [
                "Computed or transformed output; accuracy depends on its inputs and calculation.",
              ],
        source: {
          providerId:
            origin === "generated"
              ? "northstar-image-generation"
              : "northstar-execution",
          providerLabel:
            origin === "generated" ? "Generated image" : "Computed artifact",
          sourceId: id,
          sourceType: "other",
          label,
          retrievedAt: createdAt,
          permission: "authorized",
        },
      }
    : undefined;
  return { artifact, asset };
}

/** Runs only inside an OpenAI-hosted container. User commands never reach the Render OS. */
export const WORKSPACE_RUNNER = `import os,sys,json,base64,subprocess,tempfile,signal
p=json.load(open(sys.argv[1]))
root='/mnt/data/northstar'
os.makedirs(root,exist_ok=True)
for f in p['files']:
    dest=os.path.join(root,f['path'])
    os.makedirs(os.path.dirname(dest),exist_ok=True)
    with open(dest,'wb') as out: out.write(base64.b64decode(f['data']))
with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
    proc=subprocess.Popen(['bash','-lc',p['command']],cwd=root,stdout=out,stderr=err,start_new_session=True)
    timed_out=False
    try: proc.wait(timeout=p['timeoutMs']/1000)
    except subprocess.TimeoutExpired:
        timed_out=True
        os.killpg(proc.pid,signal.SIGKILL)
        proc.wait()
    def tail(f):
        n=f.tell(); f.seek(max(0,n-24000))
        return ('[earlier output truncated]\\n' if n>24000 else '')+f.read().decode('utf-8','replace')
    result={'stdout':tail(out),'stderr':tail(err),'exitCode':proc.returncode,'timedOut':timed_out}
receipt=os.path.join(root,p['receiptPath'])
os.makedirs(os.path.dirname(receipt),exist_ok=True)
with open(receipt,'w') as f: json.dump(result,f)
print('NORTHSTAR_EXECUTION_RESULT='+json.dumps({'receiptPath':p['receiptPath']}))
`;

export class NorthstarCreativeRuntime {
  private api: CreativeOpenAI;
  private container?: string;
  private sourceIds = new Set<string>();
  private jobs = new Map<
    string,
    { state: CreativeJob; controller: AbortController }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(
    private key: string,
    private model: () => string,
    private options: {
      fetcher?: typeof fetch;
      generationModel?: string;
      editModel?: string;
      pollMs?: number;
    } = {},
  ) {
    this.api = new CreativeOpenAI(key, options.fetcher);
  }
  job(id: string): CreativeJob | undefined {
    return this.jobs.get(id)?.state;
  }
  release(id: string) {
    this.jobs.delete(id);
  }
  cancel() {
    for (const job of this.jobs.values())
      if (job.state.status === "running")
        job.controller.abort(new Error("Creative work was stopped."));
  }
  dispose() {
    this.closed = true;
    this.cancel();
    void this.queue
      .finally(async () => {
        const id = this.container;
        this.container = undefined;
        if (id)
          await this.api
            .json(
              `/containers/${id}`,
              "DELETE",
              undefined,
              AbortSignal.timeout(15000),
            )
            .catch(() => undefined);
      })
      .catch(() => undefined);
  }
  start(
    id: string,
    tool: CreativeTool,
    args: JsonObject,
    context: CreativeContext,
  ): CreativeJob {
    const existing = this.jobs.get(id);
    if (existing) return existing.state;
    if (this.closed) throw new Error("This execution workspace has closed.");
    if (this.jobs.size >= 32)
      throw new Error("Too many unacknowledged creative operations.");
    const controller = new AbortController();
    const job = { state: { status: "running" } as CreativeJob, controller };
    this.jobs.set(id, job);
    const selected = this.model();
    const work = this.queue
      .then(async () => {
        const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10 * 60_000),
        ]);
        signal.throwIfAborted();
        const result =
          tool === "generate_image"
            ? await this.image(args, context, signal)
            : tool === "workspace_export"
              ? await this.export(args, [...this.sourceIds], signal)
              : await this.run(args, context, selected, signal);
        signal.throwIfAborted();
        job.state = { status: "completed", result };
      })
      .catch((error) => {
        job.state = {
          status: "failed",
          error: (error instanceof Error
            ? error.message
            : "Creative work failed."
          )
            .replaceAll(this.key, "[redacted]")
            .slice(0, 800),
        };
      });
    this.queue = work;
    return job.state;
  }
  private inputs(
    args: JsonObject,
    context: CreativeContext,
    imageOnly = false,
  ) {
    if (!context || typeof context !== "object")
      throw new Error("Invalid creative context.");
    const refs = imageOnly
      ? Array.isArray(args.inputAssetIds)
        ? args.inputAssetIds
        : []
      : rows(args.inputs, 16).map((v) => v.assetId);
    if (refs.length > 16 || !Array.isArray(context.inputs))
      throw new Error("Invalid input asset list.");
    let total = 0;
    return refs.map((ref) => {
      const input = context.inputs.find((v) => v.reference === ref);
      if (!input)
        throw new Error(
          `Retained input asset ${string(ref)} is unavailable. Read the canvas media inventory first.`,
        );
      const data = decodeData(input.dataUrl);
      total += data.bytes.length;
      if (total > 6_000_000)
        throw new Error(
          "Input batch exceeds 6 MB. Import assets in smaller batches.",
        );
      if (
        imageOnly &&
        !["image/png", "image/jpeg", "image/webp"].includes(
          actualImageType(data.bytes) || "",
        )
      )
        throw new Error("Image edits require PNG, JPEG or WebP inputs.");
      return { ...input, ...data };
    });
  }
  private async workspace(signal: AbortSignal) {
    let restarted = false;
    if (this.container) {
      try {
        const current = await this.api.json(
          `/containers/${this.container}`,
          "GET",
          undefined,
          signal,
        );
        if (current.status === "expired") {
          this.container = undefined;
          restarted = true;
        }
      } catch (error) {
        if (
          error instanceof CreativeApiError &&
          [404, 410].includes(error.status)
        ) {
          this.container = undefined;
          restarted = true;
        } else throw error;
      }
    }
    if (!this.container) {
      const result = await this.api.json(
        "/containers",
        "POST",
        {
          name: `northstar-${randomUUID()}`,
          memory_limit: "1g",
          expires_after: { anchor: "last_active_at", minutes: 20 },
        },
        signal,
      );
      const id = string(result.id);
      if (!/^cntr_[a-zA-Z0-9]+$/.test(id))
        throw new Error("Creative service returned an invalid workspace.");
      this.container = id;
    }
    if (restarted) this.sourceIds.clear();
    return { id: this.container, restarted };
  }
  private async upload(
    container: string,
    name: string,
    bytes: Uint8Array,
    signal: AbortSignal,
  ) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), name);
    const response = await this.api.request(
      `/containers/${container}/files`,
      { method: "POST", body: form },
      signal,
    );
    const value = object(await response.json());
    const path = string(value.path);
    if (!path.startsWith("/mnt/data/") || /[\x00-\x1f]/.test(path))
      throw new Error("Creative service returned an invalid input path.");
    return path;
  }
  private async shell(
    container: string,
    command: string,
    model: string,
    signal: AbortSignal,
  ) {
    let response = await this.api.json(
      "/responses",
      "POST",
      {
        model,
        background: true,
        store: true,
        reasoning: { effort: "low" },
        max_output_tokens: 1200,
        max_tool_calls: 1,
        instructions:
          "You are an execution transport. Run the exact supplied command once using the shell tool, without changing it or adding other commands. Do not analyze the task, rewrite the script, or repeat it on failure. The tool result is the answer.",
        input: command,
        tools: [
          {
            type: "shell",
            environment: {
              type: "container_reference",
              container_id: container,
            },
          },
        ],
        tool_choice: "required",
      },
      signal,
    );
    const id = string(response.id);
    if (!/^resp_[a-zA-Z0-9]+$/.test(id))
      throw new Error(
        "Creative service returned an invalid execution response.",
      );
    try {
      while (["queued", "in_progress"].includes(string(response.status))) {
        await pause(this.options.pollMs ?? 1000, signal);
        response = await this.api.json(
          `/responses/${id}`,
          "GET",
          undefined,
          signal,
        );
      }
      if (response.status !== "completed")
        throw new Error(
          `Hosted execution ${string(response.status) || "did not complete"}. Inspect workspace state before retrying.`,
        );
      const output = Array.isArray(response.output)
        ? response.output.map(object)
        : [];
      const calls = output.filter((v) => v.type === "shell_call");
      if (
        calls.length !== 1 ||
        JSON.stringify(object(calls[0].action).commands) !==
          JSON.stringify([command])
      )
        throw new Error(
          "Execution transport changed the command. Its outcome is unverified; do not replay blindly.",
        );
      // Tool stdout may be truncated by the provider. The wrapper writes a
      // unique result file; run() retrieves those bytes through the Files API.
    } finally {
      const cleanup = AbortSignal.timeout(15000);
      if (signal.aborted)
        await this.api
          .json(`/responses/${id}/cancel`, "POST", {}, cleanup)
          .catch(() => undefined);
      await this.api
        .json(`/responses/${id}`, "DELETE", undefined, cleanup)
        .catch(() => undefined);
    }
  }
  private async run(
    args: JsonObject,
    context: CreativeContext,
    model: string,
    signal: AbortSignal,
  ): Promise<CreativeResult> {
    const command = string(args.command);
    if (!command.trim() || command.length > 64000)
      throw new Error("Provide a shell command of at most 64,000 characters.");
    const timeoutMs =
      args.timeoutMs === undefined ? 60000 : Number(args.timeoutMs);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
      throw new Error("Command timeout must be between 1 and 120 seconds.");
    const requested = rows(args.inputs, 16);
    const inputs = this.inputs(args, context);
    const files = rows(args.files, 32).map((f) => {
      workspacePath(f.path);
      if (typeof f.text !== "string")
        throw new Error("Workspace text files need text content.");
      return {
        path: string(f.path),
        data: Buffer.from(f.text).toString("base64"),
      };
    });
    for (let i = 0; i < inputs.length; i++) {
      workspacePath(requested[i].path);
      files.push({
        path: string(requested[i].path),
        data: inputs[i].bytes.toString("base64"),
      });
    }
    if (context.canvas)
      files.push({
        path: "canvas.json",
        data: Buffer.from(JSON.stringify(context.canvas)).toString("base64"),
      });
    if (
      files.some((f) => f.path === "canvas.json") &&
      files.filter((f) => f.path === "canvas.json").length > 1
    )
      throw new Error(
        "canvas.json is reserved for the current canvas snapshot.",
      );
    if (JSON.stringify(files).length > 10_000_000)
      throw new Error("Workspace input exceeds the batch transfer limit.");
    const exports = rows(args.exports, 8);
    for (const f of exports) workspacePath(f.path);
    const { id, restarted } = await this.workspace(signal);
    for (const input of inputs) this.sourceIds.add(input.id);
    const receiptPath = `.northstar-receipts/${randomUUID()}.json`;
    const payload = await this.upload(
      id,
      "run-input.json",
      Buffer.from(JSON.stringify({ files, command, timeoutMs, receiptPath })),
      signal,
    );
    const runner = await this.upload(
      id,
      "run.py",
      Buffer.from(WORKSPACE_RUNNER),
      signal,
    );
    await this.shell(
      id,
      `python ${quote(runner)} ${quote(payload)}`,
      model,
      signal,
    );
    const receipt = (await this.workspaceFiles(id, signal)).find(
      (file) => file.path === workspacePath(receiptPath),
    );
    const receiptId = string(receipt?.id);
    if (!/^cfile_[a-zA-Z0-9]+$/.test(receiptId))
      throw new Error(
        "Execution produced no verified result file. Inspect the workspace before retrying.",
      );
    const receiptResponse = await this.api.request(
      `/containers/${id}/files/${receiptId}/content`,
      { method: "GET" },
      signal,
    );
    const result = object(
      JSON.parse(
        Buffer.from(await this.api.bytes(receiptResponse, 400_000)).toString(
          "utf8",
        ),
      ),
    );
    if (
      typeof result.stdout !== "string" ||
      typeof result.stderr !== "string" ||
      !Number.isInteger(result.exitCode) ||
      typeof result.timedOut !== "boolean"
    )
      throw new Error(
        "Invalid command result file. The outcome is unverified.",
      );
    await this.api
      .json(`/containers/${id}/files/${receiptId}`, "DELETE", undefined, signal)
      .catch(() => undefined);
    const exported = await this.export(
      { ...args, exports },
      [...this.sourceIds],
      signal,
    );
    return {
      ...exported,
      summary:
        string(args.summary) || "Executed code in the session workspace.",
      execution: {
        commands: [command],
        stdout: string(result.stdout),
        stderr: string(result.stderr),
        exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
        timedOut: result.timedOut === true,
        workspace: WORKSPACE,
        canvasRevision: context.canvas?.revisionId,
      },
      warnings: [
        ...(restarted
          ? [
              "The idle workspace expired and was recreated. Only supplied inputs and retained exports are available.",
            ]
          : []),
        ...(exported.warnings ?? []),
      ],
    };
  }
  private async workspaceFiles(container: string, signal: AbortSignal) {
    const files: JsonObject[] = [];
    let after = "";
    for (let page = 0; page < 50; page++) {
      const list = await this.api.json(
        `/containers/${container}/files?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        "GET",
        undefined,
        signal,
      );
      const data = Array.isArray(list.data) ? list.data.map(object) : [];
      files.push(...data);
      if (!list.has_more) break;
      after = string(list.last_id) || string(data.at(-1)?.id);
      if (!after) throw new Error("Invalid file pagination.");
    }
    return files;
  }
  private async export(
    args: JsonObject,
    parents: string[],
    signal: AbortSignal,
  ): Promise<CreativeResult> {
    const requested = rows(args.exports, 8);
    const artifacts: NorthstarArtifact[] = [];
    const assets: CanvasV2EvidenceAsset[] = [];
    const warnings: string[] = [];
    if (!requested.length)
      return { summary: "No files requested for export.", artifacts, assets };
    if (!this.container)
      throw new Error(
        "No execution workspace exists. Run code or re-import retained assets first.",
      );
    const files = await this.workspaceFiles(this.container, signal);
    let total = 0;
    for (const item of requested) {
      const path = workspacePath(item.path);
      const file = files.find((f) => f.path === path);
      if (!file) {
        warnings.push(
          `No output file at ${string(item.path)}. It has not been exported.`,
        );
        continue;
      }
      const fid = string(file.id);
      if (!/^cfile_[a-zA-Z0-9]+$/.test(fid))
        throw new Error("Invalid container file identity.");
      const response = await this.api.request(
        `/containers/${this.container}/files/${fid}/content`,
        { method: "GET" },
        signal,
      );
      const bytes = Buffer.from(
        await this.api.bytes(response, Math.min(MAX_FILE, 16_000_000 - total)),
      );
      total += bytes.length;
      const { artifact, asset } = creativeArtifact(
        bytes,
        path,
        string(item.label) || posix.basename(path),
        "computed",
        parents,
      );
      artifacts.push(artifact);
      if (asset) assets.push(asset);
    }
    return {
      summary: `Retained ${artifacts.length} output file${artifacts.length === 1 ? "" : "s"}.`,
      artifacts,
      assets,
      warnings,
    };
  }
  private async image(
    args: JsonObject,
    context: CreativeContext,
    signal: AbortSignal,
  ): Promise<CreativeResult> {
    const prompt = string(args.prompt);
    if (!prompt.trim() || prompt.length > 32000)
      throw new Error("Provide an image prompt of at most 32,000 characters.");
    const inputs = this.inputs(args, context, true);
    const model = inputs.length
      ? this.options.editModel || "gpt-image-2.5-sunburst"
      : this.options.generationModel || "gpt-image-2.5-flare";
    const choice = (key: string, values: string[], fallback: string) => {
      const value = args[key] ?? fallback;
      if (typeof value !== "string" || !values.includes(value))
        throw new Error(`Invalid image ${key}.`);
      return value;
    };
    const fields = {
      model,
      prompt,
      n: 1,
      size: choice(
        "size",
        ["1024x1024", "1536x1024", "1024x1536", "auto"],
        "auto",
      ),
      quality: choice("quality", ["low", "medium", "high", "auto"], "medium"),
      background: choice(
        "background",
        ["opaque", "transparent", "auto"],
        "auto",
      ),
      output_format: "png",
    };
    let value: JsonObject;
    if (inputs.length) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields))
        form.append(key, String(value));
      for (const input of inputs)
        form.append(
          "image[]",
          new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
          `${input.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${input.mimeType.split("/")[1]}`,
        );
      const response = await this.api.request(
        "/images/edits",
        { method: "POST", body: form },
        signal,
      );
      value = object(
        JSON.parse(
          Buffer.from(await this.api.bytes(response, 28_000_000)).toString(
            "utf8",
          ),
        ),
      );
    } else
      value = await this.api.json(
        "/images/generations",
        "POST",
        fields,
        signal,
      );
    const row = object(Array.isArray(value.data) ? value.data[0] : undefined);
    const data = string(row.b64_json);
    if (!data || data.length > 22_000_000)
      throw new Error(
        "Image service returned no supported image or exceeded the image size limit.",
      );
    const bytes = Buffer.from(data, "base64");
    if (actualImageType(bytes) !== "image/png")
      throw new Error("Image service did not return the requested PNG.");
    const { artifact, asset } = creativeArtifact(
      bytes,
      `northstar-${randomUUID().slice(0, 8)}.png`,
      string(args.label) || "Generated image",
      "generated",
      inputs.map((i) => i.id),
      model,
    );
    return {
      summary: inputs.length
        ? "Created an edited image; the original is preserved."
        : "Created an original image.",
      artifacts: [artifact],
      assets: asset ? [asset] : [],
    };
  }
}
