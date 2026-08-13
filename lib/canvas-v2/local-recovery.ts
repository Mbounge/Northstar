import {
  assertCanvasV2ArtifactDocument,
  validateCanvasV2EvidenceBindings,
  validateCanvasV2EvidenceContinuity,
} from "@/lib/canvas-v2/artifact-safety";
import {
  canvasV2ChatStatusForLoop,
  restoreCanvasV2ChatStatus,
  type CanvasV2ChatStatus,
} from "@/lib/canvas-v2/chat-lifecycle";
import {
  CANVAS_V2_MAX_AUTOMATIC_EDITS,
  canvasV2LoopIsActive,
  stopCanvasV2Loop,
  type CanvasV2LoopState,
} from "@/lib/canvas-v2/design-loop";
import type { CanvasV2InteractionRoute, CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import { createCanvasV2CommittedRevision } from "@/lib/canvas-v2/revisions";
import {
  CANVAS_V2_ARTIFACT_SCHEMA,
  type CanvasV2ArtifactRevision,
} from "@/lib/canvas-v2/types";

export const CANVAS_V2_LOCAL_RECOVERY_SCHEMA = "canvas-v2.local-recovery.v1" as const;
export const CANVAS_V2_LOCAL_RECOVERY_KEY = "northstar.canvas-v2.local-recovery.v1";
export const CANVAS_V2_LEGACY_ARTIFACT_KEY = "northstar.canvas-v2.committed.v2";
export const CANVAS_V2_LEGACY_CHAT_KEY = "northstar.canvas-v2.chat.v1";
export const CANVAS_V2_LOCAL_RECOVERY_MAX_HISTORY = 50;
export const CANVAS_V2_LOCAL_RECOVERY_MAX_TURNS = 30;
const MAX_SERIALIZED_CHARACTERS = 2_000_000;

export interface CanvasV2StoredChatTurn {
  id: string;
  message: string;
  createdAt: string;
  status: CanvasV2ChatStatus;
  route?: CanvasV2InteractionRoute;
  routeSummary?: string;
  answer?: string;
  canvasInstruction?: string;
  runId?: string;
  loop?: CanvasV2LoopState;
  priorLoops?: CanvasV2LoopState[];
  error?: string;
  retry?: CanvasV2RetryState;
  researchTargets?: string[];
  researchMode?: CanvasV2ResearchMode;
}

export interface CanvasV2LocalRecoveryEnvelope {
  schema: typeof CANVAS_V2_LOCAL_RECOVERY_SCHEMA;
  generation: number;
  savedAt: string;
  artifact?: {
    history: CanvasV2ArtifactRevision[];
    historyIndex: number;
  };
  chat: {
    turns: CanvasV2StoredChatTurn[];
  };
}

export interface CanvasV2LocalRecoveryRead {
  envelope?: CanvasV2LocalRecoveryEnvelope;
  notice?: string;
  writeBlocked: boolean;
}

export interface CanvasV2LocalRecoveryWrite {
  ok: boolean;
  error?: string;
}

export interface CanvasV2Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CHAT_STATUSES = new Set<CanvasV2ChatStatus>(["routing", "responded", "running", "completed", "incomplete", "stopped", "failed"]);
const ROUTES = new Set<CanvasV2InteractionRoute>(["conversation", "inspect", "transform", "research-design", "selection-transform"]);
const LOOP_STATUSES = new Set(["idle", "thinking", "rendering", "completed", "stopped", "failed", "edit-limit-reached"]);
const MOVE_KINDS = new Set(["research", "framing", "composition", "relationship", "analysis", "refinement"]);
const REQUIREMENT_STATES = new Set(["visible", "pending", "unavailable", "unresolved"]);
const FAILURE_CODES = new Set(["cancelled", "configuration", "invalid-request", "invalid-response", "rate-limited", "timeout", "transport", "provider-unavailable", "provider-rejected", "server-unavailable"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function canonicalJson(value: unknown): string {
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonical);
    const item = record(entry);
    if (!item) return entry;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])]));
  };
  return JSON.stringify(canonical(value));
}

