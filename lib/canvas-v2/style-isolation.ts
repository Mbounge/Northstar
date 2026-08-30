export const CANVAS_V2_ARTIFACT_STYLE_SCOPE = '[data-canvas-v2-native-scene="true"]';

const GROUPING_AT_RULES = new Set([
  "container",
  "document",
  "layer",
  "media",
  "scope",
  "starting-style",
  "supports",
]);

function splitLeadingTrivia(value: string): { leading: string; content: string } {
  let cursor = 0;
  while (cursor < value.length) {
    const whitespace = /^\s+/.exec(value.slice(cursor));
    if (whitespace) {
      cursor += whitespace[0].length;
      continue;
    }
    if (value.startsWith("/*", cursor)) {
      const end = value.indexOf("*/", cursor + 2);
      if (end < 0) return { leading: value, content: "" };
      cursor = end + 2;
      continue;
    }
    break;
  }
  return { leading: value.slice(0, cursor), content: value.slice(cursor) };
}

function findStructuralToken(value: string, start: number): { index: number; token: "{" | ";" } | undefined {
  let quote: "\"" | "'" | undefined;
  let comment = false;
  let parentheses = 0;
  let brackets = 0;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (!parentheses && !brackets && (character === "{" || character === ";")) {
      return { index, token: character };
    }
  }
  return undefined;
}

function findClosingBrace(value: string, openingBrace: number): number | undefined {
  let quote: "\"" | "'" | undefined;
  let comment = false;
  let depth = 1;
  for (let index = openingBrace + 1; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (!depth) return index;
    }
  }
  return undefined;
}

function splitSelectorList(value: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let quote: "\"" | "'" | undefined;
  let parentheses = 0;
  let brackets = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && !parentheses && !brackets) {
      selectors.push(value.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(value.slice(start));
  return selectors;
}

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(scope)) return trimmed;

  const documentRoot = /^(?::root|html|body)(?=$|[\s.#:[>+~])/i.exec(trimmed);
  if (!documentRoot) return `${scope} ${trimmed}`;

  let remainder = trimmed.slice(documentRoot[0].length);
  // Collapse the ordinary `html body` root chain into the one public artifact
  // scope. A model may author document-root tokens for its isolated compiler,
  // but those tokens must never address the host application document.
  while (true) {
    const nextRoot = /^\s+(?::root|html|body)(?=$|[\s.#:[>+~])/i.exec(remainder);
    if (!nextRoot) break;
    remainder = remainder.slice(nextRoot[0].length);
  }
  return `${scope}${remainder}`;
}

function scopeSelectorPrelude(prelude: string, scope: string): string {
  const { leading, content } = splitLeadingTrivia(prelude);
  return `${leading}${splitSelectorList(content).map((selector) => scopeSelector(selector, scope)).join(", ")}`;
}

function scopeRuleList(css: string, scope: string): string {
  let cursor = 0;
  let output = "";
  while (cursor < css.length) {
    const structural = findStructuralToken(css, cursor);
    if (!structural) return output + css.slice(cursor);
    if (structural.token === ";") {
      output += css.slice(cursor, structural.index + 1);
      cursor = structural.index + 1;
      continue;
    }

    const closingBrace = findClosingBrace(css, structural.index);
    if (closingBrace === undefined) return output + css.slice(cursor);
    const prelude = css.slice(cursor, structural.index);
    const body = css.slice(structural.index + 1, closingBrace);
    const { content } = splitLeadingTrivia(prelude);
    const atRule = /^@(?:-\w+-)?([\w-]+)/.exec(content.trim());
    if (atRule) {
      const nested = GROUPING_AT_RULES.has(atRule[1].toLowerCase())
        ? scopeRuleList(body, scope)
        : body;
      output += `${prelude}{${nested}}`;
    } else {
      output += `${scopeSelectorPrelude(prelude, scope)}{${body}}`;
    }
    cursor = closingBrace + 1;
  }
  return output;
}

/**
 * CSS inside a descendant <style> element still participates in the host
 * document cascade. Prefix every authored selector before public rendering so
 * broad model rules can style the artifact without ever styling North Star's
 * chat, navigation, dialogs, or other application chrome.
 */
export function scopeCanvasV2ArtifactCss(
  css: string,
  scope = CANVAS_V2_ARTIFACT_STYLE_SCOPE,
): string {
  return scopeRuleList(css, scope);
}
