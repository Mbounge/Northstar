// Northstar v0.7.9 â€” optional cross-worker telemetry with a non-blocking local acknowledgement rendezvous.
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type RealtimeMessage = { payload?: unknown };
export type NorthstarRealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel">;

export const NORTHSTAR_ARTIFACT_ACK_EVENT = "northstar-artboard-ack";

type AcknowledgementStatus = NorthstarArtifactMutationAcknowledgement["status"];

export type NorthstarPreparedAcknowledgementWait = {
  /** Resolves after the stable artboard listener is subscribed. */
  ready: Promise<void>;
  /** Resolves only with a status accepted by this exact proposal waiter. */
  result: Promise<NorthstarArtifactMutationAcknowledgement>;
};

type StoredAck = {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  storedAt: number;
};

type Waiter = {
  artifactId: string;
  acceptedStatuses: ReadonlySet<AcknowledgementStatus>;
  resolve: (ack: NorthstarArtifactMutationAcknowledgement) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ChannelAvailabilityWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SharedArtboardChannel = {
  artifactId: string;
  client: NorthstarRealtimeClient;
  channel?: RealtimeChannel;
  generation: number;
  reconnectAttempt: number;
  subscribed: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  retirementTimer?: ReturnType<typeof setTimeout>;
  availabilityWaiters: Set<ChannelAvailabilityWaiter>;
};

type Registry = {
  acknowledgements: Map<string, StoredAck>;
  waiters: Map<string, Set<Waiter>>;
  channels: Map<string, SharedArtboardChannel>;
};

const REGISTRY_KEY = "__northstarAckStoreV0780";
const ACK_TTL_MS = 5 * 60_000;
const CHANNEL_IDLE_TTL_MS = 12 * 60_000;
const CHANNEL_SUBSCRIPTION_TIMEOUT_MS = 12_000;

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

/** Every proposal for one living artboard shares one long-lived channel. */
export function northstarArtifactAcknowledgementChannelName(artifactId: string): string {
  return `northstar-artboard-${compactHash(artifactId)}`;
}

function artifactIdFromAckToken(ackToken: string): string {
  return ackToken.split(":", 1)[0] || ackToken;
}

function isAcknowledgement(value: unknown): value is NorthstarArtifactMutationAcknowledgement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NorthstarArtifactMutationAcknowledgement>;
  return candidate.schema === "northstar.artboard-ack.v1"
    && typeof candidate.ackToken === "string"
    && typeof candidate.proposalId === "string"
    && typeof candidate.artifactId === "string"
    && typeof candidate.revisionId === "string"
    && (candidate.status === "applied" || candidate.status === "rejected" || candidate.status === "ready");
}

function registry(): Registry {
  const globalState = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  globalState[REGISTRY_KEY] ??= {
    acknowledgements: new Map(),
    waiters: new Map(),
    channels: new Map(),
  };
  return globalState[REGISTRY_KEY]!;
}

function prune(state: Registry) {
  const now = Date.now();
  for (const [token, stored] of state.acknowledgements) {
    if (now - stored.storedAt > ACK_TTL_MS) state.acknowledgements.delete(token);
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

function isTerminalFor(
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
  acceptedStatuses: ReadonlySet<AcknowledgementStatus>,
): boolean {
  return acceptedStatuses.has(acknowledgement.status);
}

function preferredAcknowledgement(
  existing: NorthstarArtifactMutationAcknowledgement | undefined,
  incoming: NorthstarArtifactMutationAcknowledgement,
): NorthstarArtifactMutationAcknowledgement {
  if (!existing) return incoming;
  // A mutation runtime can emit a provisional ready event immediately before
  // mutation-applied. Never let that weaker event overwrite a terminal result.
  const rank = (status: AcknowledgementStatus) => status === "ready" ? 0 : 1;
  return rank(incoming.status) >= rank(existing.status) ? incoming : existing;
}

export function publishNorthstarArtifactAcknowledgement(
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): void {
  const state = registry();
  prune(state);

  const stored = preferredAcknowledgement(
    state.acknowledgements.get(acknowledgement.ackToken)?.acknowledgement,
    acknowledgement,
  );
  state.acknowledgements.set(acknowledgement.ackToken, {
    acknowledgement: stored,
    storedAt: Date.now(),
  });

  const waiters = state.waiters.get(acknowledgement.ackToken);
  if (!waiters) return;
  for (const waiter of [...waiters]) {
    if (waiter.artifactId !== acknowledgement.artifactId) continue;
    if (!isTerminalFor(acknowledgement, waiter.acceptedStatuses)) continue;
    waiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(acknowledgement);
  }
  if (waiters.size === 0) state.waiters.delete(acknowledgement.ackToken);
}

export function getNorthstarArtifactAcknowledgement(
  ackToken: string,
  acceptedStatuses?: readonly AcknowledgementStatus[],
): NorthstarArtifactMutationAcknowledgement | undefined {
  const state = registry();
  prune(state);
  const acknowledgement = state.acknowledgements.get(ackToken)?.acknowledgement;
  if (!acknowledgement || !acceptedStatuses?.length) return acknowledgement;
  return acceptedStatuses.includes(acknowledgement.status) ? acknowledgement : undefined;
}

function retireSharedChannel(state: Registry, shared: SharedArtboardChannel) {
  const active = state.channels.get(shared.artifactId);
  if (active !== shared) return;
  const hasWaiters = [...state.waiters.values()].some((bucket) =>
    [...bucket].some((waiter) => waiter.artifactId === shared.artifactId),
  );
  if (hasWaiters) {
    armChannelRetirement(state, shared);
    return;
  }
  state.channels.delete(shared.artifactId);
  if (shared.reconnectTimer) clearTimeout(shared.reconnectTimer);
  for (const waiter of shared.availabilityWaiters) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(`Northstar acknowledgement listener retired before subscribing for ${shared.artifactId}.`));
  }
  shared.availabilityWaiters.clear();
  if (shared.channel) void shared.client.removeChannel(shared.channel).catch(() => undefined);
}

