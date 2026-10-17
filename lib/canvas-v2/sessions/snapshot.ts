import { assertCanvasV2ArtifactDocument } from '../artifact-safety';
import { northstarRunConfig } from '../model-catalog';
import type { NorthstarSnapshot } from './types';
import { snapshotBlobUrls } from './snapshot-blob-urls';
import { assertSnapshotSize, DEFAULT_SNAPSHOT_MAX_BYTES } from './snapshot-size';
import { encodeSnapshotText, unpackSnapshotText } from './snapshot-codec';

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

export async function decodeSnapshotBlob(blob: Blob, maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES): Promise<NorthstarSnapshot> {
  assertSnapshotSize(blob.size, maxBytes);
  return decodeSnapshot(JSON.parse(await unpackSnapshotText(await blob.text(), maxBytes)));
}

/** Blob URLs belong to one document. Persist their bytes before that document closes. */
export async function encodeSnapshot(snapshot: NorthstarSnapshot, { maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES }: { maxBytes?: number } = {}): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid canvas snapshot size limit.');
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(new URL('./snapshot-encode.worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent<{blob?: Blob; error?: string; stage?: string; bytes?: number}>) => {
        worker.terminate();
        if (event.data.blob) resolve(event.data.blob);
        else reject(Object.assign(new Error(event.data.error || 'Could not save this canvas.'), { stage: event.data.stage, bytes: event.data.bytes }));
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new Error('Could not prepare this canvas for saving. Please retry.'));
      };
      try { worker.postMessage({ snapshot, maxBytes }); }
      catch (error) { worker.terminate(); reject(error); }
    });
  }
  let text = JSON.stringify(snapshot);
  const urls = snapshotBlobUrls(text);
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
  return encodeSnapshotText(text, maxBytes);
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
