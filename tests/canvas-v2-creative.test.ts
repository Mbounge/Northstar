import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  NorthstarCreativeRuntime,
  creativeArtifact,
  workspacePath,
} from "../lib/canvas-v2/creative/runtime.server";
import { CreativeOpenAI } from "../lib/canvas-v2/creative/openai.server";
import {
  creativeResultForModel,
  runCreativeJob,
} from "../lib/canvas-v2/creative/bridge";
import type {
  CreativeContext,
  CreativeResult,
} from "../lib/canvas-v2/creative/types";
import {
  object,
  string,
  type JsonObject,
} from "../lib/canvas-v2/managed-agent/protocol";
import { CodexSessionHost } from "../lib/canvas-v2/codex-app-server/server";
import { FixtureCodex } from "../app/canvas-v2-e2e/codex/fixture";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  "base64",
);
const empty = { inputs: [] } as CreativeContext;
const tick = () => new Promise((r) => setTimeout(r, 2));
async function finish(runtime: NorthstarCreativeRuntime, id: string) {
  for (let i = 0; i < 500; i++) {
    const s = runtime.job(id)!;
    if (s.status !== "running") return s;
    await tick();
  }
  throw Error("Job did not finish");
}
function fakeApi(
  options: {
    queued?: boolean;
    changedCommand?: boolean;
    expired?: boolean;
    failImage?: boolean;
  } = {},
) {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  let creates = 0,
    uploads = 0,
    expired = options.expired;
  let receiptPath = "";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    const method = init?.method ?? "GET";
    assert.equal(url.origin, "https://api.openai.com");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-key",
    );
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    requests.push({ path, method, body });
    if (method === "DELETE" || path.endsWith("/cancel"))
      return Response.json({ deleted: true });
    if (path === "/v1/containers" && method === "POST")
      return Response.json({ id: `cntr_${++creates}` });
    if (/^\/v1\/containers\/cntr_\d+$/.test(path)) {
      if (expired) {
        expired = false;
        return Response.json({ status: "expired" });
      }
      return Response.json({ status: "running" });
    }
    if (path.endsWith("/files") && method === "POST") {
      assert.ok(body instanceof FormData);
      const f = body.get("file") as File;
      const uploaded = await f.text();
      assert.ok(!uploaded.includes("test-key"));
      if (f.name === "run-input.json")
        receiptPath = JSON.parse(uploaded).receiptPath;
      return Response.json({
        id: `cfile_in${++uploads}`,
        path: `/mnt/data/input${uploads}-${f.name}`,
      });
    }
    if (path.includes("/files?"))
      return Response.json({
        data: [
          { id: "cfile_output", path: "/mnt/data/northstar/chart.png" },
          { id: "cfile_receipt", path: `/mnt/data/northstar/${receiptPath}` },
        ],
        has_more: false,
      });
    if (path.endsWith("/files/cfile_receipt/content"))
      return Response.json({
        stdout: "42",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
    if (path.endsWith("/files/cfile_output/content")) return new Response(png);
    if (path === "/v1/responses") {
      const b = body as JsonObject;
      assert.equal(b.max_tool_calls, 1);
      assert.equal(b.model, "gpt-5.6-luna");
      assert.equal(
        object(object((b.tools as JsonObject[])[0]).environment).type,
        "container_reference",
      );
      if (options.queued)
        return Response.json({ id: "resp_queue", status: "in_progress" });
      return Response.json({
        id: "resp_done",
        status: "completed",
        output: [
          {
            type: "shell_call",
            call_id: "shell1",
            action: { commands: [options.changedCommand ? "wrong" : b.input] },
          },
          {
            type: "shell_call_output",
            call_id: "shell1",
            output: [
              {
                stdout: "[provider output truncated]",
              },
            ],
          },
        ],
      });
    }
    if (path === "/v1/images/generations" || path === "/v1/images/edits") {
      if (options.failImage)
        return Response.json(
          { error: { message: "model not available" } },
          { status: 403 },
        );
      return Response.json({ data: [{ b64_json: png.toString("base64") }] });
    }
    throw Error(`Unexpected ${method} ${path}`);
  };
  return { fetcher, requests };
}

