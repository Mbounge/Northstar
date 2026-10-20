import {parseCanvasV2ChatAttachments} from '../chat-attachments';
import { assertCanvasV2ArtifactDocument } from '../artifact-safety';
import { northstarRunConfig } from '../model-catalog';
import type { NorthstarSnapshot } from './types';
import type { CanvasV2ArtifactDocument } from '../types';
import { snapshotBlobUrls } from './snapshot-blob-urls';
import { assertSnapshotSize, DEFAULT_SNAPSHOT_MAX_BYTES } from './snapshot-size';
import { encodeSnapshotText, unpackSnapshotText } from './snapshot-codec';
import { createSnapshotTransportEncoder } from './snapshot-transport';

let encoder: ReturnType<typeof createSnapshotTransportEncoder> | undefined;

function decodeSnapshotWithDocumentCheck(value: unknown, checkDocument: (document: CanvasV2ArtifactDocument) => void): NorthstarSnapshot {
  const s = value as NorthstarSnapshot;
  if (!s || s.schema !== 1 || s.revision?.state !== 'committed' || !s.revision.id || !Array.isArray(s.revision.evidence)
    || !Array.isArray(s.turns) || typeof s.draft !== 'string'
    || ![s.viewport?.x, s.viewport?.y, s.viewport?.scale].every(Number.isFinite) || s.viewport.scale <= 0) {
    throw new Error('This saved canvas has an unsupported or incomplete snapshot. It has not been changed.');
  }
  northstarRunConfig(s.model, s.effort);
  checkDocument(s.revision.document);
  // Imported drafts must satisfy the same attachment contract as live input.
  // Historical turns can contain larger legacy aggregates; validate each new
  // visual-feedback pair without imposing a new cap on those older turns.
  const attachments=s.attachments===undefined?undefined:parseCanvasV2ChatAttachments(s.attachments);
  for(const turn of s.turns){if(!Array.isArray(turn?.attachments))continue;for(const attachment of turn.attachments){if(attachment?.kind!=='text'||attachment.visualFeedback===undefined)continue;const image=turn.attachments.find(item=>item?.kind==='image'&&item.id===attachment.visualFeedback?.imageId);parseCanvasV2ChatAttachments(image?[image,attachment]:[attachment]);}}
  return {...s,...(attachments?{attachments}:{})};
}

export function decodeSnapshot(value: unknown): NorthstarSnapshot {
  return decodeSnapshotWithDocumentCheck(value, assertCanvasV2ArtifactDocument);
}

/** Internal repeated-save validation. Reuse only a successful check of the
 * exact source strings; every call still checks current snapshot metadata and
 * attachments. Imports and restores use the strict decoder above. */
export function createSnapshotPersistenceDecoder() {
  let checked: Pick<CanvasV2ArtifactDocument, 'html' | 'css' | 'javascript'> | undefined;
  return (value: unknown): NorthstarSnapshot => decodeSnapshotWithDocumentCheck(value, document => {
    if (checked && document && document.html === checked.html && document.css === checked.css && document.javascript === checked.javascript) return;
    assertCanvasV2ArtifactDocument(document);
    checked = { html: document.html, css: document.css, javascript: document.javascript };
  });
}

export async function decodeSnapshotBlob(blob: Blob, maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES): Promise<NorthstarSnapshot> {
  assertSnapshotSize(blob.size, maxBytes);
  return decodeSnapshot(JSON.parse(await unpackSnapshotText(await blob.text(), maxBytes)));
}

/** Blob URLs belong to one document. Persist their bytes before that document closes. */
export async function encodeSnapshot(snapshot: NorthstarSnapshot, { maxBytes = DEFAULT_SNAPSHOT_MAX_BYTES }: { maxBytes?: number } = {}): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid canvas snapshot size limit.');
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    encoder ??= createSnapshotTransportEncoder({
      createWorker: () => new Worker(new URL('./snapshot-encode.worker.ts', import.meta.url)),
      onTransfer: (startedAt, durationMs) => {
        if (process.env.NODE_ENV === 'development' && window.location.pathname.startsWith('/canvas-v2-e2e/') && new URLSearchParams(window.location.search).get('hardening') === '1') window.dispatchEvent(new CustomEvent('northstar:e2e:snapshot-copy-timing', { detail: { stage: 'worker-post-message', startedAt, durationMs } }));
      },
    });
    return encoder.encode(snapshot, maxBytes);
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
