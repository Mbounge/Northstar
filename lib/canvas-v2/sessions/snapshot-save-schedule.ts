/** Match the production autosave cadence: coalesce rapid camera/chat updates
 * for 900ms, but still checkpoint continuous work within five seconds. The
 * caller owns the newest pending snapshot and serializes it only on flush. */
export class SnapshotSaveSchedule {
  private quiet?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(private flush: () => Promise<void>, private timers = {
    set: (run: () => void, delay: number) => setTimeout(run, delay),
    clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  }) {}
  request() {
    if (this.disposed) return;
    if (this.quiet !== undefined) this.timers.clear(this.quiet);
    this.quiet = this.timers.set(() => this.fire(), 900);
    if (this.deadline === undefined) this.deadline = this.timers.set(() => this.fire(), 5000);
  }
  cancel() {
    if (this.quiet !== undefined) this.timers.clear(this.quiet);
    if (this.deadline !== undefined) this.timers.clear(this.deadline);
    this.quiet = this.deadline = undefined;
  }
  private fire() { this.cancel(); if (!this.disposed) void this.flush().catch(() => undefined); }
  dispose() { this.disposed = true; this.cancel(); }
}