test("workspace paths cannot overwrite host paths and malformed inputs fail before paid calls", async () => {
  for (const p of ["../x", "/etc/passwd", "a/../../b", "a\\b", "x\u0000y", ""])
    assert.throws(() => workspacePath(p));
  assert.equal(
    workspacePath("reports/layout.json"),
    "/mnt/data/northstar/reports/layout.json",
  );
  const f = fakeApi();
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    r.start(
      "bad",
      "workspace_run",
      { command: "pwd", inputs: [{ assetId: "foreign", path: "input.png" }] },
      empty,
    );
    assert.equal((await finish(r, "bad")).status, "failed");
    assert.equal(f.requests.length, 0);
  } finally {
    r.dispose();
  }
});
test("workspace executes once, reuses its isolated container and retains original file bytes", async () => {
  const f = fakeApi();
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    const args = {
      command: "python analysis.py",
      files: [{ path: "analysis.py", text: "print(42)" }],
      exports: [{ path: "chart.png", label: "Measured chart" }],
    };
    r.start("one", "workspace_run", args, empty);
    r.start("one", "workspace_run", { command: "do-not-run" }, empty);
    const a = await finish(r, "one");
    assert.equal(a.status, "completed");
    if (a.status !== "completed") return;
    assert.equal(a.result.execution?.stdout, "42");
    assert.equal(a.result.artifacts.length, 1);
    assert.equal(a.result.assets[0].authority, "calculated");
    assert.equal(
      a.result.assets[0].url,
      `data:image/png;base64,${png.toString("base64")}`,
    );
    r.start("two", "workspace_run", { command: "pwd" }, empty);
    await finish(r, "two");
    assert.equal(
      f.requests.filter(
        (r) => r.path === "/v1/containers" && r.method === "POST",
      ).length,
      1,
    );
    assert.equal(
      f.requests.filter(
        (r) => r.path === "/v1/responses" && r.method === "POST",
      ).length,
      2,
    );
  } finally {
    r.dispose();
  }
});
test("altered transport commands are not reported as verified execution", async () => {
  const f = fakeApi({ changedCommand: true });
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    r.start("a", "workspace_run", { command: "printf 42" }, empty);
    const a = await finish(r, "a");
    assert.equal(a.status, "failed");
    if (a.status === "failed") assert.match(a.error, /changed the command/);
  } finally {
    r.dispose();
  }
});
test("cancellation stops a queued response, suppresses artifacts and deletes the response", async () => {
  const f = fakeApi({ queued: true });
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", {
    ...f,
    pollMs: 1000,
  });
  try {
    r.start("a", "workspace_run", { command: "sleep 100" }, empty);
    while (!f.requests.some((r) => r.path === "/v1/responses")) await tick();
    r.cancel();
    const a = await finish(r, "a");
    assert.equal(a.status, "failed");
    assert.ok(f.requests.some((r) => r.path.endsWith("/cancel")));
    assert.ok(
      f.requests.some(
        (r) => r.path === "/v1/responses/resp_queue" && r.method === "DELETE",
      ),
    );
  } finally {
    r.dispose();
  }
});
test("image generation and edits preserve provenance without overwriting inputs", async () => {
  const f = fakeApi();
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    r.start(
      "new",
      "generate_image",
      { prompt: "An original illustration", label: "Illustration" },
      empty,
    );
    const a = await finish(r, "new");
    assert.equal(a.status, "completed");
    if (a.status !== "completed") return;
    const original = a.result.assets[0];
    assert.equal(original.authority, "inferred");
    assert.match(original.description!, /Not documentary evidence/);
    r.start(
      "edit",
      "generate_image",
      { prompt: "Make it blue", inputAssetIds: ["asset-1"] },
      {
        inputs: [
          {
            reference: "asset-1",
            id: original.id,
            label: original.label,
            dataUrl: original.url,
          },
        ],
      },
    );
    const b = await finish(r, "edit");
    assert.equal(b.status, "completed");
    if (b.status === "completed") {
      assert.deepEqual(b.result.artifacts[0].inputAssetIds, [original.id]);
      assert.notEqual(b.result.assets[0].id, original.id);
    }
    assert.equal(
      f.requests.filter((r) => r.path === "/v1/images/edits").length,
      1,
    );
    assert.equal(
      original.url,
      `data:image/png;base64,${png.toString("base64")}`,
    );
  } finally {
    r.dispose();
  }
});
test("provider access failures do not silently substitute an image model or retry paid work", async () => {
  const f = fakeApi({ failImage: true });
  const r = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    r.start("a", "generate_image", { prompt: "Image" }, empty);
    const a = await finish(r, "a");
    assert.equal(a.status, "failed");
    assert.equal(f.requests.length, 1);
  } finally {
    r.dispose();
  }
});
test("each conversation gets a distinct container, even for the same user", async () => {
  const f = fakeApi();
  const a = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f),
    b = new NorthstarCreativeRuntime("test-key", () => "gpt-5.6-luna", f);
  try {
    a.start("same", "workspace_run", { command: "pwd" }, empty);
    b.start("same", "workspace_run", { command: "pwd" }, empty);
    await Promise.all([finish(a, "same"), finish(b, "same")]);
    const ids = f.requests
      .filter((r) => r.path === "/v1/responses")
      .map(
        (r) =>
          object(object((object(r.body).tools as JsonObject[])[0]).environment)
            .container_id,
      );
    assert.equal(new Set(ids).size, 2);
  } finally {
    a.dispose();
    b.dispose();
  }
});
test("export metadata omits bytes from model context while durable artifacts keep their data", () => {
  const { artifact, asset } = creativeArtifact(
    png,
    "chart.png",
    "Chart",
    "computed",
    ["input"],
  );
  const result: CreativeResult = {
    summary: "Computed",
    artifacts: [artifact],
    assets: [asset!],
  };
  const model = creativeResultForModel(result);
  assert.ok(!JSON.stringify(model).includes(png.toString("base64")));
  assert.equal(model.assets[0].url, `northstar-asset:${asset!.id}`);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).artifacts[0], artifact);
  const svg = creativeArtifact(
    Buffer.from('<svg onload="alert(1)"></svg>'),
    "chart.svg",
    "SVG",
    "computed",
    [],
  );
  assert.equal(svg.asset, undefined);
});
test("API output bytes are bounded while reading, not only after allocating", async () => {
  const api = new CreativeOpenAI("key");
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(10));
        c.enqueue(new Uint8Array(10));
        c.close();
      },
    }),
  );
  await assert.rejects(api.bytes(response, 15), /transfer limit/);
});
test("uncertain creative start polls its receipt and never resends the operation", async () => {
  const calls: string[] = [];
  const result: CreativeResult = { summary: "done", artifacts: [], assets: [] };
  const response = await runCreativeJob(
    async (body) => {
      calls.push(string(body.op));
      if (body.op === "creative") throw Error("response lost");
      return Response.json({ status: "completed", result });
    },
    { call_id: "1", turn_id: "turn" },
    empty,
    new AbortController().signal,
  );
  assert.equal(response.summary, "done");
  assert.deepEqual(calls, ["creative", "creative-poll"]);
});
test("creative execution requires the exact pending call, turn and owner; browser cannot substitute commands", async () => {
  const f = fakeApi();
  const peer = new FixtureCodex(
    await mkdtemp(join(tmpdir(), "northstar-creative-test-")),
  );
  const host = new CodexSessionHost(
    async () => peer,
    undefined,
    undefined,
    undefined,
    6,
    (key, model) => new NorthstarCreativeRuntime(key, model, f),
  );
  const signal = new AbortController().signal;
  const opts = { owner: "owner", key: "test-key", signal };
  try {
    const created = await host.handle(
      {
        op: "create",
        requestId: "start",
        message: "hold",
        model: "gpt-5.6-luna",
      },
      opts,
    );
    const reader = created.body!.getReader();
    const first = await reader.read();
    const event = JSON.parse(
      new TextDecoder().decode(first.value).split("data: ")[1].trim(),
    );
    await reader.cancel();
    await tick();
    peer.tool("workspace_run", {
      command: "printf verified",
      summary: "Check",
    });
    const callId = `${peer.turn}:1:workspace_run`;
    const body = {
      op: "creative",
      token: event.token,
      callId,
      turnId: peer.turn,
      context: empty,
      command: "malicious override",
    };
    await assert.rejects(
      host.handle(body, { ...opts, owner: "other" }),
      /unavailable/,
    );
    await assert.rejects(
      host.handle({ ...body, turnId: "stale" }, opts),
      /no longer pending/,
    );
    const response = await host.handle(body, opts);
    assert.equal((await response.json()).status, "running");
    let job: JsonObject = {};
    for (let i = 0; i < 100; i++) {
      job = await (
        await host.handle({ ...body, op: "creative-poll" }, opts)
      ).json();
      if (job.status !== "running") break;
      await tick();
    }
    assert.equal(job.status, "completed");
    assert.deepEqual(object(object(job.result).execution).commands, [
      "printf verified",
    ]);
    assert.equal(
      f.requests.filter((r) => r.path === "/v1/responses").length,
      1,
    );
  } finally {
    host.dispose();
  }
});

