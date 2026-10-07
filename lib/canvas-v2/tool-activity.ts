import type { CanvasV2ProviderAttemptAudit } from "./request-reliability";

/** A planned search is not a receipt. Only the validated researcher result qualifies. */
export function canvasV2HasConfirmedWebSearch(attempts: readonly CanvasV2ProviderAttemptAudit[]): boolean {
  return attempts.some(attempt => attempt.role === "external-researcher" && attempt.outcome === "completed");
}

export interface CanvasV2Activity {
  id: string;
  requestId: string;
  sequence: number;
  at: string;
  kind: "activity" | "progress";
  operationId?: string;
  tool?: "web-search" | "web-page";
  status?: "started" | "completed" | "failed" | "cancelled";
  label: string;
  detail?: string;
  sources?: Array<{ label: string; href: string }>;
  apps?: Array<{ name: string; iconUrl?: string }>;
}

/** Replace the same operation as it settles; duplicate delivery is harmless. */
export function mergeCanvasV2Activity(current: readonly CanvasV2Activity[], event: CanvasV2Activity): CanvasV2Activity[] {
  const previous = current.find(item => item.id === event.id);
  if (previous && previous.sequence >= event.sequence) return [...current];
  return previous ? current.map(item => item.id === event.id ? event : item) : [...current, event];
}

/** Internal drafts are attempts within work, not separate user-visible failures. */
export function canvasV2ActivitySummary(items: readonly CanvasV2Activity[], active: boolean): string {
  const latest = new Map<string, CanvasV2Activity>();
  for (const item of items) latest.set(item.label, item);
  return Array.from(latest.values(), item => {
    if (item.status === "started") return `${item.label}${active ? "…" : ""}`;
    return item.label;
  }).join(" · ");
}


/** Presentation only: retain the original activity and diagnostics for recovery/evals.
 * Keep useful reasoning, decisions and source links; translate implementation vocabulary.
 * Explicit requests about code may retain that vocabulary in answers, never raw diagnostics.
 */
