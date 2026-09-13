import { AsyncLocalStorage } from "node:async_hooks";
import type { CanvasV2Activity } from "./tool-activity";

const activity = new AsyncLocalStorage<(event: Omit<CanvasV2Activity, "sequence" | "at" | "requestId">) => void>();
export function emitCanvasV2Activity(event: Omit<CanvasV2Activity, "sequence" | "at" | "requestId">) {
  activity.getStore()?.(event);
}

/** Request-local event scope, never a global user/session bus. JSON callers remain compatible. */
export function streamCanvasV2Response(request: Request, run: () => Promise<Response>): Promise<Response> | Response {
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) return run();
  const requestId = request.headers.get("x-canvas-v2-request-id") ?? crypto.randomUUID();
  let closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let sequence = 0;
      const send = (value: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      };
      const abort = () => { if (!closed) { closed = true; controller.close(); } };
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
      void activity.run(event => send({ type: "event", event: { ...event, requestId, sequence: ++sequence, at: new Date().toISOString() } }), async () => {
        try {
          const response = await run();
          const body = await response.json();
          send({ type: "result", status: response.status, body });
        } catch {
          send({ type: "result", status: 500, body: { error: "The request was interrupted before a complete result arrived.", retryable: false } });
        } finally {
          request.signal.removeEventListener("abort", abort);
          if (!closed) { closed = true; controller.close(); }
        }
      });
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