test("download links resolve only retained exports, including sandbox paths, without leaking a filesystem URL", async () => {
  const { resolveArtifactLink } = await import(
    "../lib/canvas-v2/creative/download"
  );
  const a = creativeArtifact(
    Buffer.from("count\n18\n"),
    "/mnt/data/northstar/team counts.csv",
    "Team counts",
    "computed",
    [],
  ).artifact;
  assert.equal(resolveArtifactLink(`artifact:${a.id}`, [a]), a);
  assert.equal(
    resolveArtifactLink("sandbox:/mnt/data/northstar/team%20counts.csv", [a]),
    a,
  );
  assert.equal(
    resolveArtifactLink("/mnt/data/northstar/not-exported.csv", [a]),
    undefined,
  );
  assert.equal(
    resolveArtifactLink("https://example.com/team counts.csv", [a]),
    undefined,
  );
});
test("saved snapshots retain exported bytes and generation lineage independently of the execution container", async () => {
  const { encodeSnapshot, decodeSnapshot } = await import(
    "../lib/canvas-v2/sessions/snapshot"
  );
  const { createCanvasV2CommittedRevision } = await import(
    "../lib/canvas-v2/revisions"
  );
  const { artifact, asset } = creativeArtifact(
    png,
    "generated.png",
    "Original illustration",
    "generated",
    ["reference"],
  );
  const snapshot: import("../lib/canvas-v2/sessions/types").NorthstarSnapshot =
    {
      schema: 1 as const,
      revision: createCanvasV2CommittedRevision({
        id: "saved-creative",
        document: {
          html: '<div data-canvas-v2-node-id="title">Growth</div>',
          css: "",
        },
        evidence: [asset!],
        createdAt: artifact.createdAt,
      }),
      turns: [
        {
          id: "turn",
          message: "Make a visual",
          status: "responded" as const,
          createdAt: artifact.createdAt,
          artifacts: [artifact],
        },
      ],
      draft: "",
      model: "gpt-5.6-luna",
      effort: "high",
      viewport: { x: 0, y: 0, scale: 1 },
      memory: {
        assets: [asset!],
        artifacts: [artifact],
        accountPackets: [],
        accountFlows: [],
        sourceMedia: [],
        sourcePages: [],
        compositionHistory: [],
        compositionSequence: 0,
      },
    };
  const saved = decodeSnapshot(
    JSON.parse(await (await encodeSnapshot(snapshot)).text()),
  );
  assert.equal(saved.turns[0].artifacts?.[0].dataUrl, artifact.dataUrl);
  assert.equal(saved.memory?.assets[0].url, artifact.dataUrl);
  assert.deepEqual(saved.memory?.artifacts?.[0].inputAssetIds, ["reference"]);
});

