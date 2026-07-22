import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarWindowProjectionSurface } from "@/lib/canvas-projection/window-surface";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";
import type { NorthstarProjectionBridgeRequest } from "@/lib/canvas-projection/types";
import { projectionFixtureState } from "@/tests/northstar-projection-fixtures";

class FakeOwnerWindow {
  private readonly listeners = new Set<(event: MessageEvent) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== "message") return;
    this.listeners.add(listener as (event: MessageEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== "message") return;
    this.listeners.delete(listener as (event: MessageEvent) => void);
  }

  dispatch(data: unknown, source: object): void {
    for (const listener of this.listeners) {
      listener({ data, source } as unknown as MessageEvent);
    }
  }
}

class FakeTargetWindow {
  constructor(
    private readonly receive: (request: NorthstarProjectionBridgeRequest, target: FakeTargetWindow) => void,
  ) {}

  postMessage(request: NorthstarProjectionBridgeRequest): void {
    this.receive(request, this);
  }
}

function successResponse(request: NorthstarProjectionBridgeRequest, state?: unknown) {
  return {
    protocolVersion: 1,
    type: "northstar.projection.response",
    requestId: request.requestId,
    surfaceSessionId: "surface-test",
    ok: true,
    ...(state === undefined ? {} : { state }),
  };
}

test("window projection surface transports capture, prepare, and state-free apply responses", async () => {
  const owner = new FakeOwnerWindow();
  const state = projectionFixtureState();
  const seen: string[] = [];
  const target = new FakeTargetWindow((request, source) => {
    seen.push(request.type);
    queueMicrotask(() => owner.dispatch(
      successResponse(request, request.type === "northstar.projection.apply" ? undefined : state),
      source,
    ));
  });
  let id = 0;
  const surface = createNorthstarWindowProjectionSurface({
    ownerWindow: owner as unknown as Window,
    getTargetWindow: () => target as unknown as Window,
    createRequestId: () => `request-${++id}`,
    timeoutMs: 100,
  });

  const captured = await surface.capture();
  assert.equal(captured.surfaceSessionId, "surface-test");
  assert.equal(captured.state.root.id, "root");
  const prepared = await surface.prepare({
    baseState: state,
    operations: [{ type: "set-text", nodeId: "title-text", text: "Prepared" }],
  });
  assert.equal(prepared.state.root.id, "root");
  await surface.apply({
    surfaceSessionId: "surface-test",
    operationIndex: 0,
    operation: { type: "set-text", nodeId: "title-text", text: "Applied" },
  });
  assert.deepEqual(seen, [
    "northstar.projection.capture",
    "northstar.projection.prepare",
    "northstar.projection.apply",
  ]);
  surface.dispose();
});

test("window projection surface rejects unknown response fields and classifies invalid browser input as correctable", async () => {
  const owner = new FakeOwnerWindow();
  let responseMode: "unknown" | "invalid" = "unknown";
  const target = new FakeTargetWindow((request, source) => {
    queueMicrotask(() => owner.dispatch(
      responseMode === "unknown"
        ? { ...successResponse(request, projectionFixtureState()), unexpected: true }
        : {
            protocolVersion: 1,
            type: "northstar.projection.response",
            requestId: request.requestId,
            surfaceSessionId: "surface-test",
            ok: false,
            code: "INVALID_STYLE_VALUE",
            message: "Browser rejected the style.",
            retryable: false,
            outcomeUnknown: false,
          },
      source,
    ));
  });
  let id = 0;
  const surface = createNorthstarWindowProjectionSurface({
    ownerWindow: owner as unknown as Window,
    getTargetWindow: () => target as unknown as Window,
    createRequestId: () => `strict-${++id}`,
    timeoutMs: 100,
  });

  await assert.rejects(surface.capture(), (error: unknown) =>
    error instanceof NorthstarProjectionSurfaceError &&
    error.code === "PROJECTION_BRIDGE_RESPONSE_INVALID" &&
    error.failureKind === "terminal");

  responseMode = "invalid";
  await assert.rejects(surface.capture(), (error: unknown) =>
    error instanceof NorthstarProjectionSurfaceError &&
    error.code === "INVALID_STYLE_VALUE" &&
    error.failureKind === "correctable");
  surface.dispose();
});

test("window projection surface ignores responses from another window and marks timed-out apply outcome uncertain", async () => {
  const owner = new FakeOwnerWindow();
  const wrongSource = {};
  const target = new FakeTargetWindow((request) => {
    queueMicrotask(() => owner.dispatch(successResponse(request), wrongSource));
  });
  const surface = createNorthstarWindowProjectionSurface({
    ownerWindow: owner as unknown as Window,
    getTargetWindow: () => target as unknown as Window,
    createRequestId: () => "timeout-request",
    timeoutMs: 10,
  });

  await assert.rejects(surface.apply({
    surfaceSessionId: "surface-test",
    operationIndex: 0,
    operation: { type: "set-text", nodeId: "title-text", text: "Unknown" },
  }), (error: unknown) =>
    error instanceof NorthstarProjectionSurfaceError &&
    error.code === "PROJECTION_BRIDGE_TIMEOUT" &&
    error.failureKind === "transient" &&
    error.outcomeUnknown);
  surface.dispose();
});

test("window projection surface treats invalid canonical bridge state as terminal", async () => {
  const owner = new FakeOwnerWindow();
  const target = new FakeTargetWindow((request, source) => {
    queueMicrotask(() => owner.dispatch(successResponse(request, { invalid: true }), source));
  });
  const surface = createNorthstarWindowProjectionSurface({
    ownerWindow: owner as unknown as Window,
    getTargetWindow: () => target as unknown as Window,
    createRequestId: () => "invalid-state-response",
    timeoutMs: 100,
  });

  await assert.rejects(surface.capture(), (error: unknown) =>
    error instanceof NorthstarProjectionSurfaceError &&
    error.code === "PROJECTION_BRIDGE_RESPONSE_INVALID" &&
    error.failureKind === "terminal" &&
    error.outcomeUnknown);
  surface.dispose();
});
