export const NORTHSTAR_CREATIVE_COMPLETION_INVARIANT_VERSION =
  "northstar.creative-completion-invariant.v1" as const;

export interface NorthstarCreativeCompletionState {
  acceptedActCount: number;
  operationallyReady: boolean;
}

export function northstarHasAcceptedMaterialDesign(
  state: Pick<NorthstarCreativeCompletionState, "acceptedActCount">,
): boolean {
  return Number.isFinite(state.acceptedActCount) && state.acceptedActCount > 0;
}

export function northstarCanSettleCreativeRun(
  state: NorthstarCreativeCompletionState,
): boolean {
  return state.operationallyReady && northstarHasAcceptedMaterialDesign(state);
}

export function northstarCreativeCompletionBlocker(
  state: NorthstarCreativeCompletionState,
): string | undefined {
  if (!state.operationallyReady) {
    return "No exact operational browser revision is available.";
  }
  if (!northstarHasAcceptedMaterialDesign(state)) {
    return "No browser-accepted material creative transformation exists.";
  }
  return undefined;
}
