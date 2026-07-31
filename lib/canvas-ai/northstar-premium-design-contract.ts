import { createHash } from "node:crypto";

export const NORTHSTAR_PREMIUM_DESIGN_CONTRACT_VERSION =
  "northstar.premium-design-contract.v1" as const;

export const NORTHSTAR_COMMUNICATION_ROLES = [
  "thesis",
  "evidence",
  "analysis",
  "comparison",
  "relationship",
  "resolution",
  "recommendation",
  "decision",
  "risk",
  "next-step",
  "provenance",
  "context",
  "metric",
  "annotation",
] as const;

export type NorthstarCommunicationRole =
  (typeof NORTHSTAR_COMMUNICATION_ROLES)[number];

export interface NorthstarNoveltySignatureDraft {
  informationTopology?: string;
  dominantGeometry?: string;
  readingPath?: string;
  mediumCombination?: string;
  titleIntegration?: string;
  evidenceTreatment?: string;
  signatureBehavior?: string;
}

export interface NorthstarNarrativeBeatDraft {
  id?: string;
  communicationRole?: string;
  purpose?: string;
  evidenceIds?: string[];
  visibleRealization?: string;
  requiredAtPublication?: boolean;
}

export interface NorthstarAnalyticalIntentDraft {
  id?: string;
  question?: string;
  form?: string;
  sourceEvidenceIds?: string[];
  groundedClaim?: string;
  encoding?: string;
  requiredAtPublication?: boolean;
}

export interface NorthstarPremiumDesignPlanDraft {
  noveltySignature?: NorthstarNoveltySignatureDraft;
  narrativeBeats?: NorthstarNarrativeBeatDraft[];
  analyticalIntents?: NorthstarAnalyticalIntentDraft[];
  publicationOutcomes?: string[];
}

export interface NorthstarNoveltySignature {
  informationTopology: string;
  dominantGeometry: string;
  readingPath: string;
  mediumCombination: string;
  titleIntegration: string;
  evidenceTreatment: string;
  signatureBehavior: string;
  fingerprint: string;
}

export interface NorthstarNarrativeBeat {
  id: string;
  communicationRole: NorthstarCommunicationRole;
  purpose: string;
  evidenceIds: string[];
  visibleRealization: string;
  requiredAtPublication: boolean;
}

export interface NorthstarAnalyticalIntent {
  id: string;
  question: string;
  form: string;
  sourceEvidenceIds: string[];
  groundedClaim: string;
  encoding: "quantitative" | "qualitative" | "structural";
  requiredAtPublication: boolean;
}

export interface NorthstarPremiumDesignPlan {
  version: typeof NORTHSTAR_PREMIUM_DESIGN_CONTRACT_VERSION;
  noveltySignature: NorthstarNoveltySignature;
  narrativeBeats: NorthstarNarrativeBeat[];
  analyticalIntents: NorthstarAnalyticalIntent[];
  publicationOutcomes: string[];
  requiredBeatIds: string[];
  requiredCommunicationRoles: NorthstarCommunicationRole[];
  normalizationRepairs: string[];
}

export interface NorthstarNoveltyReceipt {
  fingerprint: string;
  materiallyDistinct: boolean;
  maximumSimilarity: number;
  closestRecentSignature?: string;
  reason: string;
}

const roleEnum = [...NORTHSTAR_COMMUNICATION_ROLES];

export const NORTHSTAR_PREMIUM_DESIGN_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "noveltySignature",
    "narrativeBeats",
    "analyticalIntents",
    "publicationOutcomes",
  ],
  properties: {
    noveltySignature: {
      type: "object",
      additionalProperties: false,
      required: [
        "informationTopology",
        "dominantGeometry",
        "readingPath",
        "mediumCombination",
        "titleIntegration",
        "evidenceTreatment",
        "signatureBehavior",
      ],
      properties: {
        informationTopology: { type: "string", minLength: 1, maxLength: 700 },
        dominantGeometry: { type: "string", minLength: 1, maxLength: 700 },
        readingPath: { type: "string", minLength: 1, maxLength: 700 },
        mediumCombination: { type: "string", minLength: 1, maxLength: 700 },
        titleIntegration: { type: "string", minLength: 1, maxLength: 700 },
        evidenceTreatment: { type: "string", minLength: 1, maxLength: 700 },
        signatureBehavior: { type: "string", minLength: 1, maxLength: 900 },
      },
    },
    narrativeBeats: {
      type: "array",
      minItems: 3,
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "communicationRole",
          "purpose",
          "evidenceIds",
          "visibleRealization",
          "requiredAtPublication",
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          communicationRole: { type: "string", enum: roleEnum },
          purpose: { type: "string", minLength: 1, maxLength: 900 },
          evidenceIds: {
            type: "array",
            maxItems: 48,
            items: { type: "string", minLength: 1, maxLength: 220 },
          },
          visibleRealization: { type: "string", minLength: 1, maxLength: 1200 },
          requiredAtPublication: { type: "boolean" },
        },
      },
    },
    analyticalIntents: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "question",
          "form",
          "sourceEvidenceIds",
          "groundedClaim",
          "encoding",
          "requiredAtPublication",
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          question: { type: "string", minLength: 1, maxLength: 900 },
          form: { type: "string", minLength: 1, maxLength: 700 },
          sourceEvidenceIds: {
            type: "array",
            maxItems: 48,
            items: { type: "string", minLength: 1, maxLength: 220 },
          },
          groundedClaim: { type: "string", minLength: 1, maxLength: 1200 },
          encoding: {
            type: "string",
            enum: ["quantitative", "qualitative", "structural"],
          },
          requiredAtPublication: { type: "boolean" },
        },
      },
    },
    publicationOutcomes: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 700 },
    },
  },
} as const;

