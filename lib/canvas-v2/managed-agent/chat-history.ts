import type { CanvasV2ChatTurn } from "@/components/canvas-v2/use-canvas-v2-chat";

/** Keep routing continuity bounded and separate from the exact current brief. */
export function compactCanvasV2History(turns: readonly CanvasV2ChatTurn[], maxTurns = 6) {
  const clean = (value: string, limit: number) => value
    .replace(/\b(?:nodeId|sessionId|turnId|callId|requestId|exchangeId|sourceVersion|selector)\s*[:=]\s*[A-Za-z0-9_:.\-]{8,}/gi, "[internal reference]")
    .replace(/\s+/g, " ").trim().slice(0, limit);
  return turns.slice(-maxTurns).flatMap(turn => {
    const attachmentContext = turn.attachments?.length
      ? ` [Human supplied ${turn.attachments.length} attachment${turn.attachments.length === 1 ? "" : "s"}: ${turn.attachments.map(attachment => `${attachment.name} (${attachment.kind})`).join(", ")}]`
      : "";
    const response = turn.answer || turn.loop?.clarification?.question || turn.loop?.finalSummary || turn.routeSummary;
    return [{ role: "user", text: clean(`${turn.message}${attachmentContext}`, 1600) }, ...(response ? [{ role: "assistant", text: clean(response, 1800) }] : [])];
  });
}
