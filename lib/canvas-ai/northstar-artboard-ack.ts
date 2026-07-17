// Northstar v0.4.9.0 — idempotent acknowledgement store keyed by exact proposal identity.
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

type StoredAck = {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  storedAt: number;
};

type Waiter = {
  resolve: (ack: NorthstarArtifactMutationAcknowledgement) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Registry = {
  acknowledgements: Map<string, StoredAck>;
  waiters: Map<string, Set<Waiter>>;
};

const REGISTRY_KEY = "__northstarAckStoreV0490";
const ACK_TTL_MS = 5 * 60_000;

function registry(): Registry {
  const globalState = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  globalState[REGISTRY_KEY] ??= {
    acknowledgements: new Map(),
    waiters: new Map(),
  };
  return globalState[REGISTRY_KEY]!;
}

function prune(state: Registry) {
  const now = Date.now();
  for (const [token, stored] of state.acknowledgements) {
    if (now - stored.storedAt > ACK_TTL_MS) state.acknowledgements.delete(token);
  }
}

export function publishNorthstarArtifactAcknowledgement(
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): void {
  const state = registry();
  prune(state);

  // Store before resolving waiters. This closes ack-before-waiter races and
  // makes duplicate delivery idempotent.
  state.acknowledgements.set(acknowledgement.ackToken, {
    acknowledgement,
    storedAt: Date.now(),
  });

  const waiters = state.waiters.get(acknowledgement.ackToken);
  if (!waiters) return;
  state.waiters.delete(acknowledgement.ackToken);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(acknowledgement);
  }
}

export function getNorthstarArtifactAcknowledgement(
  ackToken: string,
): NorthstarArtifactMutationAcknowledgement | undefined {
  const state = registry();
  prune(state);
  return state.acknowledgements.get(ackToken)?.acknowledgement;
}

export async function waitForNorthstarArtifactAcknowledgement(input: {
  ackToken: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<NorthstarArtifactMutationAcknowledgement> {
  const state = registry();
  prune(state);

  const existing = state.acknowledgements.get(input.ackToken);
  if (existing) return existing.acknowledgement;

  const timeoutMs = Math.max(1_000, input.timeoutMs ?? 30_000);
  return await new Promise<NorthstarArtifactMutationAcknowledgement>((resolve, reject) => {
    const bucket = state.waiters.get(input.ackToken) ?? new Set<Waiter>();

    const cleanup = (waiter: Waiter) => {
      clearTimeout(waiter.timer);
      bucket.delete(waiter);
      if (bucket.size === 0) state.waiters.delete(input.ackToken);
      input.signal?.removeEventListener("abort", abort);
    };

    const waiter: Waiter = {
      resolve: (ack) => {
        cleanup(waiter);
        resolve(ack);
      },
      reject: (error) => {
        cleanup(waiter);
        reject(error);
      },
      timer: setTimeout(() => {
        const raced = getNorthstarArtifactAcknowledgement(input.ackToken);
        if (raced) {
          cleanup(waiter);
          resolve(raced);
          return;
        }
        cleanup(waiter);
        reject(new Error(`Timed out waiting for proposal acknowledgement: ${input.ackToken}`));
      }, timeoutMs),
    };

    const abort = () => waiter.reject(new DOMException("Aborted", "AbortError"));
    bucket.add(waiter);
    state.waiters.set(input.ackToken, bucket);
    input.signal?.addEventListener("abort", abort, { once: true });

    // Final race check after waiter registration.
    const raced = getNorthstarArtifactAcknowledgement(input.ackToken);
    if (raced) waiter.resolve(raced);
  });
}
