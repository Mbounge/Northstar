import assert from "node:assert/strict";
import test from "node:test";
import {
  broadcastNorthstarArtifactAcknowledgement,
  prepareNorthstarArtifactAcknowledgementWait,
  publishNorthstarArtifactAcknowledgement,
  waitForNorthstarArtifactAcknowledgement,
  type NorthstarRealtimeClient,
} from "@/lib/canvas-ai/northstar-artboard-ack";
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

function acknowledgement(ackToken: string): NorthstarArtifactMutationAcknowledgement {
  const artifactId = ackToken.split(":", 1)[0] || ackToken;
  return {
    schema: "northstar.artboard-ack.v1",
    proposalId: ackToken.split(":").at(-1) || ackToken,
    ackToken,
    artifactId,
    surfaceId: artifactId,
    revisionId: "revision-2",
    baseRevisionId: "revision-1",
    mutationId: "mutation-2",
    status: "applied",
    changedNodeIds: ["artboard"],
    meaningfulChangedNodeIds: ["artboard"],
    changeKinds: ["structure"],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    acknowledgedAt: new Date().toISOString(),
  };
}

function acknowledgementToken(label: string): string {
  return `artifact-${label}-${crypto.randomUUID()}:proposal-${crypto.randomUUID()}`;
}

type Listener = (message: { payload?: unknown }) => void;
type FakeChannel = {
  topic: string;
  listener?: Listener;
  on: (type: "broadcast", filter: { event: string }, listener: Listener) => FakeChannel;
  subscribe: (callback?: (status: string) => void) => FakeChannel;
  send: (message: { type: "broadcast"; event: string; payload: NorthstarArtifactMutationAcknowledgement }) => Promise<"ok">;
  httpSend: (event: string, payload: NorthstarArtifactMutationAcknowledgement) => Promise<{ success: true }>;
};

class FakeRealtimeHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  private remainingSubscriptionFailures: number;
  subscriptionAttempts = 0;

  constructor(private readonly subscribeDelayMs = 0, subscriptionFailures = 0) {
    this.remainingSubscriptionFailures = subscriptionFailures;
  }

  client(): NorthstarRealtimeClient {
    const listeners = this.listeners;
    const subscribeDelayMs = this.subscribeDelayMs;
    const trackSubscription = () => { this.subscriptionAttempts += 1; };
    const shouldFailSubscription = () => {
      if (this.remainingSubscriptionFailures <= 0) return false;
      this.remainingSubscriptionFailures -= 1;
      return true;
    };
    const client = {
      channel(topic: string): FakeChannel {
        const channel: FakeChannel = {
          topic,
          on(_type, _filter, listener) {
            channel.listener = listener;
            return channel;
          },
          subscribe(callback) {
            trackSubscription();
            setTimeout(() => {
              if (shouldFailSubscription()) {
                callback?.("CHANNEL_ERROR");
                return;
              }
              if (channel.listener) {
                const bucket = listeners.get(topic) ?? new Set<Listener>();
                bucket.add(channel.listener);
                listeners.set(topic, bucket);
              }
              callback?.("SUBSCRIBED");
            }, subscribeDelayMs);
            return channel;
          },
          async send(message) {
            for (const listener of listeners.get(topic) ?? []) {
              listener({ payload: message.payload });
            }
            return "ok";
          },
          async httpSend(_event, payload) {
            for (const listener of listeners.get(topic) ?? []) {
              listener({ payload });
            }
            return { success: true };
          },
        };
        return channel;
      },
      async removeChannel(channel: FakeChannel) {
        if (channel.listener) listeners.get(channel.topic)?.delete(channel.listener);
        return "ok";
      },
    };
    return client as unknown as NorthstarRealtimeClient;
  }
}

test("ack-before-waiter delivery is idempotent", async () => {
  const ack = acknowledgement(acknowledgementToken("before"));
  publishNorthstarArtifactAcknowledgement(ack);
  assert.equal(
    await waitForNorthstarArtifactAcknowledgement({ ackToken: ack.ackToken, timeoutMs: 1_000 }),
    ack,
  );
});

test("waiter-before-ack delivery closes the local race", async () => {
  const ack = acknowledgement(acknowledgementToken("after"));
  const waiting = waitForNorthstarArtifactAcknowledgement({ ackToken: ack.ackToken, timeoutMs: 1_000 });
  publishNorthstarArtifactAcknowledgement(ack);
  assert.equal(await waiting, ack);
});

test("ephemeral broadcast delivers an acknowledgement between isolated clients", async () => {
  const ack = acknowledgement(acknowledgementToken("realtime"));
  const hub = new FakeRealtimeHub();
  const waiting = waitForNorthstarArtifactAcknowledgement({
    ackToken: ack.ackToken,
    timeoutMs: 2_000,
    realtime: hub.client(),
  });
  await broadcastNorthstarArtifactAcknowledgement({
    acknowledgement: ack,
    realtime: hub.client(),
  });
  assert.deepEqual(await waiting, ack);
});

test("prepared wait never blocks visible dispatch on realtime subscription", async () => {
  const ack = acknowledgement(acknowledgementToken("barrier"));
  const hub = new FakeRealtimeHub(80);
  const prepared = prepareNorthstarArtifactAcknowledgementWait({
    ackToken: ack.ackToken,
    timeoutMs: 2_000,
    realtime: hub.client(),
  });
  let ready = false;
  void prepared.ready.then(() => { ready = true; });
  await prepared.ready;
  assert.equal(ready, true);
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  await broadcastNorthstarArtifactAcknowledgement({ acknowledgement: ack, realtime: hub.client() });
  assert.deepEqual(await prepared.result, ack);
});

