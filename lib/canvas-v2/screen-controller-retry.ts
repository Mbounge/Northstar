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
  return withCanvasV2ScreenControllerRetry(lookup, encoded, signal, controller => controller.run(command, signal), options);
}

/** Read/capture adapters must follow the same startup turnover as inspection. */
export async function withCanvasV2ScreenControllerRetry<Controller extends { encoded: string }, Result>(
  lookup: () => Controller | undefined,
  encoded: string,
  signal: AbortSignal,
  read: (controller: Controller) => Promise<Result>,
  options: RetryOptions = {},
): Promise<Result> {
  const timeoutMs = Math.max(0, Math.min(1000, options.timeoutMs ?? 500));
  const waitMs = Math.max(1, Math.min(50, options.waitMs ?? 10));
  let deadline: number | undefined;
  let controller = lookup();
  if (!controller || controller.encoded !== encoded) throw new Error('This screen is not ready or was revised/deleted.');
  for (;;) {
    signal.throwIfAborted();
    try {
      return await read(controller);
    } catch (error) {
      if (!isAbortError(error)) throw error;
      if (signal.aborted) {
        signal.throwIfAborted();
        throw error;
      }
      // Startup can take seconds. The short turnover window begins when the
      // cleanup occurs, rather than expiring while the original frame loads.
      deadline ??= Date.now() + timeoutMs;
      const retryDeadline = deadline;
      let replacement: Controller | undefined;
      while (Date.now() < retryDeadline) {
        signal.throwIfAborted();
        const candidate = lookup();
        if (candidate && candidate !== controller) {
          if (candidate.encoded !== encoded) throw new Error('This screen was revised or deleted during inspection.');
          replacement = candidate;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, Math.max(1, retryDeadline - Date.now()))));
      }
      if (!replacement || replacement.encoded !== encoded || lookup() !== replacement) throw error;
      controller = replacement;
    }
  }
}