function boundedString(value: unknown, maximum = 20_000): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function optionalString(value: unknown, maximum = 20_000): boolean {
  return value === undefined || boundedString(value, maximum);
}

function stringArray(value: unknown, maximumItems: number, maximumLength = 2_000): value is string[] {
  return Array.isArray(value) && value.length <= maximumItems && value.every((entry) => boundedString(entry, maximumLength));
}

function validCreativeDirection(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && boundedString(item.designIntent)
    && boundedString(item.visualThesis)
    && boundedString(item.compositionStrategy)
    && boundedString(item.visualLanguage)
    && boundedString(item.evidenceStrategy)
    && boundedString(item.currentFocus)
    && stringArray(item.nextMoves, 20));
}

function validSpatialStrategy(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && ["stable", "horizontal", "vertical", "both"].includes(String(item.growthDirection))
    && boundedString(item.layoutSystem)
    && boundedString(item.primaryAnchor)
    && boundedString(item.hierarchyAndScale)
    && boundedString(item.spacingRhythm)
    && boundedString(item.relationshipLogic)
    && boundedString(item.currentAdjustment)
    && stringArray(item.intentionalOverlaps, 30));
}

function validReflection(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && boundedString(item.observedResult)
    && boundedString(item.remainingOpportunity)
    && boundedString(item.nextMoveReason));
}

function validRequirement(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && boundedString(item.requestedName, 160)
    && REQUIREMENT_STATES.has(String(item.state))
    && optionalString(item.appId, 500)
    && optionalString(item.appName, 500)
    && optionalString(item.reason, 2_000)
    && stringArray(item.usableFlowIds, 100, 500)
    && (item.adequateFlowIds === undefined || stringArray(item.adequateFlowIds, 100, 500))
    && stringArray(item.visibleFlowIds, 100, 500)
    && (item.visibleAdequateFlowIds === undefined || stringArray(item.visibleAdequateFlowIds, 100, 500))
    && optionalString(item.pendingFlowId, 500));
}

function validRetry(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && Number.isInteger(item.attempt)
    && Number(item.attempt) >= 1
    && Number.isInteger(item.maxAttempts)
    && Number(item.maxAttempts) >= Number(item.attempt)
    && Number.isFinite(item.delayMs)
    && Number(item.delayMs) >= 0
    && FAILURE_CODES.has(String(item.code)));
}

function validLoop(value: unknown): value is CanvasV2LoopState {
  const item = record(value);
  if (!item || !boundedString(item.id, 500) || !boundedString(item.instruction) || !LOOP_STATUSES.has(String(item.status))) return false;
  const validSteps = (value: unknown, limit: number) => Array.isArray(value) && value.length <= limit && value.every((stepValue) => {
    const step = record(stepValue);
    return Boolean(step
      && Number.isInteger(step.turn)
      && boundedString(step.revisionId, 500)
      && (step.kind === "research" || step.kind === "design")
      && MOVE_KINDS.has(String(step.moveKind))
      && boundedString(step.summary)
      && boundedString(step.expectedVisualResult)
      && validCreativeDirection(step.creativeDirection)
      && validSpatialStrategy(step.spatialStrategy)
      && validReflection(step.reflection));
  });
  if (!validSteps(item.steps, 100) || (item.priorSteps !== undefined && !validSteps(item.priorSteps, CANVAS_V2_MAX_AUTOMATIC_EDITS))) return false;
  if (!optionalString(item.continuationOf, 500)
    || (item.creativeDirection !== undefined && !validCreativeDirection(item.creativeDirection))
    || (item.spatialStrategy !== undefined && !validSpatialStrategy(item.spatialStrategy))
    || (item.finalReflection !== undefined && !validReflection(item.finalReflection))
    || !optionalString(item.finalSummary)
    || !optionalString(item.error)
    || (item.retry !== undefined && !validRetry(item.retry))
    || (item.researchTargets !== undefined && !stringArray(item.researchTargets, 12, 160))
    || (item.researchMode !== undefined && item.researchMode !== "evidence" && item.researchMode !== "synthesis")
    || (item.researchStatus !== undefined && (!Array.isArray(item.researchStatus) || item.researchStatus.length > 12 || !item.researchStatus.every(validRequirement)))) return false;
  return true;
}