function armChannelRetirement(state: Registry, shared: SharedArtboardChannel) {
  if (shared.retirementTimer) clearTimeout(shared.retirementTimer);
  shared.retirementTimer = setTimeout(() => retireSharedChannel(state, shared), CHANNEL_IDLE_TTL_MS);
  unrefTimer(shared.retirementTimer);
}

function connectSharedChannel(state: Registry, shared: SharedArtboardChannel) {
  const generation = ++shared.generation;
  const channel = shared.client
    .channel(northstarArtifactAcknowledgementChannelName(shared.artifactId), {
      config: { broadcast: { self: false, ack: true } },
    })
    .on("broadcast", { event: NORTHSTAR_ARTIFACT_ACK_EVENT }, (message: RealtimeMessage) => {
      if (state.channels.get(shared.artifactId) !== shared || generation !== shared.generation) return;
      if (!isAcknowledgement(message.payload)) return;
      if (message.payload.artifactId !== shared.artifactId) return;
      publishNorthstarArtifactAcknowledgement(message.payload);
    });
  shared.channel = channel;
  channel.subscribe((status) => {
    if (state.channels.get(shared.artifactId) !== shared || generation !== shared.generation) return;
    if (status === "SUBSCRIBED") {
      shared.reconnectAttempt = 0;
      shared.subscribed = true;
      for (const waiter of shared.availabilityWaiters) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      shared.availabilityWaiters.clear();
      return;
    }
    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;

    shared.subscribed = false;
    shared.generation += 1;
    shared.channel = undefined;
    void shared.client.removeChannel(channel).catch(() => undefined);
    const backoffMs = Math.min(1_500, 100 * (2 ** Math.min(shared.reconnectAttempt, 4)));
    shared.reconnectAttempt += 1;
    if (shared.reconnectTimer) clearTimeout(shared.reconnectTimer);
    shared.reconnectTimer = setTimeout(() => connectSharedChannel(state, shared), backoffMs);
    unrefTimer(shared.reconnectTimer);
  });
}

function waitForSharedChannelSubscription(
  shared: SharedArtboardChannel,
  timeoutMs = CHANNEL_SUBSCRIPTION_TIMEOUT_MS,
): Promise<void> {
  if (shared.subscribed) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const waiter: ChannelAvailabilityWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        shared.availabilityWaiters.delete(waiter);
        reject(new Error(
          `Northstar acknowledgement listener could not subscribe for ${shared.artifactId} before dispatch.`,
        ));
      }, Math.max(1_000, timeoutMs)),
    };
    unrefTimer(waiter.timer);
    shared.availabilityWaiters.add(waiter);
    // Close the subscribe-between-check-and-register race.
    if (shared.subscribed && shared.availabilityWaiters.delete(waiter)) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  });
}

function ensureSharedArtboardChannel(input: {
  artifactId: string;
  realtime: NorthstarRealtimeClient;
}): SharedArtboardChannel {
  const state = registry();
  const existing = state.channels.get(input.artifactId);
  if (existing) {
    armChannelRetirement(state, existing);
    return existing;
  }

  const shared: SharedArtboardChannel = {
    artifactId: input.artifactId,
    client: input.realtime,
    generation: 0,
    reconnectAttempt: 0,
    subscribed: false,
    availabilityWaiters: new Set(),
  };
  state.channels.set(input.artifactId, shared);
  armChannelRetirement(state, shared);
  connectSharedChannel(state, shared);
  return shared;
}

