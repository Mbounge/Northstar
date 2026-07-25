import type { NorthstarIndependentCreativeReview } from "@/lib/canvas-ai/northstar-independent-creative-review";

export const NORTHSTAR_CREATIVE_JOURNAL_VERSION = "northstar.creative-journal.v1" as const;

export interface NorthstarCreativeJournalMove {
  revisionId: string;
  intention: string;
  visibleResult: string;
  affectedNodeIds: string[];
  operationKinds: string[];
  lesson: string;
  accepted: boolean;
}

export interface NorthstarCreativeJournalSnapshot {
  version: typeof NORTHSTAR_CREATIVE_JOURNAL_VERSION;
  currentUnderstanding: string;
  userOutcomeBeingSolved: string;
  authoredMoves: NorthstarCreativeJournalMove[];
  abandonedDirections: Array<{ intention: string; reason: string }>;
  unresolvedCommunicationProblems: string[];
  latestReviewerPerspective?: string;
  latestRecommendedIntervention?: string;
  cosmeticDriftWarnings: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\b(?:the|a|an|and|or|to|of|for|with|this|that|current|visual|artifact|board)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function overlapScore(left: string, right: string): number {
  const a = new Set(normalize(left).split(" ").filter(Boolean));
  const b = new Set(normalize(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

export class NorthstarCreativeJournal {
  private moves: NorthstarCreativeJournalMove[] = [];
  private abandoned: Array<{ intention: string; reason: string }> = [];
  private unresolved: string[] = [];
  private latestReview?: NorthstarIndependentCreativeReview;
  private understanding = "The agent is still discovering the strongest evidence-grounded visual argument.";

  constructor(readonly userOutcomeBeingSolved: string) {}

  recordAcceptedMove(input: Omit<NorthstarCreativeJournalMove, "accepted" | "lesson"> & { lesson?: string }): void {
    this.moves.push({
      ...input,
      accepted: true,
      lesson: input.lesson?.trim() || "The exact browser render committed this creative act; its effect must be judged before another act is authored.",
    });
    this.moves = this.moves.slice(-20);
    this.understanding = input.visibleResult.trim() || this.understanding;
  }

  recordRejectedMove(input: {
    revisionId: string;
    intention: string;
    reason: string;
    affectedNodeIds?: string[];
    operationKinds?: string[];
  }): void {
    this.moves.push({
      revisionId: input.revisionId,
      intention: input.intention,
      visibleResult: "The candidate was rejected before becoming canonical.",
      affectedNodeIds: input.affectedNodeIds ?? [],
      operationKinds: input.operationKinds ?? [],
      lesson: input.reason,
      accepted: false,
    });
    this.abandoned.push({ intention: input.intention, reason: input.reason });
    this.moves = this.moves.slice(-20);
    this.abandoned = this.abandoned.slice(-12);
  }

  recordCritique(input: { summary: string; unresolvedProblems: string[] }): void {
    const summary = input.summary.trim();
    if (summary) {
      this.understanding = summary;
      const latestAcceptedIndex = this.moves.findLastIndex((move) => move.accepted);
      if (latestAcceptedIndex >= 0) {
        this.moves[latestAcceptedIndex] = {
          ...this.moves[latestAcceptedIndex],
          lesson: summary,
        };
      }
    }
    this.unresolved = Array.from(new Set(input.unresolvedProblems.map((item) => item.trim()).filter(Boolean))).slice(0, 16);
  }

  recordIndependentReview(review: NorthstarIndependentCreativeReview): void {
    this.latestReview = review;
    this.unresolved = Array.from(new Set([
      ...review.unresolvedProblems,
      ...this.unresolved,
    ].map((item) => item.trim()).filter(Boolean))).slice(0, 16);
  }

  cosmeticDriftWarnings(): string[] {
    const warnings: string[] = [];
    const accepted = this.moves.filter((move) => move.accepted).slice(-5);
    if (accepted.length >= 3) {
      const last = accepted.at(-1)!;
      const similarIntentions = accepted.slice(0, -1).filter((move) => overlapScore(move.intention, last.intention) >= 0.72);
      if (similarIntentions.length >= 2) {
        warnings.push("Recent accepted acts repeat substantially the same intention instead of advancing the communication problem.");
      }
      const structuralKinds = new Set(["insert-html", "set-html", "move", "remove"]);
      const recentKinds = accepted.flatMap((move) => move.operationKinds);
      if (recentKinds.length > 0 && recentKinds.every((kind) => !structuralKinds.has(kind))) {
        warnings.push("Recent accepted acts are entirely non-structural; confirm that the agent is not polishing cosmetics while a larger communication problem remains.");
      }
      const nodeSignatures = accepted.map((move) => [...move.affectedNodeIds].sort().join("|"));
      if (new Set(nodeSignatures).size === 1 && nodeSignatures[0]) {
        warnings.push("Several accepted acts keep revisiting the same exact node set; reconsider the whole artifact before another local adjustment.");
      }
    }
    return warnings;
  }

  snapshot(): NorthstarCreativeJournalSnapshot {
    return {
      version: NORTHSTAR_CREATIVE_JOURNAL_VERSION,
      currentUnderstanding: this.understanding,
      userOutcomeBeingSolved: this.userOutcomeBeingSolved,
      authoredMoves: [...this.moves],
      abandonedDirections: [...this.abandoned],
      unresolvedCommunicationProblems: [...this.unresolved],
      latestReviewerPerspective: this.latestReview?.interpretation,
      latestRecommendedIntervention: this.latestReview?.recommendedIntervention,
      cosmeticDriftWarnings: this.cosmeticDriftWarnings(),
    };
  }
}
