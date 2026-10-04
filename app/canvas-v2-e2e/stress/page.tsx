import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";
import { createCanvasV2CommittedRevision } from "@/lib/canvas-v2/revisions";
import type { CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";
import type { NorthstarSnapshot } from "@/lib/canvas-v2/sessions/types";
import { CanvasStressPerfProbe } from "./perf-probe";

export const dynamic = "force-dynamic";

export default async function CanvasStressFixture({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NORTHSTAR_E2E !== "1") notFound();
  if (process.env.NODE_ENV === "production") {
    const host = (await headers()).get("host") ?? "";
    if (process.env.NORTHSTAR_LOCAL_PRODUCTION_PROBE !== "1" || !/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host)) notFound();
  }
  const composed = (await searchParams).scenario === "composition";
  const referenceNames = ["evidence-canvas", "concept-board", "evidence-constellation", "launch-strategy-studio", "decision-studio", "storyline-workspace"];
  const evidence: CanvasV2EvidenceAsset[] = composed ? referenceNames.map((name, index) => ({
    id: `stress-reference-${index}`,
    url: `/northstar/design-references/${name}.png`,
    label: `Composition reference ${name}`,
    kind: "image",
    authority: "supplied",
  })) : [];
  const cards = Array.from({ length: composed ? 240 : 800 }, (_, index) => {
    const x = 100 + (index % 20) * 300;
    const y = (composed ? 3000 : 100) + Math.floor(index / 20) * 185;
    const asset = evidence[index % referenceNames.length];
    return composed
      ? `<figure data-canvas-v2-node-id="stress-${index}" style="position:absolute;left:${x}px;top:${y}px;width:270px;height:150px;margin:0;padding:8px;border:1px solid #6f688f;border-radius:12px;background:#25233b;color:white"><img data-canvas-v2-node-id="stress-image-${index}" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-evidence-role="analysis-copy" src="${asset.url}" style="display:block;width:100%;height:116px;object-fit:cover;border-radius:7px" alt="Composition reference ${index + 1}"/><figcaption style="font:12px sans-serif;padding-top:5px">Screen ${index + 1}</figcaption></figure>`
      : `<div data-canvas-v2-node-id="stress-${index}" data-canvas-v2-writable="true" style="position:absolute;left:${x}px;top:${y}px;width:270px;height:150px;padding:18px;border-radius:16px;background:#25233b;color:white;border:1px solid #6f688f"><strong>Card ${index + 1}</strong><p>Move, resize, then select another card.</p></div>`;
  });
  const revision = createCanvasV2CommittedRevision({
    id: composed ? "stress-composition" : "stress-800", document: { html: `<main data-canvas-v2-node-id="stress-root" style="position:relative;width:6400px;height:7600px">${cards.join("")}</main>`, css: "" }, evidence, createdAt: "2026-10-03T12:00:00.000Z",
  });
  const snapshot: NorthstarSnapshot = { schema: 1, revision, turns: [], draft: "", model: "gpt-5.6-luna", effort: "high", viewport: { x: 800, y: 500, scale: 1 } };
  return <><CanvasStressPerfProbe /><CanvasV2Workspace initialSnapshot={snapshot} /></>;
}
