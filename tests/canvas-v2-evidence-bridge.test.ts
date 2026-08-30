import assert from "node:assert/strict";
import test from "node:test";

import {
  runCanvasV2EvidenceBridge,
  type CanvasV2EvidenceProvider,
} from "../lib/canvas-v2/evidence-bridge";
import {
  CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
  type CanvasV2EvidencePacket,
  type CanvasV2EvidenceSource,
} from "../lib/canvas-v2/types";

const retrievedAt = "2026-08-26T12:00:00.000Z";

function source(providerId: string, sourceId: string): CanvasV2EvidenceSource {
  return {
    providerId,
    providerLabel: providerId,
    sourceId,
    sourceType: "fixture",
    label: sourceId,
    retrievedAt,
    permission: "authorized",
    freshness: "current-snapshot",
  };
}

function packet(providerId: string, id: string): CanvasV2EvidencePacket {
  return {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id,
    kind: "business-record",
    title: id,
    summary: "Grounded fixture evidence.",
    authority: "observed",
    source: source(providerId, `${id}:source`),
    assets: [],
    facts: [],
    metrics: [],
    limitations: [],
    tags: ["fixture"],
    createdAt: retrievedAt,
  };
}

function provider(input: {
  id: string;
  domains?: CanvasV2EvidenceProvider["descriptor"]["domains"];
  packets?: CanvasV2EvidencePacket[];
  fail?: boolean;
}): CanvasV2EvidenceProvider {
  const descriptor = {
    id: input.id,
    label: input.id,
    domains: input.domains ?? ["business"],
    kinds: ["business-record" as const],
  };
  return {
    descriptor,
    async retrieve() {
      if (input.fail) throw new Error(`${input.id} is temporarily unavailable.`);
      const packets = input.packets ?? [];
      return {
        provider: descriptor,
        packets,
        sources: packets.map((candidate) => candidate.source),
        issues: [],
      };
    },
  };
}

test("the provider bridge isolates a failed source while preserving successful grounded evidence", async () => {
  const businessPacket = packet("business-provider", "packet:business");
  const result = await runCanvasV2EvidenceBridge({
    providers: [
      provider({ id: "business-provider", packets: [businessPacket] }),
      provider({ id: "marketing-provider", domains: ["mixed"], fail: true }),
    ],
    request: { instruction: "Inspect the business and marketing evidence", targetNames: ["Awin"], domains: ["mixed"] },
  });

  assert.deepEqual(result.packets.map((candidate) => candidate.id), ["packet:business"]);
  assert.equal(result.sources[0]?.sourceId, "packet:business:source");
  assert.deepEqual(result.issues, [{ code: "provider-failure", message: "marketing-provider is temporarily unavailable." }]);
});

test("the bridge calls only providers applicable to the requested discovery domain", async () => {
  let marketingCalls = 0;
  let businessCalls = 0;
  const marketing = provider({ id: "marketing", domains: ["marketing"] });
  const business = provider({ id: "business", domains: ["business"] });
  const marketingRetrieve = marketing.retrieve.bind(marketing);
  const businessRetrieve = business.retrieve.bind(business);
  marketing.retrieve = async (request) => { marketingCalls += 1; return marketingRetrieve(request); };
  business.retrieve = async (request) => { businessCalls += 1; return businessRetrieve(request); };

  await runCanvasV2EvidenceBridge({
    providers: [marketing, business],
    request: { instruction: "Review the campaign", targetNames: ["Awin"], domains: ["marketing"] },
  });

  assert.equal(marketingCalls, 1);
  assert.equal(businessCalls, 0);
});

test("a provider cannot launder packets owned by a different provenance authority", async () => {
  const result = await runCanvasV2EvidenceBridge({
    providers: [provider({ id: "claimed-provider", packets: [packet("different-provider", "packet:forged")] })],
    request: { instruction: "Inspect the business", targetNames: ["Awin"], domains: ["business"] },
  });

  assert.deepEqual(result.packets, []);
  assert.match(result.issues[0]?.message ?? "", /not owned by provider claimed-provider/);
});
