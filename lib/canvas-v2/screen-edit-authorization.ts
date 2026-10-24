import type { CanvasV2WorkingContext } from './working-context';
import type { CanvasV2ArtifactDocument } from './types';
import { findCanvasV2SourceNodeRange } from './source-patch';
import { canvasV2FeedbackFingerprint } from './screen-feedback';


/** Explicit selection remains the edit target during agent-owned renders and
 * commits. An intervening human source change invalidates that authorization. */
export function authorizePlannedScreenEdit(context: CanvasV2WorkingContext | undefined, nodeId: string, encoded: string, authorized: ReadonlyMap<string, string>): CanvasV2WorkingContext | undefined {
  if (!context || authorized.get(nodeId) !== encoded) return context;
  const target = context.objects.find(item => item.nodeId === nodeId);
  if (!target || target.locked || target.hidden || target.canonicalEvidence) return context;
  return { ...context, scope: 'selection', selectionPolicy: 'modify',
    selectedNodeIds: [...new Set([...context.selectedNodeIds, nodeId])],
    editableNodeIds: [...new Set([...context.editableNodeIds, nodeId])],
    protectedNodeIds: context.protectedNodeIds.filter(id => id !== nodeId) };
}

/**
 * Continue an explicitly selected screen edit after Northstar has committed a
 * prior source revision in the same turn. The source fingerprint necessarily
 * changes, so refresh the retained authorization only when the current native
 * node is still Northstar-authored. A direct human source edit changes
 * lastAuthor to `user` and therefore cannot inherit the prior authorization.
 */
export function continueAuthorizedPlannedScreenEdit(input: {
  context: CanvasV2WorkingContext | undefined;
  nodeId: string;
  encoded: string;
  authorized: Map<string, string>;
  selected: boolean;
  userEdited: boolean;
  lastAuthor?: 'user' | 'northstar';
}): CanvasV2WorkingContext | undefined {
  if (input.selected && input.userEdited && input.lastAuthor === 'northstar' && input.authorized.has(input.nodeId)) {
    input.authorized.set(input.nodeId, input.encoded);
  }
  return authorizePlannedScreenEdit(input.context, input.nodeId, input.encoded, input.authorized);
}


/** Personal conversation context, never a shared selection or camera change. */
export interface ConversationEditTarget { nodeId: string; fingerprint: string }

export function parseConversationEditTargets(value: unknown): ConversationEditTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: ConversationEditTarget[] = [];
  for (const raw of value.slice(0, 24)) {
    if (!raw || typeof raw !== 'object') continue;
    const target = raw as ConversationEditTarget;
    if (typeof target.nodeId !== 'string' || !/^[A-Za-z0-9_.:-]{1,180}$/.test(target.nodeId) || !/^[a-f0-9]{8}$/.test(target.fingerprint) || targets.some(item => item.nodeId === target.nodeId)) continue;
    targets.push({ nodeId: target.nodeId, fingerprint: target.fingerprint });
  }
  return targets;
}

export function rememberConversationEditTargets(document: CanvasV2ArtifactDocument, context: CanvasV2WorkingContext | undefined, nodeIds: readonly string[]): ConversationEditTarget[] {
  if (!context) return [];
  return [...new Set(nodeIds)].slice(0, 24).flatMap(nodeId => {
    const target = context.objects.find(item => item.nodeId === nodeId);
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!target || target.locked || target.hidden || target.canonicalEvidence || !range) return [];
    return [{ nodeId, fingerprint: canvasV2FeedbackFingerprint(document.html.slice(range.start, range.end)) }];
  });
}

/** Only a successful own commit may advance these source fingerprints. Human
 * and teammate changes are revalidated, never silently adopted as permission. */
export function advanceConversationEditTargets(document: CanvasV2ArtifactDocument, targets: readonly ConversationEditTarget[]): ConversationEditTarget[] {
  return targets.flatMap(target => {
    const range = findCanvasV2SourceNodeRange(document.html, target.nodeId);
    return range ? [{ nodeId: target.nodeId, fingerprint: canvasV2FeedbackFingerprint(document.html.slice(range.start, range.end)) }] : [];
  });
}

export function currentConversationEditTargets(document: CanvasV2ArtifactDocument, context: CanvasV2WorkingContext | undefined, targets: readonly ConversationEditTarget[]): ConversationEditTarget[] {
  const current = rememberConversationEditTargets(document, context, targets.map(target => target.nodeId));
  return current.filter(target => targets.some(previous => previous.nodeId === target.nodeId && previous.fingerprint === target.fingerprint));
}

export function authorizeConversationEdit(context: CanvasV2WorkingContext | undefined, targets: readonly ConversationEditTarget[]): CanvasV2WorkingContext | undefined {
  if (!context || !targets.length) return context;
  const ids = targets.map(target => target.nodeId);
  // An explicit different selection takes precedence over conversation focus.
  if (context.selectedNodeIds.length && !context.selectedNodeIds.some(id => ids.includes(id))) return context;
  const editable = context.objects.filter(item => ids.includes(item.nodeId) && !item.locked && !item.hidden && !item.canonicalEvidence).map(item => item.nodeId);
  if (!editable.length) return context;
  return { ...context, scope: 'selection', selectionPolicy: 'modify',
    selectedNodeIds: [...new Set([...context.selectedNodeIds, ...editable])],
    editableNodeIds: [...new Set([...context.editableNodeIds, ...editable])],
    protectedNodeIds: context.protectedNodeIds.filter(id => !editable.includes(id)) };
}
