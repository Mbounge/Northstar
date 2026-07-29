export interface NorthstarRuntimeRealtimeChannel {
  httpSend(event: string, payload: unknown): Promise<unknown>;
  on(
    type: "broadcast",
    filter: { event: string },
    callback: (event: { payload?: unknown }) => void,
  ): NorthstarRuntimeRealtimeChannel;
  subscribe(callback: (status: string) => void): NorthstarRuntimeRealtimeChannel;
}

export interface NorthstarRuntimeRealtimeClient {
  channel(
    name: string,
    options?: { config?: { broadcast?: { self?: boolean; ack?: boolean } } },
  ): NorthstarRuntimeRealtimeChannel;
  removeChannel(channel: NorthstarRuntimeRealtimeChannel): Promise<unknown>;
}

export interface NorthstarSharedCreativeLease {
  leaseId: string;
  surfaceId: string;
  baseRevisionId: string;
  ownerRunId: string;
  expiresAt: number;
}

export type NorthstarRunTerminalState =
  | "completed"
  | "completed_with_notes"
  | "incomplete"
  | "cancelled"
  | "infrastructure_failed";

export type NorthstarRunCoordinationMessage =
  | {
      kind: "lease-response";
      requestId: string;
      runId: string;
      lease: NorthstarSharedCreativeLease;
      accepted: boolean;
      reason?: string;
      observedRevisionId?: string;
      sentAt: number;
    }
  | {
      kind: "settlement-receipt";
      requestId: string;
      runId: string;
      receipt: Record<string, unknown>;
      sentAt: number;
    };

export interface NorthstarRunSettlementDecision {
  terminalState: NorthstarRunTerminalState;
  detail: string;
  clientReceipt?: Record<string, unknown>;
}