export function canvasV2ReadableAgentText(text: string, technicalRequested = false, internalNames: readonly { id: string; name: string }[] = []): string {
  const links: string[] = [];
  const protectedText = text.replace(/\[[^\]\n]*\]\([^\s)]+\)|https?:\/\/[^\s)]+/g, link => {
    links.push(link); return `\uE000${links.length - 1}\uE001`;
  });
  let namedText = protectedText.replace(/(?:\*\*|__)?\bID:(?:\*\*|__)?\s*`?[\w-]+`?\s*/g, '');
  for (const { id, name } of internalNames) {
    if (!id || id === name) continue;
    namedText = namedText.replaceAll(`(${id})`, '').replaceAll(`(\`${id}\`)`, '').replaceAll(id, () => name);
  }
  const paragraphs = namedText.split(/\n\s*\n/).flatMap(paragraph => {
    // These are harness notices, not findings about the user's product or evidence.
    if (/^(?:The (?:additional check|final visual review) (?:was unavailable|could not finish)|I reached the review limit)/i.test(paragraph.trim())) return [];
    if (/\b(?:Traceback \(most recent|stack trace|credential secret|ECONNRESET|ECONNREFUSED)\b/i.test(paragraph)) return [];
    const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z“‘])/).flatMap(sentence => {
      if (/\b(?:runtime check|inspection|pixel review|motion sampling|post-edit review|provider|transport|validation|tool|process)\b.{0,120}\b(?:failed|unavailable|timed out|cannot be resolved|rejected|could not|did not respond)\b/i.test(sentence)) return [];
      if (/\bcommitted["']?\s*:\s*false\b/i.test(sentence)) return [];
      if (/\b(?:not runtime-verified|unavailable check|review is unfinished|review limit|provider credential|invalid session identity)\b/i.test(sentence)) return [];
      let readable = sentence
        .replace(/\b(?:data-canvas-v2-[\w-]+|baseRevisionId|sourceVersion|nodeId|appId|flowId|callId|requestId)\b(?:\s*[:=]\s*[`"']?[\w-]+[`"']?)?/g, 'the selected item')
        .replace(/(?:screen-|node-|asset-|flow-|revision-|request-|turn-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'the selected item')
        .replace(/(?:\*\*|__)?\bID:(?:\*\*|__)?\s*`?[\w-]+`?\s*/g, '')
        .replace(/`?[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}`? (?=identity\b)/g, 'product ')
        .replace(/\b(?:canvas_(?:read|edit|review|plan|screen(?:_\w+)?|insert_\w+|arrange_screens|product_identity)|workspace_(?:run|export)|prepare_asset|inspect_asset|generate_image|account_read)\b/g, 'the canvas');
      if (!technicalRequested) readable = readable
        .replace(/\b(?:code-native reference-like|inline SVG|code-native|SVG) icons\b/gi, 'icons')
        .replace(/\b(?:inline SVG|SVG) controls\b/gi, 'controls')
        .replace(/\b(?:DOM|HTML)\b/g, 'screen structure')
        .replace(/\b(?:stylesheet|CSS)\b/gi, 'styling')
        .replace(/\b(?:runtime|event code|JavaScript)\b/gi, 'interactions')
        .replace(/\bsource and composition level\b/gi, 'design level')
        .replace(/\bscreen sources?\b/gi, 'screen designs')
        .replace(/\b(?:retained|bound|encoded) assets?\b/gi, 'reference assets')
        .replace(/\b(?:authentic mark|mark) (?:is |are |still )?bound(?: in source)?\b/gi, 'logo is included')
        .replace(/\bretained ([A-Z][A-Z0-9]*) mark\b/g, '$1 logo')
        .replace(/\bevidence rails?\b/gi, 'reference flows')
        .replace(/\bmodal geometry\b/gi, 'sheet layout')
        .replace(/\bscrollbar chrome\b/gi, 'scrollbars')
        .replace(/\bscroll containers?\b/gi, 'scrolling areas')
        .replace(/\bviewport\b/gi, 'screen')
        .replace(/\bcanvas integrity check\b/gi, 'check of the canvas')
        .replace(/\binteraction continuity\b/gi, 'how the interactions behave')
        .replace(/\b(?:geometry|coordinates)\b/gi, 'position and size')
        .replace(/\b(?:aria-hidden|disabled):?\s*(?:true|false)\b/gi, 'visibility and availability')
        .replace(/\baria-hidden\b/g, 'hidden')
        .replace(/\bfrom \.[a-z][\w-]+/gi, 'on the selected control')
        .replace(/\b(?:zero|no) errors?(?:, no| or) overflow(?:, and no active animations)?\b/gi, 'no visible clipping')
        .replace(/\bTokens for\b/g, 'Colors for')
        .replace(/\bTokens:\s*/g, 'Palette: ')
        .replace(/#(?:[a-f0-9]{6}|[a-f0-9]{3})\b/gi, 'color')
        .replace(/`color`/g, '')
        .replace(/\bremain (?:at )?\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?(?:\s*px)?/g, 'remain the same size')
        .replace(/\b\d+\s*px gaps\b/gi, 'comfortable spacing')
        .replace(/`(?:\.[a-z][\w-]+|\[data-[^`]+)`/gi, 'the selected control');
      return [readable];
    });
    return sentences.length ? [sentences.join(' ')] : [];
  });
  return paragraphs.join('\n\n').trim().replace(/ +([,.;:])/g, '$1').replace(/\uE000(\d+)\uE001/g, (_, index: string) => links[Number(index)]);
}

export function canvasV2ReadableActivity(item: CanvasV2Activity, internalNames: readonly { id: string; name: string }[] = []): string {
  // Failed attempts remain visible as work being undertaken, never as successful receipts.
  const label = canvasV2ReadableAgentText(item.label, false, internalNames);
  if (item.status === 'failed' || item.status === 'cancelled') return label;
  const detail = item.detail && !/^https?:\/\//i.test(item.detail) ? canvasV2ReadableAgentText(item.detail, false, internalNames) : '';
  return detail || label;
}

export function canvasV2TechnicalDetailRequested(message: string): boolean {
  return /\b(?:debug|code|coding|html|css|javascript|typescript|svg|api|sdk|sql|stack trace|technical details?|implementation details?)\b/i.test(message);
}
