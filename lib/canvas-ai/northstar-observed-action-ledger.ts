import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";

const POSITIONAL_STYLE_KEYS = new Set([
  "bottom",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "gap",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "height",
  "inset",
  "inset-block",
  "inset-inline",
  "justify-content",
  "left",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "order",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "top",
  "transform",
  "translate",
  "width",
]);

function normalizedId(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || fallback;
}

/**
 * Describe the semantic work performed by one singular design action. Different
 * encodings of the same work deliberately collapse to the same channel: a live
 * relation and positional CSS for the same subject are both placement work.
 */
export function deriveNorthstarObservedActionChannels(
  mutation: NorthstarArtboardMutationDraft,
): string[] {
  const channels = new Set<string>();

  for (const relation of mutation.relations ?? []) {
    channels.add(`placement:${normalizedId(relation.subjectId, relation.id)}`);
  }

  for (const operation of mutation.operations) {
    switch (operation.op) {
      case "insert-html":
      case "recompose-region":
      case "remove":
        channels.add(`structure:${normalizedId(operation.targetId, "artboard")}`);
        break;
      case "move":
        channels.add(`placement:${normalizedId(operation.targetId, "unknown")}`);
        break;
      case "request-space":
        channels.add("placement:artboard-envelope");
        break;
      case "set-text":
      case "set-html":
        channels.add(`content:${normalizedId(operation.targetId, "unknown")}`);
        break;
      case "set-styles": {
        const keys = Object.keys(operation.styles).map((key) => key.trim().toLowerCase());
        const category = keys.some((key) => POSITIONAL_STYLE_KEYS.has(key))
          ? "placement"
          : "appearance";
        channels.add(`${category}:${normalizedId(operation.targetId, "unknown")}`);
        break;
      }
      case "set-attributes": {
        const keys = Object.keys(operation.attributes).map((key) => key.trim().toLowerCase());
        const category = keys.some((key) => ["x", "y", "width", "height", "transform", "style"].includes(key))
          ? "placement"
          : "appearance";
        channels.add(`${category}:${normalizedId(operation.targetId, "unknown")}`);
        break;
      }
      case "set-classes":
        channels.add(`appearance:${normalizedId(operation.targetId, "unknown")}`);
        break;
      case "set-css-layer":
        channels.add(`appearance:css-layer:${normalizedId(operation.layerId, "unknown")}`);
        break;
      case "set-runtime-module":
        channels.add(`behavior:runtime-module:${normalizedId(operation.moduleId, "unknown")}`);
        break;
    }
  }

  return [...channels].sort();
}

export function findNorthstarRepeatedObservedActionChannels(
  observedChannels: ReadonlySet<string>,
  proposedChannels: readonly string[],
): string[] {
  return proposedChannels.filter((channel) => observedChannels.has(channel));
}
