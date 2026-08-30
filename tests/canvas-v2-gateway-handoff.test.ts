import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_GATEWAY_HANDOFF_KEY,
  createCanvasV2GatewayHandoff,
  storeCanvasV2GatewayHandoff,
  takeCanvasV2GatewayHandoff,
} from "../lib/canvas-v2/gateway-handoff";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    value: (key: string) => values.get(key),
  };
}

test("gateway prompt is transferred once and remains private to session storage", () => {
  const storage = memoryStorage();
  const handoff = createCanvasV2GatewayHandoff("  Compare the two onboarding paths  ", 1_000);
  storeCanvasV2GatewayHandoff(storage, handoff);

  assert.ok(storage.value(CANVAS_V2_GATEWAY_HANDOFF_KEY)?.includes("Compare the two onboarding paths"));
  assert.equal(takeCanvasV2GatewayHandoff(storage, 1_100)?.prompt, "Compare the two onboarding paths");
  assert.equal(takeCanvasV2GatewayHandoff(storage, 1_100), undefined);
});

test("an empty gateway action opens Canvas without starting an inquiry", () => {
  const storage = memoryStorage();
  const handoff = createCanvasV2GatewayHandoff("   ", 2_000);
  storeCanvasV2GatewayHandoff(storage, handoff);

  assert.equal(takeCanvasV2GatewayHandoff(storage, 2_100)?.autoSubmit, false);
});

test("expired and malformed handoffs are removed instead of replayed", () => {
  const storage = memoryStorage();
  storage.setItem(CANVAS_V2_GATEWAY_HANDOFF_KEY, "not-json");
  assert.equal(takeCanvasV2GatewayHandoff(storage, 10_000), undefined);
  assert.equal(storage.value(CANVAS_V2_GATEWAY_HANDOFF_KEY), undefined);

  const expired = createCanvasV2GatewayHandoff("Old prompt", 1_000);
  storeCanvasV2GatewayHandoff(storage, expired);
  assert.equal(takeCanvasV2GatewayHandoff(storage, 1_000 + 6 * 60 * 1000), undefined);
});
