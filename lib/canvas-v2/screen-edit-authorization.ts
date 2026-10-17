import type { CanvasV2WorkingContext } from './working-context';

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