function restoredLoop(loop: CanvasV2LoopState): CanvasV2LoopState {
  const next = canvasV2LoopIsActive(loop) ? stopCanvasV2Loop(loop) : { ...loop };
  if (next.researchStatus) {
    next.researchStatus = next.researchStatus.map((requirement) => ({
      ...requirement,
      // Phase 7E.3.1 added scope adequacy. Older valid local records retain
      // their display/history truth and are upgraded without a remote write;
      // the production director recalculates current adequacy on the next run.
      adequateFlowIds: requirement.adequateFlowIds ?? requirement.usableFlowIds,
      visibleAdequateFlowIds: requirement.visibleAdequateFlowIds ?? requirement.visibleFlowIds,
    }));
  }
  delete next.retry;
  return next;
}

function validTurn(value: unknown): value is CanvasV2StoredChatTurn {
  const item = record(value);
  return Boolean(item
    && boundedString(item.id, 500)
    && boundedString(item.message)
    && boundedString(item.createdAt, 100)
    && CHAT_STATUSES.has(String(item.status) as CanvasV2ChatStatus)
    && (item.route === undefined || ROUTES.has(String(item.route) as CanvasV2InteractionRoute))
    && optionalString(item.routeSummary)
    && optionalString(item.answer)
    && optionalString(item.canvasInstruction)
    && optionalString(item.runId, 500)
    && (item.loop === undefined || validLoop(item.loop))
    && (item.priorLoops === undefined || (Array.isArray(item.priorLoops) && item.priorLoops.length <= 20 && item.priorLoops.every(validLoop)))
    && optionalString(item.error)
    && (item.retry === undefined || validRetry(item.retry))
    && (item.researchTargets === undefined || stringArray(item.researchTargets, 12, 160))
    && (item.researchMode === undefined || item.researchMode === "evidence" || item.researchMode === "synthesis"));
}

function restoreTurn(turn: CanvasV2StoredChatTurn): CanvasV2StoredChatTurn {
  const loop = turn.loop ? restoredLoop(turn.loop) : undefined;
  const status = loop && loop.status !== "idle" ? canvasV2ChatStatusForLoop(loop) : restoreCanvasV2ChatStatus(turn.status);
  return {
    ...turn,
    status,
    ...(loop ? { loop } : {}),
    ...(turn.priorLoops ? { priorLoops: turn.priorLoops.map(restoredLoop) } : {}),
    retry: undefined,
  };
}

function validEvidence(value: unknown): boolean {
  const asset = record(value);
  return Boolean(asset
    && boundedString(asset.id, 1_000)
    && boundedString(asset.url, 20_000)
    && boundedString(asset.label, 2_000)
    && optionalString(asset.app, 2_000)
    && optionalString(asset.flow, 2_000)
    && optionalString(asset.screen, 2_000)
    && optionalString(asset.description, 10_000));
}