export async function broadcastNorthstarArtifactAcknowledgement(input: {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  realtime: NorthstarRealtimeClient;
  signal?: AbortSignal;
}): Promise<void> {
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const channel = input.realtime.channel(
    northstarArtifactAcknowledgementChannelName(input.acknowledgement.artifactId),
    { config: { broadcast: { self: false, ack: true } } },
  );

  try {
    // Sending before subscribe uses Supabase's REST Broadcast path. It avoids a
    // short-lived publisher websocket and works across Next/Vercel instances.
    await channel.httpSend(NORTHSTAR_ARTIFACT_ACK_EVENT, input.acknowledgement);
    if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    await channel.httpSend(NORTHSTAR_ARTIFACT_ACK_EVENT, input.acknowledgement);
  } finally {
    await input.realtime.removeChannel(channel).catch(() => undefined);
  }
}

export function prepareNorthstarArtifactAcknowledgementWait(input: {
  ackToken: string;
  artifactId?: string;
  acceptedStatuses?: readonly AcknowledgementStatus[];
  timeoutMs?: number;
  signal?: AbortSignal;
  realtime?: NorthstarRealtimeClient;
  listenerTimeoutMs?: number;
}): NorthstarPreparedAcknowledgementWait {
  const state = registry();
  prune(state);
  const artifactId = input.artifactId ?? artifactIdFromAckToken(input.ackToken);
  const acceptedStatuses = new Set<AcknowledgementStatus>(
    input.acceptedStatuses?.length ? input.acceptedStatuses : ["ready", "applied", "rejected"],
  );
  const existing = state.acknowledgements.get(input.ackToken)?.acknowledgement;
  if (existing && existing.artifactId === artifactId && isTerminalFor(existing, acceptedStatuses)) {
    return { ready: Promise.resolve(), result: Promise.resolve(existing) };
  }

  const shared = input.realtime
    ? ensureSharedArtboardChannel({ artifactId, realtime: input.realtime })
    : undefined;
  // Dispatching onto the Canvas before this resolves recreates the exact race
  // that loses fast browser acknowledgements across Next/Vercel workers.
  // Realtime improves cross-instance delivery, but it is not allowed to gate
  // the visible client transaction. The process-local waiter is registered
  // synchronously above and the browser also redelivers through HTTP. A channel
  // reconnect therefore remains transport telemetry instead of a run failure.
  if (shared) {
    // Realtime is an optional cross-worker accelerator. Start it eagerly, but
    // never make a visible Canvas action wait for websocket availability.
    // The local waiter is already registered and the browser persists terminal
    // delivery through HTTP redelivery, so this channel is telemetry only.
    void waitForSharedChannelSubscription(shared, input.listenerTimeoutMs).catch(() => undefined);
  }
  const ready = Promise.resolve();
  const timeoutMs = Math.max(1_000, input.timeoutMs ?? 30_000);

  const result = new Promise<NorthstarArtifactMutationAcknowledgement>((resolve, reject) => {
    const bucket = state.waiters.get(input.ackToken) ?? new Set<Waiter>();
    let settled = false;

    const cleanup = (waiter: Waiter) => {
      clearTimeout(waiter.timer);
      bucket.delete(waiter);
      if (bucket.size === 0) state.waiters.delete(input.ackToken);
      input.signal?.removeEventListener("abort", abort);
      if (shared) armChannelRetirement(state, shared);
    };

    const waiter: Waiter = {
      artifactId,
      acceptedStatuses,
      resolve: (ack) => {
        if (settled) return;
        settled = true;
        cleanup(waiter);
        resolve(ack);
      },
      reject: (error) => {
        if (settled) return;
        settled = true;
        cleanup(waiter);
        reject(error);
      },
      timer: setTimeout(() => {
        const raced = getNorthstarArtifactAcknowledgement(input.ackToken, [...acceptedStatuses]);
        if (raced && raced.artifactId === artifactId) {
          waiter.resolve(raced);
          return;
        }
        waiter.reject(new Error(`Timed out waiting for proposal acknowledgement: ${input.ackToken}`));
      }, timeoutMs),
    };

    const abort = () => waiter.reject(new DOMException("Aborted", "AbortError"));
    bucket.add(waiter);
    state.waiters.set(input.ackToken, bucket);
    input.signal?.addEventListener("abort", abort, { once: true });

    const raced = getNorthstarArtifactAcknowledgement(input.ackToken, [...acceptedStatuses]);
    if (raced && raced.artifactId === artifactId) waiter.resolve(raced);
  });

  void result.catch(() => undefined);
  return { ready, result };
}

export async function waitForNorthstarArtifactAcknowledgement(input: {
  ackToken: string;
  artifactId?: string;
  acceptedStatuses?: readonly AcknowledgementStatus[];
  timeoutMs?: number;
  signal?: AbortSignal;
  realtime?: NorthstarRealtimeClient;
}): Promise<NorthstarArtifactMutationAcknowledgement> {
  const prepared = prepareNorthstarArtifactAcknowledgementWait(input);
  await prepared.ready;
  return await prepared.result;
}