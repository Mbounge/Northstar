const INTERNAL_LANGUAGE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "discovery-state language", pattern: /\bdiscovery[- ](?:state|move|graph|orchestrator|orchestration)\b/i },
  { label: "material-unknown language", pattern: /\bmaterial unknowns?\b/i },
  { label: "information-gain language", pattern: /\bexpected information gain\b/i },
  { label: "validation-control language", pattern: /\b(?:validation backlog|validation status|design-validation|integrate-validation|result effect)\b/i },
  { label: "validation-lineage language", pattern: /\b(?:linkedUncertaintyIds|linkedCandidateIds|humanInputId|human-input node|validation ID|candidate ID|uncertainty ID)\b/i },
  { label: "source-category language", pattern: /\bsource categor(?:y|ies)\b/i },
  { label: "completion-control language", pattern: /\bcompletion (?:criteria|readiness)\b/i },
  { label: "epistemic-control language", pattern: /\bepistemic (?:kind|status|classification)\b/i },
  { label: "provider-control language", pattern: /\b(?:provider|model) attempts?\b/i },
  { label: "repair-control language", pattern: /\b(?:hidden )?(?:render|source) repair (?:pass|attempt)\b/i },
  { label: "runtime-contract language", pattern: /\b(?:source compiler|render validator|structured response schema)\b/i },
  { label: "runtime-role language", pattern: /\b(?:visual director|source author|execution contract|island registry|deferred semantic jobs?)\b/i },
  { label: "turn-control language", pattern: /\b(?:this|current|next|later) (?:source-author |design )?turn\b/i },
  { label: "private-context language", pattern: /\b(?:private|internal) (?:reasoning|runtime) context\b/i },
  { label: "internal-field language", pattern: /\b(?:openRequirements|contentOverflowNodeIds|continueWhen|stopWhen)\b/i },
  { label: "stopping-control language", pattern: /\b(?:external )?stopping condition\b/i },
];

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function visibleCanvasV2HtmlText(html: string): string {
  const accessibleLabels = Array.from(html.matchAll(/\b(?:aria-label|title|alt)\s*=\s*["']([^"']+)["']/gi), (match) => match[1]).join(" ");
  return normalized(`${accessibleLabels} ${html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")}`);
}

/**
 * Internal control vocabulary may be discussed when the person explicitly
 * asked for it. It may never appear merely because the runtime supplied the
 * same words to a model as private reasoning context.
 */
export function findCanvasV2InternalLanguageLeaks(text: string, explicitlyRequestedText = ""): string[] {
  const visible = normalized(text);
  const requested = normalized(explicitlyRequestedText);
  if (!visible) return [];
  return INTERNAL_LANGUAGE_PATTERNS.flatMap(({ label, pattern }) => (
    pattern.test(visible) && !pattern.test(requested) ? [label] : []
  ));
}

export function assertCanvasV2UserFacingLanguage(text: string, label: string, explicitlyRequestedText = ""): void {
  const leaks = findCanvasV2InternalLanguageLeaks(text, explicitlyRequestedText);
  if (!leaks.length) return;
  throw new Error(`${label} exposes North Star's private runtime vocabulary (${leaks.join(", ")}). Express the same meaning in ordinary domain language.`);
}

export function assertCanvasV2AuthoredPatchLanguage(
  operations: readonly ({ op: string; html?: string; css?: string })[],
  explicitlyRequestedText = "",
): void {
  const visible = operations.flatMap((operation) => {
    const htmlText = operation.html ? visibleCanvasV2HtmlText(operation.html) : "";
    const generatedCssText = operation.css
      ? Array.from(operation.css.matchAll(/\bcontent\s*:\s*["']([^"']+)["']/gi), (match) => match[1]).join(" ")
      : "";
    return [htmlText, generatedCssText].filter(Boolean);
  }).join(" ");
  assertCanvasV2UserFacingLanguage(visible, "The authored canvas copy", explicitlyRequestedText);
}