export const NORTHSTAR_RUN_COORDINATION_EVENT = "northstar-run-coordination-v21";

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(36)}-${second.toString(36)}`;
}

export function northstarRunCoordinationChannelName(runId: string): string {
  return `northstar-run-${compactHash(runId)}`;
}

function isCoordinationMessage(value: unknown): value is NorthstarRunCoordinationMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<NorthstarRunCoordinationMessage>;
  return typeof row.requestId === "string"
    && typeof row.runId === "string"
    && typeof row.kind === "string"
    && (row.kind === "lease-response" || row.kind === "settlement-receipt");
}

export async function broadcastNorthstarRunCoordinationMessage(input: {
  realtime: NorthstarRuntimeRealtimeClient;
  runId: string;
  message: NorthstarRunCoordinationMessage;
  signal?: AbortSignal;
}): Promise<void> {
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const channel = input.realtime.channel(
    northstarRunCoordinationChannelName(input.runId),
    { config: { broadcast: { self: false, ack: true } } },
  );
  try {
    await channel.httpSend(NORTHSTAR_RUN_COORDINATION_EVENT, input.message);
    if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // Idempotent redelivery closes the short subscribe/dispatch race without any
    // process-local rendezvous or database persistence.
    await new Promise((resolve) => setTimeout(resolve, 70));
    await channel.httpSend(NORTHSTAR_RUN_COORDINATION_EVENT, input.message);
  } finally {
    await input.realtime.removeChannel(channel).catch(() => undefined);
  }
}

export function prepareNorthstarRunCoordinationWait(input: {
  realtime: NorthstarRuntimeRealtimeClient;
  runId: string;
  requestId: string;
  kind: NorthstarRunCoordinationMessage["kind"];
  timeoutMs: number;
  signal?: AbortSignal;
}): { ready: Promise<void>; result: Promise<NorthstarRunCoordinationMessage> } {
  let channel: NorthstarRuntimeRealtimeChannel | undefined;
  let settled = false;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  let resultResolve!: (message: NorthstarRunCoordinationMessage) => void;
  let resultReject!: (error: Error) => void;
  const result = new Promise<NorthstarRunCoordinationMessage>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });
  void result.catch(() => undefined);

  const cleanup = async () => {
    if (channel) await input.realtime.removeChannel(channel).catch(() => undefined);
    input.signal?.removeEventListener("abort", abort);
    clearTimeout(timer);
  };
  const finish = (message: NorthstarRunCoordinationMessage) => {
    if (settled) return;
    settled = true;
    void cleanup();
    resultResolve(message);
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    void cleanup();
    readyReject(error);
    resultReject(error);
  };
  const abort = () => fail(new DOMException("Aborted", "AbortError"));
  const timer = setTimeout(() => {
    fail(new Error(`Northstar run coordination timed out waiting for ${input.kind} ${input.requestId}.`));
  }, Math.max(2_000, input.timeoutMs));
  (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  input.signal?.addEventListener("abort", abort, { once: true });

  channel = input.realtime
    .channel(northstarRunCoordinationChannelName(input.runId), {
      config: { broadcast: { self: false, ack: true } },
    })
    .on("broadcast", { event: NORTHSTAR_RUN_COORDINATION_EVENT }, (event: { payload?: unknown }) => {
      if (!isCoordinationMessage(event.payload)) return;
      if (event.payload.runId !== input.runId || event.payload.requestId !== input.requestId || event.payload.kind !== input.kind) return;
      finish(event.payload);
    });
  channel.subscribe((status: string) => {
    if (settled) return;
    if (status === "SUBSCRIBED") {
      readyResolve();
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      fail(new Error(`Northstar run coordination channel failed before ${input.kind} ${input.requestId}.`));
    }
  });
  return { ready, result };
}

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(record: Record<string, unknown> | undefined, key: string): boolean {
  return record?.[key] === true;
}

function failedSettlementPredicates(input: {
  expectedFinalRevisionId?: string;
  client: Record<string, unknown>;
}): string[] {
  const failed: string[] = [];
  if (input.expectedFinalRevisionId) {
    if (cleanText(input.client.expectedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("expected revision echo");
    }
    if (cleanText(input.client.acknowledgedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("browser acknowledgement revision");
    }
    if (cleanText(input.client.materializedFinalRevisionId) !== input.expectedFinalRevisionId) {
      failed.push("outer-canvas materialized revision");
    }
  }
  const booleanPredicates: Array<[string, string]> = [
    ["receivedFinal", "assistant final receipt"],
    ["browserAcknowledged", "browser acknowledgement"],
    ["outerCanvasMaterialized", "outer-canvas materialization"],
    ["persistenceHealthy", "canonical persistence"],
    ["pipelineSettled", "client action pipeline settlement"],
    ["renderHealthy", "render health"],
    ["noHardFailures", "hard-failure clearance"],
    ["localOperationalHealthy", "local operational health"],
  ];
  for (const [key, label] of booleanPredicates) {
    if (!booleanValue(input.client, key)) failed.push(label);
  }
  return Array.from(new Set(failed));
}

/** One pure terminal authority used only by the long-running server run. */
export function decideNorthstarRunSettlement(input: {
  expectedFinalRevisionId?: string;
  serverState: Record<string, unknown>;
  clientReceipt?: Record<string, unknown>;
  receiptFailure?: string;
}): NorthstarRunSettlementDecision {
  const client = input.clientReceipt;
  if (!client) {
    const preserved = booleanValue(input.serverState, "operationalRevisionPreserved");
    return {
      terminalState: preserved ? "infrastructure_failed" : "incomplete",
      detail: preserved
        ? `The strongest browser-verified artboard was preserved, but the single run-owned terminal authority did not receive the required client settlement receipt.${input.receiptFailure ? ` ${input.receiptFailure}` : ""}`
        : `The single run-owned terminal authority could not verify an operational final revision.${input.receiptFailure ? ` ${input.receiptFailure}` : ""}`,
    };
  }

  const exactRevision = !input.expectedFinalRevisionId || (
    cleanText(client.expectedFinalRevisionId) === input.expectedFinalRevisionId
    && cleanText(client.acknowledgedFinalRevisionId) === input.expectedFinalRevisionId
    && cleanText(client.materializedFinalRevisionId) === input.expectedFinalRevisionId
  );
  const operational = exactRevision
    && booleanValue(client, "receivedFinal")
    && booleanValue(client, "browserAcknowledged")
    && booleanValue(client, "outerCanvasMaterialized")
    && booleanValue(client, "persistenceHealthy")
    && booleanValue(client, "pipelineSettled")
    && booleanValue(client, "renderHealthy")
    && booleanValue(client, "noHardFailures")
    && booleanValue(client, "localOperationalHealthy");
  const publicationRequired = booleanValue(input.serverState, "publicationRequired");
  const publicationVerified = !publicationRequired || (
    booleanValue(input.serverState, "publicationVerified")
    && booleanValue(input.serverState, "communicativelyReady")
    && booleanValue(input.serverState, "publicationClean")
  );
  const preserved = booleanValue(input.serverState, "operationalRevisionPreserved");

  if (operational && publicationVerified) {
    return {
      terminalState: "completed",
      detail: "The run-owned coordinator verified the exact browser-acknowledged, outer-canvas-materialized, persisted, communicatively resolved final revision.",
      clientReceipt: client,
    };
  }
  if (operational && preserved) {
    return {
      terminalState: "completed_with_notes",
      detail: "The run-owned coordinator verified the strongest operational final revision; publication remains deferred only for advisory communication or source-cleanup work.",
      clientReceipt: client,
    };
  }
  const failedPredicates = failedSettlementPredicates({
    expectedFinalRevisionId: input.expectedFinalRevisionId,
    client,
  });
  return {
    terminalState: "incomplete",
    detail: failedPredicates.length > 0
      ? `The run-owned terminal coordinator did not verify the exact end-to-end final revision contract. Failed checks: ${failedPredicates.join(", ")}.`
      : "The run-owned terminal coordinator did not verify the exact end-to-end final revision contract.",
    clientReceipt: client,
  };
}
