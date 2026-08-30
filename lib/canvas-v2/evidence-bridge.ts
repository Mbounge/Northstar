import type { CanvasV2EvidencePacket, CanvasV2EvidenceSource } from "@/lib/canvas-v2/types";
import type { CanvasV2ExternalResearchRequest } from "@/lib/canvas-v2/discovery-state";
import type { CanvasV2ProviderAttemptAudit } from "@/lib/canvas-v2/request-reliability";

export type CanvasV2EvidenceDomain = "product" | "marketing" | "business" | "external" | "mixed";

export interface CanvasV2EvidenceProviderDescriptor {
  id: string;
  label: string;
  domains: CanvasV2EvidenceDomain[];
  kinds: CanvasV2EvidencePacket["kind"][];
}
export interface CanvasV2EvidenceProviderRequest {
  instruction: string;
  targetNames: string[];
  domains: CanvasV2EvidenceDomain[];
  continuationKeys?: string[];
  limit?: number;
  externalResearchRequest?: CanvasV2ExternalResearchRequest;
}

export interface CanvasV2EvidenceProviderResult {
  provider: CanvasV2EvidenceProviderDescriptor;
  packets: CanvasV2EvidencePacket[];
  sources: CanvasV2EvidenceSource[];
  issues: Array<{
    code: "unavailable" | "permission" | "invalid-source" | "provider-failure" | "inaccessible" | "stale" | "conflict";
    message: string;
    targetName?: string;
  }>;
  providerAttempts?: CanvasV2ProviderAttemptAudit[];
}

export interface CanvasV2EvidenceProvider {
  descriptor: CanvasV2EvidenceProviderDescriptor;
  retrieve(request: CanvasV2EvidenceProviderRequest): Promise<CanvasV2EvidenceProviderResult>;
}

export interface CanvasV2EvidenceBridgeResult {
  packets: CanvasV2EvidencePacket[];
  sources: CanvasV2EvidenceSource[];
  providers: CanvasV2EvidenceProviderDescriptor[];
  issues: CanvasV2EvidenceProviderResult["issues"];
  providerAttempts: CanvasV2ProviderAttemptAudit[];
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return Array.from(new Map(values.map((value) => [key(value), value])).values());
}

function providerApplies(provider: CanvasV2EvidenceProvider, domains: readonly CanvasV2EvidenceDomain[]): boolean {
  return domains.some((domain) => domain === "mixed" || provider.descriptor.domains.includes(domain) || provider.descriptor.domains.includes("mixed"));
}

function validateProviderResult(provider: CanvasV2EvidenceProvider, result: CanvasV2EvidenceProviderResult): CanvasV2EvidenceProviderResult {
  if (result.provider.id !== provider.descriptor.id) throw new Error(`Evidence provider ${provider.descriptor.id} returned the wrong provider identity.`);
  for (const packet of result.packets) {
    if (packet.source.providerId !== provider.descriptor.id) throw new Error(`Evidence packet ${packet.id} is not owned by provider ${provider.descriptor.id}.`);
    if (packet.source.permission === "unavailable") throw new Error(`Evidence packet ${packet.id} cannot be returned from an unavailable source.`);
  }
  return result;
}

/**
 * Provider-agnostic account evidence boundary. One provider failing never
 * erases packets returned by another provider; the failure remains inspectable
 * and the verified canvas can decide whether the missing source is material.
 */
export async function runCanvasV2EvidenceBridge(input: {
  providers: readonly CanvasV2EvidenceProvider[];
  request: CanvasV2EvidenceProviderRequest;
}): Promise<CanvasV2EvidenceBridgeResult> {
  const selected = input.providers.filter((provider) => providerApplies(provider, input.request.domains));
  const settled = await Promise.allSettled(selected.map(async (provider) => validateProviderResult(provider, await provider.retrieve(input.request))));
  const successful = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = settled.flatMap((result, index) => result.status === "rejected" ? [{
    code: "provider-failure" as const,
    message: result.reason instanceof Error ? result.reason.message : `${selected[index]?.descriptor.label ?? "Evidence provider"} failed.`,
  }] : []);
  return {
    packets: uniqueBy(successful.flatMap((result) => result.packets), (packet) => packet.id),
    sources: uniqueBy(successful.flatMap((result) => result.sources), (source) => `${source.providerId}:${source.sourceId}`),
    providers: selected.map((provider) => ({ ...provider.descriptor, domains: [...provider.descriptor.domains], kinds: [...provider.descriptor.kinds] })),
    issues: [...successful.flatMap((result) => result.issues), ...failures],
    providerAttempts: successful.flatMap((result) => result.providerAttempts ?? []),
  };
}