function restoreRevision(value: unknown): CanvasV2ArtifactRevision | undefined {
  const revision = record(value);
  if (!revision
    || revision.schema !== CANVAS_V2_ARTIFACT_SCHEMA
    || revision.state !== "committed"
    || !boundedString(revision.id, 500)
    || !optionalString(revision.parentId, 500)
    || !boundedString(revision.createdAt, 100)
    || !Array.isArray(revision.evidence)
    || revision.evidence.length > 500
    || !revision.evidence.every(validEvidence)) return undefined;
  try {
    const documentValue = record(revision.document);
    if (!documentValue || typeof documentValue.html !== "string" || typeof documentValue.css !== "string") return undefined;
    if (documentValue.javascript !== undefined && typeof documentValue.javascript !== "string") return undefined;
    const document = assertCanvasV2ArtifactDocument({
      html: documentValue.html,
      css: documentValue.css,
      ...(typeof documentValue.javascript === "string" ? { javascript: documentValue.javascript } : {}),
    });
    const evidence = revision.evidence as CanvasV2ArtifactRevision["evidence"];
    if (!/\bdata-canvas-v2-node-id\s*=\s*["']artboard["']/i.test(document.html)) return undefined;
    if (new Set(evidence.map((asset) => asset.id)).size !== evidence.length) return undefined;
    if (validateCanvasV2EvidenceBindings(document, evidence).length) return undefined;
    if (validateCanvasV2EvidenceContinuity(document, document, evidence).length) return undefined;
    const restored = createCanvasV2CommittedRevision({ id: revision.id, document, evidence, createdAt: revision.createdAt });
    return typeof revision.parentId === "string" ? { ...restored, parentId: revision.parentId } : restored;
  } catch {
    return undefined;
  }
}

function historyWindow(history: CanvasV2ArtifactRevision[], currentIndex: number): { history: CanvasV2ArtifactRevision[]; historyIndex: number } {
  if (history.length <= CANVAS_V2_LOCAL_RECOVERY_MAX_HISTORY) return { history, historyIndex: currentIndex };
  const historyBeforeCurrent = Math.floor((CANVAS_V2_LOCAL_RECOVERY_MAX_HISTORY - 1) / 2);
  const start = Math.max(0, Math.min(currentIndex - historyBeforeCurrent, history.length - CANVAS_V2_LOCAL_RECOVERY_MAX_HISTORY));
  return {
    history: history.slice(start, start + CANVAS_V2_LOCAL_RECOVERY_MAX_HISTORY),
    historyIndex: currentIndex - start,
  };
}

function restoreArtifact(value: unknown): CanvasV2LocalRecoveryEnvelope["artifact"] | undefined {
  const artifact = record(value);
  if (!artifact || !Array.isArray(artifact.history) || !Number.isInteger(artifact.historyIndex)) return undefined;
  const currentIndex = artifact.historyIndex as number;
  if (currentIndex < 0 || currentIndex >= artifact.history.length) return undefined;
  const restored = artifact.history.map(restoreRevision);
  const seenRevisionIds = new Set<string>();
  restored.forEach((revision, index) => {
    if (!revision) return;
    if (seenRevisionIds.has(revision.id)) restored[index] = undefined;
    else seenRevisionIds.add(revision.id);
  });
  const current = restored[currentIndex];
  if (!current) return undefined;
  let start = currentIndex;
  let end = currentIndex;
  while (start > 0 && restored[start - 1] && restored[start]?.parentId === restored[start - 1]?.id) start -= 1;
  while (end + 1 < restored.length && restored[end + 1]?.parentId === restored[end]?.id) end += 1;
  const contiguousHistory = restored.slice(start, end + 1).filter((revision): revision is CanvasV2ArtifactRevision => Boolean(revision));
  const contiguousIndex = contiguousHistory.findIndex((revision) => revision.id === current.id);
  return contiguousIndex >= 0 ? historyWindow(contiguousHistory, contiguousIndex) : undefined;
}

function restoredTurns(value: unknown): CanvasV2StoredChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(validTurn).slice(-CANVAS_V2_LOCAL_RECOVERY_MAX_TURNS).map(restoreTurn);
}

function containsActiveWork(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((turnValue) => {
    const turn = record(turnValue);
    if (!turn) return false;
    if (turn.status === "routing" || turn.status === "running") return true;
    const loop = record(turn.loop);
    if (loop && (loop.status === "thinking" || loop.status === "rendering")) return true;
    return Array.isArray(turn.priorLoops) && turn.priorLoops.some((loopValue) => {
      const prior = record(loopValue);
      return prior?.status === "thinking" || prior?.status === "rendering";
    });
  });
}

function parseCompatibleEnvelope(raw: string): CanvasV2LocalRecoveryEnvelope | undefined {
  const value = record(JSON.parse(raw));
  if (!value || value.schema !== CANVAS_V2_LOCAL_RECOVERY_SCHEMA) return undefined;
  return {
    schema: CANVAS_V2_LOCAL_RECOVERY_SCHEMA,
    generation: Number.isInteger(value.generation) && Number(value.generation) >= 0 ? Number(value.generation) : 0,
    savedAt: boundedString(value.savedAt, 100) ? value.savedAt : new Date(0).toISOString(),
    artifact: restoreArtifact(value.artifact),
    chat: { turns: restoredTurns(record(value.chat)?.turns) },
  };
}

function emptyEnvelope(generation = 0): CanvasV2LocalRecoveryEnvelope {
  return { schema: CANVAS_V2_LOCAL_RECOVERY_SCHEMA, generation, savedAt: new Date().toISOString(), chat: { turns: [] } };
}

function compactEnvelope(envelope: CanvasV2LocalRecoveryEnvelope): CanvasV2LocalRecoveryEnvelope {
  const artifact = envelope.artifact ? historyWindow(envelope.artifact.history, envelope.artifact.historyIndex) : undefined;
  const next: CanvasV2LocalRecoveryEnvelope = {
    ...envelope,
    artifact,
    chat: { turns: envelope.chat.turns.slice(-CANVAS_V2_LOCAL_RECOVERY_MAX_TURNS) },
  };
  while (JSON.stringify(next).length > MAX_SERIALIZED_CHARACTERS && next.chat.turns.length) next.chat.turns.shift();
  while (JSON.stringify(next).length > MAX_SERIALIZED_CHARACTERS && next.artifact && next.artifact.history.length > 1) {
    if (next.artifact.historyIndex > 0) {
      next.artifact.history.shift();
      next.artifact.historyIndex -= 1;
    } else next.artifact.history.pop();
  }
  return next;
}

function saveEnvelope(storage: CanvasV2Storage, envelope: CanvasV2LocalRecoveryEnvelope): CanvasV2LocalRecoveryWrite {
  try {
    const serialized = JSON.stringify(compactEnvelope(envelope));
    if (serialized.length > MAX_SERIALIZED_CHARACTERS) return { ok: false, error: "The current committed artboard is too large for safe browser-local recovery. It remains open but is not yet saved for refresh." };
    storage.setItem(CANVAS_V2_LOCAL_RECOVERY_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, error: "Local recovery could not be updated. Browser storage may be full or unavailable; the current artboard remains open but is not yet saved for refresh." };
  }
}

function migrateLegacyRecovery(storage: CanvasV2Storage): CanvasV2LocalRecoveryRead {
  let artifact: CanvasV2LocalRecoveryEnvelope["artifact"];
  let turns: CanvasV2StoredChatTurn[] = [];
  let found = false;
  let repaired = false;
  let legacyArtifact: string | null;
  let legacyChat: string | null;
  try {
    legacyArtifact = storage.getItem(CANVAS_V2_LEGACY_ARTIFACT_KEY);
    legacyChat = storage.getItem(CANVAS_V2_LEGACY_CHAT_KEY);
  } catch {
    return { writeBlocked: true, notice: "Browser-local recovery is unavailable. The current artboard remains usable but cannot be restored after refresh." };
  }
  if (legacyArtifact) {
    found = true;
    try {
      const revision = restoreRevision(JSON.parse(legacyArtifact));
      if (revision) artifact = { history: [revision], historyIndex: 0 };
      else repaired = true;
    } catch {
      repaired = true;
    }
  }
  if (legacyChat) {
    found = true;
    try {
      const parsed = JSON.parse(legacyChat);
      turns = restoredTurns(parsed);
      if (!Array.isArray(parsed) || turns.length !== Math.min(parsed.length, CANVAS_V2_LOCAL_RECOVERY_MAX_TURNS)) repaired = true;
    } catch {
      repaired = true;
    }
  }
  if (!found) return { writeBlocked: false };
  const envelope = { ...emptyEnvelope(), artifact, chat: { turns } };
  const result = saveEnvelope(storage, envelope);
  if (result.ok) {
    storage.removeItem(CANVAS_V2_LEGACY_ARTIFACT_KEY);
    storage.removeItem(CANVAS_V2_LEGACY_CHAT_KEY);
  }
  return {
    envelope,
    writeBlocked: !result.ok,
    notice: result.ok
      ? repaired ? "Recovered the valid portion of earlier local Canvas V2 work." : "Upgraded earlier local Canvas V2 work to the current recovery format."
      : result.error,
  };
}

export function loadCanvasV2LocalRecovery(storage: CanvasV2Storage): CanvasV2LocalRecoveryRead {
  let raw: string | null;
  try {
    raw = storage.getItem(CANVAS_V2_LOCAL_RECOVERY_KEY);
  } catch {
    return { writeBlocked: true, notice: "Browser-local recovery is unavailable. The current artboard remains usable but cannot be restored after refresh." };
  }
  if (!raw) return migrateLegacyRecovery(storage);
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schema !== CANVAS_V2_LOCAL_RECOVERY_SCHEMA) return {
      writeBlocked: true,
      notice: "An incompatible local Canvas V2 recovery format was found and left untouched. This session will not overwrite it.",
    };
    const envelope = parseCompatibleEnvelope(raw);
    if (!envelope) throw new Error("Invalid recovery envelope");
    const repaired = canonicalJson(envelope) !== canonicalJson(parsed);
    const interrupted = containsActiveWork(record(parsed.chat)?.turns);
    return {
      envelope,
      writeBlocked: false,
      ...(repaired ? {
        notice: interrupted
          ? "Recovered the last committed artboard. Work interrupted by refresh was marked stopped; no uncommitted candidate was restored."
          : "Recovered the valid committed portion of local Canvas V2 work; invalid speculative state was discarded.",
      } : {}),
    };
  } catch {
    try {
      storage.removeItem(CANVAS_V2_LOCAL_RECOVERY_KEY);
    } catch {
      return { writeBlocked: true, notice: "Local Canvas V2 recovery is unreadable and could not be cleared. This session will not overwrite it." };
    }
    return { writeBlocked: false, notice: "Unreadable local Canvas V2 recovery was discarded. North Star opened a clean committed artboard." };
  }
}