test("listener reconnects after a transient channel error without rejecting the proposal", async () => {
  const ack = acknowledgement(acknowledgementToken("reconnect"));
  const hub = new FakeRealtimeHub(10, 1);
  const prepared = prepareNorthstarArtifactAcknowledgementWait({
    ackToken: ack.ackToken,
    timeoutMs: 2_000,
    realtime: hub.client(),
  });

  await prepared.ready;
  await new Promise<void>((resolve) => setTimeout(resolve, 180));
  await broadcastNorthstarArtifactAcknowledgement({ acknowledgement: ack, realtime: hub.client() });
  assert.deepEqual(await prepared.result, ack);
});

test("an unavailable realtime listener cannot block the process-local acknowledgement path", async () => {
  const ack = acknowledgement(acknowledgementToken("unavailable"));
  const realtime = {
    channel() {
      const channel = {
        on() { return channel; },
        subscribe() { return channel; },
        async httpSend() { return { success: true as const }; },
      };
      return channel;
    },
    async removeChannel() { return "ok"; },
  } as unknown as NorthstarRealtimeClient;
  const prepared = prepareNorthstarArtifactAcknowledgementWait({
    ackToken: ack.ackToken,
    artifactId: ack.artifactId,
    timeoutMs: 1_000,
    listenerTimeoutMs: 1_000,
    realtime,
  });

  await prepared.ready;
  publishNorthstarArtifactAcknowledgement(ack);
  assert.deepEqual(await prepared.result, ack);
});

test("a provisional ready acknowledgement cannot complete an applied mutation waiter", async () => {
  const applied = acknowledgement(acknowledgementToken("status-aware"));
  const ready = { ...applied, status: "ready" as const };
  const waiting = waitForNorthstarArtifactAcknowledgement({
    ackToken: applied.ackToken,
    artifactId: applied.artifactId,
    acceptedStatuses: ["applied", "rejected"],
    timeoutMs: 1_000,
  });
  let settled = false;
  void waiting.then(() => { settled = true; });
  publishNorthstarArtifactAcknowledgement(ready);
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false);
  publishNorthstarArtifactAcknowledgement(applied);
  assert.deepEqual(await waiting, applied);
});

test("multiple proposals for one artboard reuse one subscribed channel", async () => {
  const artifactId = `artifact-shared-${crypto.randomUUID()}`;
  const first = acknowledgement(`${artifactId}:proposal-${crypto.randomUUID()}`);
  const second = acknowledgement(`${artifactId}:proposal-${crypto.randomUUID()}`);
  const hub = new FakeRealtimeHub();
  const client = hub.client();
  const firstWait = prepareNorthstarArtifactAcknowledgementWait({
    ackToken: first.ackToken,
    artifactId,
    realtime: client,
    timeoutMs: 2_000,
  });
  const secondWait = prepareNorthstarArtifactAcknowledgementWait({
    ackToken: second.ackToken,
    artifactId,
    realtime: client,
    timeoutMs: 2_000,
  });
  await Promise.all([firstWait.ready, secondWait.ready]);
  assert.equal(hub.subscriptionAttempts, 1);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  await broadcastNorthstarArtifactAcknowledgement({ acknowledgement: first, realtime: hub.client() });
  await broadcastNorthstarArtifactAcknowledgement({ acknowledgement: second, realtime: hub.client() });
  assert.deepEqual(await firstWait.result, first);
  assert.deepEqual(await secondWait.result, second);
});
test("contradictory terminal results block the transaction deterministically", async () => {
  const applied = acknowledgement(acknowledgementToken("contradictory"));
  const rejected: NorthstarArtifactMutationAcknowledgement = {
    ...applied,
    status: "rejected",
    reason: "A different terminal result arrived.",
    acknowledgedAt: new Date(Date.now() + 1).toISOString(),
  };
  publishNorthstarArtifactAcknowledgement(applied);
  const waiting = waitForNorthstarArtifactAcknowledgement({
    ackToken: applied.ackToken,
    artifactId: applied.artifactId,
    acceptedStatuses: ["blocked"],
    timeoutMs: 1_000,
  });
  const canonical = publishNorthstarArtifactAcknowledgement(rejected);
  assert.equal(canonical.status, "blocked");
  assert.equal(canonical.repositoryStatus, "blocked");
  assert.equal((await waiting).status, "blocked");
});

test("sync-required is a real terminal state and never becomes applied", async () => {
  const applied = acknowledgement(acknowledgementToken("sync-required"));
  const syncRequired: NorthstarArtifactMutationAcknowledgement = {
    ...applied,
    status: "sync-required",
    reason: "Proposal base does not match HEAD.",
    commitHash: "head-current",
    repositoryStatus: "sync-required",
  };
  const waiting = waitForNorthstarArtifactAcknowledgement({
    ackToken: syncRequired.ackToken,
    artifactId: syncRequired.artifactId,
    acceptedStatuses: ["sync-required", "blocked"],
    timeoutMs: 1_000,
  });
  publishNorthstarArtifactAcknowledgement(syncRequired);
  const result = await waiting;
  assert.equal(result.status, "sync-required");
  assert.notEqual(result.status, "applied");
});