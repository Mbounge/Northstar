import {
  NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
  type NorthstarProjectionBridgeRequest,
  type NorthstarProjectionBridgeResponse,
  type NorthstarProjectionSurface,
  type NorthstarProjectionSurfaceApplyInput,
  type NorthstarProjectionSurfaceCapture,
  type NorthstarProjectionSurfacePrepareInput,
} from "@/lib/canvas-projection/types";
import {
  parseNorthstarProjectionOperation,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";

interface ProjectionBridgeResult {
  surfaceSessionId: string;
  state?: NorthstarProjectionSurfaceCapture["state"];
}

interface PendingRequest {
  target: Window;
  expectState: boolean;
  resolve(value: ProjectionBridgeResult): void;
  reject(error: unknown): void;
  timeout: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
}

export interface CreateNorthstarWindowProjectionSurfaceInput {
  getTargetWindow(): Window | null;
  ownerWindow?: Window;
  targetOrigin?: string;
  timeoutMs?: number;
  createRequestId?: () => string;
}

export interface NorthstarWindowProjectionSurface extends NorthstarProjectionSurface {
  dispose(): void;
}

function defaultRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `projection-request:${random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function failureKindForBridgeCode(code: string, retryable: boolean): "transient" | "correctable" | "terminal" {
  if (retryable) return "transient";
  if (
    code.startsWith("INVALID_") ||
    code.startsWith("UNSAFE_") ||
    code.startsWith("FORBIDDEN_") ||
    code.startsWith("DUPLICATE_") ||
    code.startsWith("TREE_") ||
    code.startsWith("TOO_MANY_") ||
    code.startsWith("UNSUPPORTED_") ||
    code.startsWith("NODE_") ||
    code === "ROOT_MUTATION_FORBIDDEN"
  ) return "correctable";
  return "terminal";
}

function parseResponse(value: unknown): NorthstarProjectionBridgeResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.protocolVersion !== NORTHSTAR_PROJECTION_PROTOCOL_VERSION ||
    candidate.type !== "northstar.projection.response" ||
    typeof candidate.requestId !== "string" ||
    typeof candidate.surfaceSessionId !== "string" ||
    typeof candidate.ok !== "boolean"
  ) return null;
  const allowed = candidate.ok
    ? new Set(["protocolVersion", "type", "requestId", "surfaceSessionId", "ok", "state"])
    : new Set(["protocolVersion", "type", "requestId", "surfaceSessionId", "ok", "code", "message", "retryable", "outcomeUnknown"]);
  const unexpected = Object.keys(candidate).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new NorthstarProjectionSurfaceError({
      code: "PROJECTION_BRIDGE_RESPONSE_INVALID",
      message: `Projection bridge response contains unsupported field ${unexpected}.`,
      failureKind: "terminal",
      outcomeUnknown: true,
    });
  }
  if (candidate.ok) {
    let state: NorthstarProjectionSurfaceCapture["state"] | undefined;
    try {
      state = candidate.state === undefined
        ? undefined
        : parseNorthstarProjectionState(candidate.state, "$.response.state");
    } catch (error) {
      throw new NorthstarProjectionSurfaceError({
        code: "PROJECTION_BRIDGE_RESPONSE_INVALID",
        message: `Projection bridge returned invalid canonical state: ${error instanceof Error ? error.message : String(error)}`,
        failureKind: "terminal",
        outcomeUnknown: true,
      });
    }
    return {
      protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
      type: "northstar.projection.response",
      requestId: candidate.requestId,
      surfaceSessionId: candidate.surfaceSessionId,
      ok: true,
      state,
    };
  }
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.message !== "string" ||
    typeof candidate.retryable !== "boolean" ||
    typeof candidate.outcomeUnknown !== "boolean"
  ) {
    throw new NorthstarProjectionSurfaceError({
      code: "PROJECTION_BRIDGE_RESPONSE_INVALID",
      message: "Projection bridge returned a malformed failure response.",
      failureKind: "terminal",
      outcomeUnknown: true,
    });
  }
  return {
    protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
    type: "northstar.projection.response",
    requestId: candidate.requestId,
    surfaceSessionId: candidate.surfaceSessionId,
    ok: false,
    code: candidate.code,
    message: candidate.message,
    retryable: candidate.retryable,
    outcomeUnknown: candidate.outcomeUnknown,
  };
}

export function createNorthstarWindowProjectionSurface(
  input: CreateNorthstarWindowProjectionSurfaceInput,
): NorthstarWindowProjectionSurface {
  const ownerWindow = input.ownerWindow ?? window;
  const targetOrigin = input.targetOrigin ?? "*";
  const timeoutMs = input.timeoutMs ?? 10_000;
  const createRequestId = input.createRequestId ?? defaultRequestId;
  const pending = new Map<string, PendingRequest>();
  let disposed = false;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("Projection surface timeoutMs must be a finite positive number.");
  }

  const onMessage = (event: MessageEvent): void => {
    let response: NorthstarProjectionBridgeResponse | null;
    try {
      response = parseResponse(event.data);
    } catch (error) {
      const requestId = (event.data as { requestId?: unknown } | null)?.requestId;
      if (typeof requestId === "string") {
        const request = pending.get(requestId);
        if (request && event.source === request.target) {
          clearTimeout(request.timeout);
          request.abortCleanup?.();
          pending.delete(requestId);
          request.reject(error);
        }
      }
      return;
    }
    if (!response) return;
    const request = pending.get(response.requestId);
    if (!request || event.source !== request.target) return;
    clearTimeout(request.timeout);
    request.abortCleanup?.();
    pending.delete(response.requestId);
    if (!response.ok) {
      request.reject(new NorthstarProjectionSurfaceError({
        code: response.code,
        message: response.message,
        failureKind: failureKindForBridgeCode(response.code, response.retryable),
        retryable: response.retryable,
        outcomeUnknown: response.outcomeUnknown,
      }));
      return;
    }
    if (request.expectState && !response.state) {
      request.reject(new NorthstarProjectionSurfaceError({
        code: "PROJECTION_BRIDGE_STATE_MISSING",
        message: "Projection bridge response omitted its canonical state.",
        failureKind: "terminal",
        outcomeUnknown: true,
      }));
      return;
    }
    request.resolve({
      surfaceSessionId: response.surfaceSessionId,
      state: response.state,
    });
  };
  ownerWindow.addEventListener("message", onMessage);

  const send = (
    request: NorthstarProjectionBridgeRequest,
    expectState: boolean,
    signal?: AbortSignal,
  ): Promise<ProjectionBridgeResult> => {
    if (disposed) {
      return Promise.reject(new NorthstarProjectionSurfaceError({
        code: "PROJECTION_SURFACE_DISPOSED",
        message: "Projection surface client has been disposed.",
        failureKind: "terminal",
      }));
    }
    if (signal?.aborted) return Promise.reject(new DOMException("Projection request was aborted.", "AbortError"));
    const target = input.getTargetWindow();
    if (!target) {
      return Promise.reject(new NorthstarProjectionSurfaceError({
        code: "PROJECTION_TARGET_UNAVAILABLE",
        message: "The projection iframe is not mounted.",
        failureKind: "transient",
      }));
    }
    if (pending.has(request.requestId)) {
      return Promise.reject(new Error(`Duplicate projection request ID ${request.requestId}.`));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(request.requestId);
        pendingRequest.abortCleanup?.();
        reject(new NorthstarProjectionSurfaceError({
          code: "PROJECTION_BRIDGE_TIMEOUT",
          message: `Projection request ${request.requestId} timed out.`,
          failureKind: "transient",
          outcomeUnknown: request.type === "northstar.projection.apply",
        }));
      }, timeoutMs);
      const pendingRequest: PendingRequest = {
        target,
        expectState,
        resolve,
        reject,
        timeout,
      };
      if (signal) {
        const abort = () => {
          clearTimeout(timeout);
          pending.delete(request.requestId);
          reject(new DOMException("Projection request was aborted.", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
        pendingRequest.abortCleanup = () => signal.removeEventListener("abort", abort);
      }
      pending.set(request.requestId, pendingRequest);
      try {
        target.postMessage(request, targetOrigin);
      } catch (error) {
        clearTimeout(timeout);
        pendingRequest.abortCleanup?.();
        pending.delete(request.requestId);
        reject(new NorthstarProjectionSurfaceError({
          code: "PROJECTION_BRIDGE_SEND_FAILED",
          message: error instanceof Error ? error.message : String(error),
          failureKind: "transient",
          outcomeUnknown: false,
        }));
      }
    });
  };

  return {
    async prepare(prepareInput: NorthstarProjectionSurfacePrepareInput) {
      const requestId = createRequestId();
      const response = await send({
        protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
        type: "northstar.projection.prepare",
        requestId,
        baseState: parseNorthstarProjectionState(prepareInput.baseState),
        operations: prepareInput.operations.map((operation) => parseNorthstarProjectionOperation(operation)),
      }, true, prepareInput.signal);
      if (!response.state) throw new Error("Projection preparation state was validated but is unavailable.");
      return { surfaceSessionId: response.surfaceSessionId, state: response.state };
    },

    async capture(signal) {
      const response = await send({
        protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
        type: "northstar.projection.capture",
        requestId: createRequestId(),
      }, true, signal);
      if (!response.state) throw new Error("Projection capture state was validated but is unavailable.");
      return { surfaceSessionId: response.surfaceSessionId, state: response.state };
    },

    async apply(applyInput: NorthstarProjectionSurfaceApplyInput) {
      await send({
        protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
        type: "northstar.projection.apply",
        requestId: createRequestId(),
        surfaceSessionId: applyInput.surfaceSessionId,
        operationIndex: applyInput.operationIndex,
        operation: parseNorthstarProjectionOperation(applyInput.operation),
      }, false, applyInput.signal);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      ownerWindow.removeEventListener("message", onMessage);
      for (const [requestId, request] of pending) {
        clearTimeout(request.timeout);
        request.abortCleanup?.();
        request.reject(new NorthstarProjectionSurfaceError({
          code: "PROJECTION_SURFACE_DISPOSED",
          message: `Projection request ${requestId} was cancelled because the client was disposed.`,
          failureKind: "terminal",
          outcomeUnknown: true,
        }));
      }
      pending.clear();
    },
  };
}