test("a retained derived image can replace its original at the same model-owned node without weakening source protections", async () => {
  const { validateCanvasV2EvidenceContinuity } = await import(
    "../lib/canvas-v2/artifact-safety"
  );
  const original = creativeArtifact(
    png,
    "original.png",
    "Original",
    "generated",
    [],
  ).asset!;
  const edited = creativeArtifact(png, "edit.png", "Edited", "generated", [
    original.id,
  ]).asset!;
  const image = (
    asset: typeof original,
    node = "illustration",
    author = "northstar",
  ) => ({
    html: `<img data-canvas-v2-node-id="${node}" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-origin="northstar" data-canvas-v2-last-author="${author}" src="${asset.url}">`,
    css: "",
  });
  assert.deepEqual(
    validateCanvasV2EvidenceContinuity(image(original), image(edited), [
      original,
      edited,
    ]),
    [],
  );
  assert.ok(
    validateCanvasV2EvidenceContinuity(
      image(original),
      image(edited, "different"),
      [original, edited],
    ).length,
  );
  assert.ok(
    validateCanvasV2EvidenceContinuity(
      image(original, "illustration", "user"),
      image(edited),
      [original, edited],
    ).length,
  );
  assert.ok(
    validateCanvasV2EvidenceContinuity(
      image(original),
      image({ ...edited, tags: [] }),
      [original, { ...edited, tags: [] }],
    ).length,
  );
  const uploaded = {
    ...original,
    source: { ...original.source!, providerId: "user-upload" },
  };
  assert.ok(
    validateCanvasV2EvidenceContinuity(image(uploaded), image(edited), [
      uploaded,
      edited,
    ]).length,
  );
  assert.ok(
    validateCanvasV2EvidenceContinuity(image(original), { html: "", css: "" }, [
      original,
      edited,
    ]).length,
  );
});
