export interface CanvasV2ScreenCommandController<Result, Command> {
  encoded: string;
  run(command: Command, signal: AbortSignal): Promise<Result>;
}

type RetryOptions = { timeoutMs?: number; waitMs?: number };

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * A React StrictMode cleanup can abort the controller that an inspection
 * captured just before its replacement is registered. Retry that one narrow
 * race only when the live registry now contains the exact same source. A
 * changed or removed node, and a caller abort, remain terminal.
 */
export async function runCanvasV2ScreenCommandWithControllerRetry<Result, Command>(
  lookup: () => CanvasV2ScreenCommandController<Result, Command> | undefined,
  encoded: string,
  command: Command,
  signal: AbortSignal,
  options: RetryOptions = {},
): Promise<Result> {
  const timeoutMs = Math.max(0, Math.min(1000, options.timeoutMs ?? 500));
  const waitMs = Math.max(1, Math.min(50, options.waitMs ?? 10));
  const deadline = Date.now() + timeoutMs;
  let controller = lookup();
  if (!controller || controller.encoded !== encoded) throw new Error('This screen is not ready or was revised/deleted.');
  for (;;) {
    signal.throwIfAborted();
    try {
      return await controller.run(command, signal);
    } catch (error) {
      if (!isAbortError(error)) throw error;
      if (signal.aborted) {
        signal.throwIfAborted();
        throw error;
      }
      let replacement: CanvasV2ScreenCommandController<Result, Command> | undefined;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const candidate = lookup();
        if (candidate && candidate !== controller) {
          if (candidate.encoded !== encoded) throw new Error('This screen was revised or deleted during inspection.');
          replacement = candidate;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, Math.max(1, deadline - Date.now()))));
      }
      if (!replacement || replacement.encoded !== encoded || lookup() !== replacement) throw error;
      controller = replacement;
    }
  }
}
