import { notFound } from "next/navigation";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";
import { createCanvasV2CommittedRevision } from "@/lib/canvas-v2/revisions";
import type { NorthstarSnapshot } from "@/lib/canvas-v2/sessions/types";
import { CanvasStressPerfProbe } from "./perf-probe";

export default function CanvasStressFixture() {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") notFound();
  const cards = Array.from({ length: 800 }, (_, index) => {
    const x = 100 + (index % 20) * 300;
    const y = 100 + Math.floor(index / 20) * 185;
    return `<div data-canvas-v2-node-id="stress-${index}" data-canvas-v2-writable="true" style="position:absolute;left:${x}px;top:${y}px;width:270px;height:150px;padding:18px;border-radius:16px;background:#25233b;color:white;border:1px solid #6f688f"><strong>Card ${index + 1}</strong><p>Move, resize, then select another card.</p></div>`;
  });
  const revision = createCanvasV2CommittedRevision({
    id: "stress-800", document: { html: `<main data-canvas-v2-node-id="stress-root" style="position:relative;width:6400px;height:7600px">${cards.join("")}</main>`, css: "" }, evidence: [], createdAt: "2026-10-03T12:00:00.000Z",
  });
  const snapshot: NorthstarSnapshot = { schema: 1, revision, turns: [], draft: "", model: "gpt-5.6-luna", effort: "high", viewport: { x: 800, y: 500, scale: 1 } };
  return <><CanvasStressPerfProbe /><CanvasV2Workspace initialSnapshot={snapshot} /></>;
}
