// Northstar v0.4.8.2 — browser-authoritative acknowledgement broker for one living artboard.
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

type Waiter = {
  resolve: (ack: NorthstarArtifactMutationAcknowledgement) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type AckRegistry = {
  acknowledgements: Map<string, NorthstarArtifactMutationAcknowledgement>;
  waiters: Map<string, Set<Waiter>>;
};

const REGISTRY_KEY = "__northstarArtboardAckRegistryV041";

function registry(): AckRegistry {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: AckRegistry };
  if (!holder[REGISTRY_KEY]) {
    holder[REGISTRY_KEY] = {
      acknowledgements: new Map(),
      waiters: new Map(),
    };
  }
  return holder[REGISTRY_KEY]!;
}

export function publishNorthstarArtifactAcknowledgement(
  acknowledgement: NorthstarArtifactMutationAcknowledgement,
): void {
  const state = registry();
  state.acknowledgements.set(acknowledgement.ackToken, acknowledgement);
  const waiters = state.waiters.get(acknowledgement.ackToken);
  if (!waiters) return;
  state.waiters.delete(acknowledgement.ackToken);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(acknowledgement);
  }
  // Keep only a small recent window. Ack tokens are one-use and globally unique.
  if (state.acknowledgements.size > 256) {
    const oldest = state.acknowledgements.keys().next().value as string | undefined;
    if (oldest) state.acknowledgements.delete(oldest);
  }
}

export async function waitForNorthstarArtifactAcknowledgement(input: {
  ackToken: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<NorthstarArtifactMutationAcknowledgement> {
  const state = registry();
  const existing = state.acknowledgements.get(input.ackToken);
  if (existing) {
    state.acknowledgements.delete(input.ackToken);
    return existing;
  }

  return await new Promise<NorthstarArtifactMutationAcknowledgement>((resolve, reject) => {
    const timeoutMs = Math.max(2_000, Math.min(90_000, input.timeoutMs ?? 35_000));
    const waiter: Waiter = {
      resolve: (ack) => {
        input.signal?.removeEventListener("abort", abort);
        state.acknowledgements.delete(input.ackToken);
        resolve(ack);
      },
      reject: (error) => {
        input.signal?.removeEventListener("abort", abort);
        reject(error);
      },
      timer: setTimeout(() => {
        const bucket = state.waiters.get(input.ackToken);
        bucket?.delete(waiter);
        if (bucket?.size === 0) state.waiters.delete(input.ackToken);
        input.signal?.removeEventListener("abort", abort);
        reject(new Error(`Timed out waiting for the live artboard acknowledgement: ${input.ackToken}`));
      }, timeoutMs),
    };
    const abort = () => {
      clearTimeout(waiter.timer);
      const bucket = state.waiters.get(input.ackToken);
      bucket?.delete(waiter);
      if (bucket?.size === 0) state.waiters.delete(input.ackToken);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const bucket = state.waiters.get(input.ackToken) ?? new Set<Waiter>();
    bucket.add(waiter);
    state.waiters.set(input.ackToken, bucket);
    input.signal?.addEventListener("abort", abort, { once: true });
  });
}