function envelopeForWrite(storage: CanvasV2Storage): CanvasV2LocalRecoveryEnvelope | undefined {
  let raw: string | null;
  try {
    raw = storage.getItem(CANVAS_V2_LOCAL_RECOVERY_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return emptyEnvelope();
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schema !== CANVAS_V2_LOCAL_RECOVERY_SCHEMA) return undefined;
    return parseCompatibleEnvelope(raw) ?? emptyEnvelope();
  } catch {
    return emptyEnvelope();
  }
}

export function persistCanvasV2ArtifactRecovery(
  storage: CanvasV2Storage,
  history: readonly CanvasV2ArtifactRevision[],
  historyIndex: number,
): CanvasV2LocalRecoveryWrite {
  const current = envelopeForWrite(storage);
  if (!current) return { ok: false, error: "An incompatible local Canvas V2 recovery format is present and was not overwritten." };
  const artifact = restoreArtifact({ history, historyIndex });
  if (!artifact) return { ok: false, error: "The committed artboard history did not pass local recovery validation and was not saved." };
  return saveEnvelope(storage, { ...current, generation: current.generation + 1, savedAt: new Date().toISOString(), artifact });
}

export function persistCanvasV2ChatRecovery(
  storage: CanvasV2Storage,
  turns: readonly CanvasV2StoredChatTurn[],
): CanvasV2LocalRecoveryWrite {
  const current = envelopeForWrite(storage);
  if (!current) return { ok: false, error: "An incompatible local Canvas V2 recovery format is present and was not overwritten." };
  if (!turns.every(validTurn)) return { ok: false, error: "The current chat state did not pass local recovery validation and was not saved." };
  return saveEnvelope(storage, {
    ...current,
    generation: current.generation + 1,
    savedAt: new Date().toISOString(),
    chat: { turns: turns.slice(-CANVAS_V2_LOCAL_RECOVERY_MAX_TURNS).map((turn) => ({ ...turn })) },
  });
}