function cleanText(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function cleanId(value: unknown, fallback: string): string {
  const cleaned = cleanText(value, 100)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function uniqueText(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((entry) => cleanText(entry, maximumLength)).filter(Boolean),
  )).slice(0, maximumItems);
}

function signatureSource(value: Omit<NorthstarNoveltySignature, "fingerprint">): string {
  return [
    value.informationTopology,
    value.dominantGeometry,
    value.readingPath,
    value.mediumCombination,
    value.titleIntegration,
    value.evidenceTreatment,
    value.signatureBehavior,
  ].join("\n");
}

export function northstarPremiumSignatureModelView(
  value: NorthstarNoveltySignature,
): string[] {
  return [
    `topology=${value.informationTopology}`,
    `geometry=${value.dominantGeometry}`,
    `reading=${value.readingPath}`,
    `medium=${value.mediumCombination}`,
    `title=${value.titleIntegration}`,
    `evidence=${value.evidenceTreatment}`,
    `behavior=${value.signatureBehavior}`,
    `fingerprint=${value.fingerprint}`,
  ];
}

export function sanitizeNorthstarPremiumDesignPlan(
  value: NorthstarPremiumDesignPlanDraft | undefined,
  input: {
    groundedEvidenceIds: readonly string[];
    diversityAnchor?: string;
  },
): NorthstarPremiumDesignPlan {
  const normalizationRepairs: string[] = [];
  const evidenceIds = Array.from(new Set(
    input.groundedEvidenceIds.map((id) => cleanText(id, 220)).filter(Boolean),
  ));
  const fallbackAnchor = cleanText(input.diversityAnchor, 80)
    || createHash("sha256").update(evidenceIds.join("\n") || "northstar").digest("hex").slice(0, 20);
  const signatureDraft = value?.noveltySignature;
  const signatureDefaults = {
    informationTopology: `A problem-specific evidence narrative organized around creative anchor ${fallbackAnchor}.`,
    dominantGeometry: `An asymmetric grounded composition whose geometry is authored in source revision ${fallbackAnchor}.`,
    readingPath: "Thesis to unequal evidence to visible analysis to resolution.",
    mediumCombination: "Editorial typography, complete grounded evidence, annotations, and source-authored analytical graphics.",
    titleIntegration: "The title participates in the authored reading path instead of occupying generic application chrome.",
    evidenceTreatment: "Grounded evidence remains complete while receiving unequal hierarchy, annotation, and argumentative roles.",
    signatureBehavior: `The source-authored composition visibly changes as evidence moves from proof to resolution; diversity anchor ${fallbackAnchor}.`,
  };
  const noveltyBase = {
    informationTopology: cleanText(signatureDraft?.informationTopology, 700) || signatureDefaults.informationTopology,
    dominantGeometry: cleanText(signatureDraft?.dominantGeometry, 700) || signatureDefaults.dominantGeometry,
    readingPath: cleanText(signatureDraft?.readingPath, 700) || signatureDefaults.readingPath,
    mediumCombination: cleanText(signatureDraft?.mediumCombination, 700) || signatureDefaults.mediumCombination,
    titleIntegration: cleanText(signatureDraft?.titleIntegration, 700) || signatureDefaults.titleIntegration,
    evidenceTreatment: cleanText(signatureDraft?.evidenceTreatment, 700) || signatureDefaults.evidenceTreatment,
    signatureBehavior: cleanText(signatureDraft?.signatureBehavior, 900) || signatureDefaults.signatureBehavior,
  };
  const repairedSignatureFields = Object.entries(signatureDefaults)
    .filter(([key]) => !cleanText(signatureDraft?.[key as keyof NorthstarNoveltySignatureDraft], 900))
    .map(([key]) => key);
  if (repairedSignatureFields.length > 0) {
    normalizationRepairs.push(
      `Repaired incomplete novelty fields: ${repairedSignatureFields.join(", ")}.`,
    );
  }
  const fingerprint = createHash("sha256")
    .update(signatureSource(noveltyBase))
    .digest("hex")
    .slice(0, 20);
  const noveltySignature: NorthstarNoveltySignature = {
    ...noveltyBase,
    fingerprint,
  };

  const knownEvidence = new Set(evidenceIds);
  const seenBeatIds = new Set<string>();
  const narrativeBeats = (Array.isArray(value?.narrativeBeats) ? value.narrativeBeats : [])
    .map((beat, index): NorthstarNarrativeBeat | null => {
      const id = cleanId(beat?.id, `beat-${index + 1}`);
      if (seenBeatIds.has(id)) return null;
      seenBeatIds.add(id);
      const role = cleanText(beat?.communicationRole, 40) as NorthstarCommunicationRole;
      const purpose = cleanText(beat?.purpose, 900);
      const visibleRealization = cleanText(beat?.visibleRealization, 1200);
      if (!NORTHSTAR_COMMUNICATION_ROLES.includes(role) || !purpose || !visibleRealization) return null;
      return {
        id,
        communicationRole: role,
        purpose,
        evidenceIds: uniqueText(beat?.evidenceIds, 48, 220).filter((idValue) => knownEvidence.has(idValue)),
        visibleRealization,
        requiredAtPublication: beat?.requiredAtPublication === true,
      };
    })
    .filter((beat): beat is NorthstarNarrativeBeat => Boolean(beat))
    .slice(0, 14);

  const fallbackBeat = (
    role: "thesis" | "evidence" | "resolution",
  ): NorthstarNarrativeBeat => {
    const baseId = `northstar-${role}`;
    let id = baseId;
    let suffix = 2;
    while (seenBeatIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seenBeatIds.add(id);
    if (role === "thesis") {
      return {
        id,
        communicationRole: role,
        purpose: "Make the governing evidence-backed argument immediately understandable.",
        evidenceIds: [],
        visibleRealization: "A visible authored thesis integrated into the composition.",
        requiredAtPublication: true,
      };
    }
    if (role === "evidence") {
      return {
        id,
        communicationRole: role,
        purpose: "Make the exact grounded proof visibly support the argument.",
        evidenceIds: evidenceIds.slice(0, 4),
        visibleRealization: "Unequal, inspectable evidence with an explicit argumentative role.",
        requiredAtPublication: true,
      };
    }
    return {
      id,
      communicationRole: role,
      purpose: "Resolve the user’s question through a visible evidence-backed conclusion.",
      evidenceIds: [],
      visibleRealization: "A distinct synthesis or decision ending in the authored reading path.",
      requiredAtPublication: true,
    };
  };

  for (const universalRole of ["thesis", "evidence", "resolution"] as const) {
    const existingIndex = narrativeBeats.findIndex((beat) =>
      beat.communicationRole === universalRole
    );
    if (existingIndex < 0) {
      narrativeBeats.push(fallbackBeat(universalRole));
      normalizationRepairs.push(`Added the missing required ${universalRole} narrative beat.`);
      continue;
    }
    const existing = narrativeBeats[existingIndex];
    const repairedEvidenceIds = universalRole === "evidence"
      && knownEvidence.size > 0
      && existing.evidenceIds.length === 0
      ? evidenceIds.slice(0, 4)
      : existing.evidenceIds;
    if (!existing.requiredAtPublication || repairedEvidenceIds !== existing.evidenceIds) {
      narrativeBeats[existingIndex] = {
        ...existing,
        evidenceIds: repairedEvidenceIds,
        requiredAtPublication: true,
      };
      normalizationRepairs.push(`Completed the required ${universalRole} narrative beat.`);
    }
  }

  const requiredBeats = narrativeBeats.filter((beat) => beat.requiredAtPublication);
  const requiredRoles = Array.from(new Set(
    requiredBeats.map((beat) => beat.communicationRole),
  ));

  const seenAnalyticalIds = new Set<string>();
  const analyticalIntents = (Array.isArray(value?.analyticalIntents) ? value.analyticalIntents : [])
    .map((intent, index): NorthstarAnalyticalIntent | null => {
      const id = cleanId(intent?.id, `analysis-${index + 1}`);
      if (seenAnalyticalIds.has(id)) return null;
      seenAnalyticalIds.add(id);
      const question = cleanText(intent?.question, 900);
      const form = cleanText(intent?.form, 700);
      const groundedClaim = cleanText(intent?.groundedClaim, 1200);
      const encoding = cleanText(intent?.encoding, 40) as NorthstarAnalyticalIntent["encoding"];
      if (
        !question
        || !form
        || !groundedClaim
        || !["quantitative", "qualitative", "structural"].includes(encoding)
      ) return null;
      const sourceEvidenceIds = uniqueText(intent?.sourceEvidenceIds, 48, 220)
        .filter((idValue) => knownEvidence.has(idValue));
      if (knownEvidence.size > 0 && sourceEvidenceIds.length === 0) return null;
      return {
        id,
        question,
        form,
        sourceEvidenceIds,
        groundedClaim,
        encoding,
        requiredAtPublication: intent?.requiredAtPublication === true,
      };
    })
    .filter((intent): intent is NorthstarAnalyticalIntent => Boolean(intent))
    .slice(0, 10);

  if (knownEvidence.size >= 2 && analyticalIntents.length === 0) {
    analyticalIntents.push({
      id: "northstar-grounded-structural-analysis",
      question: "What meaningful relationship in the observed evidence resolves the user’s question?",
      form: "An evidence-linked structural comparison or qualitative analytical graphic.",
      sourceEvidenceIds: evidenceIds.slice(0, 8),
      groundedClaim: "The analysis must remain limited to relationships directly visible in the grounded evidence.",
      encoding: "structural",
      requiredAtPublication: true,
    });
    normalizationRepairs.push("Added a grounded structural-analysis obligation.");
  }

  const publicationOutcomes = uniqueText(value?.publicationOutcomes, 12, 700);
  const fallbackOutcomes = [
    "The governing argument is understandable within three seconds.",
    "Every material conclusion remains traceable to visible grounded evidence.",
    "The final composition visibly resolves the user’s question.",
  ];
  for (const outcome of fallbackOutcomes) {
    if (publicationOutcomes.length >= 3) break;
    publicationOutcomes.push(outcome);
  }
  if (publicationOutcomes.length > uniqueText(value?.publicationOutcomes, 12, 700).length) {
    normalizationRepairs.push("Completed the minimum publication outcomes.");
  }

  return {
    version: NORTHSTAR_PREMIUM_DESIGN_CONTRACT_VERSION,
    noveltySignature,
    narrativeBeats,
    analyticalIntents,
    publicationOutcomes,
    requiredBeatIds: requiredBeats.map((beat) => beat.id),
    requiredCommunicationRoles: requiredRoles,
    normalizationRepairs,
  };
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/fingerprint=[a-f0-9]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function assessNorthstarStructuralNovelty(input: {
  signature: NorthstarNoveltySignature;
  recentSignatures: readonly string[];
}): NorthstarNoveltyReceipt {
  const current = northstarPremiumSignatureModelView(input.signature).join(" ");
  let maximumSimilarity = 0;
  let closestRecentSignature: string | undefined;
  for (const prior of input.recentSignatures) {
    const similarity = jaccard(tokens(current), tokens(prior));
    if (similarity > maximumSimilarity) {
      maximumSimilarity = similarity;
      closestRecentSignature = prior;
    }
  }
  const exactFingerprintRepeated = input.recentSignatures.some((prior) =>
    prior.includes(input.signature.fingerprint)
  );
  const materiallyDistinct = !exactFingerprintRepeated && maximumSimilarity < 0.68;
  return {
    fingerprint: input.signature.fingerprint,
    materiallyDistinct,
    maximumSimilarity,
    closestRecentSignature,
    reason: materiallyDistinct
      ? "The structural signature materially diverges from recent Northstar artboards."
      : exactFingerprintRepeated
        ? "The exact structural signature already exists in recent Northstar work."
        : `The proposed structure is ${Math.round(maximumSimilarity * 100)}% similar to recent Northstar work.`,
  };
}

export function northstarPremiumContractAttributes(
  plan: NorthstarPremiumDesignPlan,
  recentSignatures: readonly string[] = [],
): Record<string, string> {
  const recentRenderedFingerprints = Array.from(new Set(
    recentSignatures.flatMap((signature) =>
      Array.from(signature.matchAll(/rendered=([a-f0-9]{8,32})/gi), (match) => match[1].toLowerCase())
    ),
  )).slice(-24);
  return {
    "data-ns-premium-contract": NORTHSTAR_PREMIUM_DESIGN_CONTRACT_VERSION,
    "data-ns-design-fingerprint": plan.noveltySignature.fingerprint,
    "data-ns-required-narrative-beats": plan.requiredBeatIds.join(" "),
    "data-ns-required-communication-roles": plan.requiredCommunicationRoles.join(" "),
    "data-ns-required-analysis-ids": plan.analyticalIntents
      .filter((intent) => intent.requiredAtPublication)
      .map((intent) => intent.id)
      .join(" "),
    "data-ns-recent-rendered-structure-fingerprints": recentRenderedFingerprints.join(" "),
  };
}
