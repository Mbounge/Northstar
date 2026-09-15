import { assertCanvasV2ArtifactDocument } from '../artifact-safety';
import { northstarRunConfig } from '../model-catalog';
import type { NorthstarSnapshot } from './types';

export function decodeSnapshot(value: unknown): NorthstarSnapshot {
  const s = value as NorthstarSnapshot;
  if (!s || s.schema !== 1 || s.revision?.state !== 'committed' || !s.revision.id || !Array.isArray(s.revision.evidence)
    || !Array.isArray(s.turns) || typeof s.draft !== 'string'
    || ![s.viewport?.x, s.viewport?.y, s.viewport?.scale].every(Number.isFinite) || s.viewport.scale <= 0) {
    throw new Error('This saved canvas has an unsupported or incomplete snapshot. It has not been changed.');
  }
  northstarRunConfig(s.model, s.effort);
  assertCanvasV2ArtifactDocument(s.revision.document);
  return s;
}

/** Blob URLs belong to one document. Persist their bytes before that document closes. */
export async function encodeSnapshot(snapshot: NorthstarSnapshot): Promise<Blob> {
  let text = JSON.stringify(snapshot);
  const urls = [...new Set(text.match(/blob:https?:[^\s"'<>\\]+/g) ?? [])];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('An uploaded image could not be saved. Keep this canvas open and retry.');
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not save uploaded media.')); reader.readAsDataURL(blob);
    });
    text = text.split(url).join(data);
  }
  const blob = new Blob([text], { type: 'application/json' });
  if (blob.size > 100 * 1024 * 1024) throw new Error('This session exceeds the current 100 MB storage limit. Your open canvas is still available.');
  return blob;
}

/** One upload at a time. Updates arriving during an upload are coalesced, never dropped. */
export class SnapshotQueue<T> {
  private pending?: T;
  private running?: Promise<void>;
  private failed = false;
  constructor(private write: (value: T) => Promise<void>, private status: (value: 'saving' | 'saved' | 'error', error?: Error) => void) {}
  get dirty() { return this.pending !== undefined || Boolean(this.running); }
  enqueue(value: T) { this.pending = value; this.status('saving'); }
  flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.pending === undefined) return Promise.resolve();
    this.failed = false;
    this.running = (async () => {
      while (this.pending !== undefined) {
        const value = this.pending; this.pending = undefined;
        try { await this.write(value); }
        catch (error) {
          if (this.pending === undefined) this.pending = value;
          this.failed = true; this.status('error', error instanceof Error ? error : new Error(String(error))); return;
        }
      }
    })().finally(() => {
      this.running = undefined;
      if (!this.failed && this.pending !== undefined) void this.flush();
      else if (!this.failed) this.status('saved');
    });
    return this.running;
  }
}
