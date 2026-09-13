import type { CanvasV2ChatAttachment } from "./chat-attachments";
import type { CanvasV2WorkingContext } from "./working-context";

export interface CanvasV2LiveInput {
  id: string;
  message: string;
  attachments?: CanvasV2ChatAttachment[];
  workingContext?: CanvasV2WorkingContext;
}

/** Synchronous acceptance is the commit fence, independent of React render timing. */
export class CanvasV2InputJournal {
  private runId?: string;
  private entries: CanvasV2LiveInput[] = [];
  private consumed = 0;
  begin(runId: string) { this.runId = runId; this.entries = []; this.consumed = 0; }
  accept(runId: string, input: CanvasV2LiveInput): boolean {
    if (this.runId !== runId) return false;
    if (!this.entries.some(entry => entry.id === input.id)) this.entries.push(input);
    return true;
  }
  get sequence() { return this.entries.length; }
  get pending() { return this.entries.length > this.consumed; }
  consume() { const result = this.entries.slice(this.consumed); this.consumed = this.entries.length; return result; }
  canCommit(runId: string, sequence: number, parent: string, current: string) {
    return this.runId === runId && sequence === this.sequence && !this.pending && parent === current;
  }
  stop() { this.runId = undefined; }
}

export function canvasV2SteeredInstruction(original: string, inputs: readonly CanvasV2LiveInput[]): string {
  if (!inputs.length) return original;
  return `${original}\n\nHuman feedback received while working (in acceptance order; later corrections supersede conflicting earlier requests, while the original objective and unrelated constraints remain):\n${inputs.map(input => input.message).join("\n\n")}`;
}

export function canvasV2IsStatusQuestion(message: string): boolean {
  return /^(?:(?:what(?:'s| is) (?:the )?(?:status|progress))|(?:how(?:'s| is) it going)|(?:are you (?:still )?(?:working|there))|(?:status(?: update)?))[?!. ]*$/i.test(message.trim());
}
