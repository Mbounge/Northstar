/** Preserve DOM order while allowing independent live captures to overlap. */
export async function mapCaptureBatch<T, U>(items: readonly T[], operation: (item: T) => Promise<U>, concurrency = 4): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await operation(items[index]); }
      catch (error) { failed = true; throw error; }
    }
  });
  const settled = await Promise.allSettled(workers);
  const failure = settled.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results;
}

/** One budget across the whole recursive clone, including nested groups. */
export class CaptureConcurrency {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private limit = 4) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try { return await operation(); }
    finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/** A large board may take longer, but stalled or endless work must still stop. */
export type CaptureProgress = { revisionId: string; stage: string; at: number };
/** Concurrent committed/candidate captures must not erase each other's clock. */
export function recordCaptureProgress(progress: Map<string, CaptureProgress>, entry: CaptureProgress): void {
  progress.delete(entry.revisionId);
  progress.set(entry.revisionId, entry);
  while (progress.size > 16) progress.delete(progress.keys().next().value!);
}
export function captureValidationIsPending(started: number, now: number, revisionId: string, progress?: CaptureProgress): boolean {
  const lastProgress = progress?.revisionId === revisionId ? Math.max(started, progress.at) : started;
  return now - started < 120_000 && now - lastProgress < 30_000;
}
