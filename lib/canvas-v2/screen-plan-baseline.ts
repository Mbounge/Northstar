/** A broken render must remain repairable. Missing baseline pixels are explicit
 * evidence gaps, never a successful render or permission to skip final review. */
export async function captureCanvasV2ScreenPlanBaseline<T>(
  capture: () => Promise<T>,
  signal: AbortSignal,
): Promise<{ baseline?: T; unavailable?: string }> {
  signal.throwIfAborted();
  try {
    const baseline = await capture();
    signal.throwIfAborted();
    return { baseline };
  } catch (error) {
    signal.throwIfAborted();
    return {
      unavailable: error instanceof Error
        ? error.message
        : 'The existing screen could not be rasterized. No baseline pixels were captured.',
    };
  }
}
