export const CANVAS_V2_GATEWAY_HANDOFF_KEY = "northstar.canvas-v2.gateway-handoff.v1";

const CANVAS_V2_GATEWAY_HANDOFF_SCHEMA = "northstar.canvas-v2.gateway-handoff.v1" as const;
const CANVAS_V2_GATEWAY_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

export interface CanvasV2GatewayHandoff {
  schema: typeof CANVAS_V2_GATEWAY_HANDOFF_SCHEMA;
  id: string;
  prompt: string;
  autoSubmit: boolean;
  createdAt: number;
}

type GatewayStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// The route transition normally uses sessionStorage. This in-memory copy keeps
// same-tab navigation reliable when browser privacy settings deny storage.
let volatileHandoff: CanvasV2GatewayHandoff | undefined;

export function createCanvasV2GatewayHandoff(
  prompt: string,
  createdAt = Date.now(),
): CanvasV2GatewayHandoff {
  const normalizedPrompt = prompt.trim();
  return {
    schema: CANVAS_V2_GATEWAY_HANDOFF_SCHEMA,
    id: `gateway-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    prompt: normalizedPrompt,
    autoSubmit: normalizedPrompt.length > 0,
    createdAt,
  };
}

export function storeCanvasV2GatewayHandoff(
  storage: GatewayStorage | undefined,
  handoff: CanvasV2GatewayHandoff,
): void {
  volatileHandoff = handoff;
  try {
    storage?.setItem(CANVAS_V2_GATEWAY_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Same-tab navigation can still consume the volatile copy.
  }
}

function validCanvasV2GatewayHandoff(
  value: unknown,
  now: number,
): value is CanvasV2GatewayHandoff {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CanvasV2GatewayHandoff>;
  return candidate.schema === CANVAS_V2_GATEWAY_HANDOFF_SCHEMA
    && typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.prompt === "string"
    && typeof candidate.autoSubmit === "boolean"
    && typeof candidate.createdAt === "number"
    && Number.isFinite(candidate.createdAt)
    && candidate.createdAt <= now + 10_000
    && now - candidate.createdAt <= CANVAS_V2_GATEWAY_HANDOFF_MAX_AGE_MS
    && candidate.autoSubmit === (candidate.prompt.trim().length > 0);
}

export function takeCanvasV2GatewayHandoff(
  storage: GatewayStorage | undefined,
  now = Date.now(),
): CanvasV2GatewayHandoff | undefined {
  let stored: unknown;
  try {
    const serialized = storage?.getItem(CANVAS_V2_GATEWAY_HANDOFF_KEY);
    storage?.removeItem(CANVAS_V2_GATEWAY_HANDOFF_KEY);
    stored = serialized ? JSON.parse(serialized) : undefined;
  } catch {
    // Malformed or unavailable storage falls through to the volatile copy.
  }

  const candidate = validCanvasV2GatewayHandoff(stored, now)
    ? stored
    : validCanvasV2GatewayHandoff(volatileHandoff, now)
      ? volatileHandoff
      : undefined;
  volatileHandoff = undefined;
  return candidate;
}
