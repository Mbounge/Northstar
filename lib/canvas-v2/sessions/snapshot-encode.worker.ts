import type { NorthstarSnapshot } from './types';
import { snapshotBlobUrls } from './snapshot-blob-urls';
import { encodeSnapshotText } from './snapshot-codec';
import { restoreSnapshotTransport, SNAPSHOT_TRANSPORT, type SnapshotTransportRequest } from './snapshot-transport';

const strings = new Map<number, string>();

// Snapshot serialization is large on screenshot-heavy boards. Keep the JSON
// walk and blob URL expansion off the input/rendering thread.
self.onmessage = async (event: MessageEvent<SnapshotTransportRequest | { snapshot: NorthstarSnapshot; maxBytes: number; requestId?: number; protocol?: undefined }>) => {
  try {
    const snapshot = event.data.protocol === SNAPSHOT_TRANSPORT ? restoreSnapshotTransport(event.data, strings) : event.data.snapshot;
    let text = JSON.stringify(snapshot);
    const urls = snapshotBlobUrls(text);
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('An uploaded image could not be saved. Keep this canvas open and retry.');
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not save uploaded media.'));
        reader.readAsDataURL(blob);
      });
      text = text.split(url).join(data);
    }
    const blob = await encodeSnapshotText(text, event.data.maxBytes);
    self.postMessage({ requestId: event.data.requestId, blob });
  } catch (error) {
    const detail = error as { stage?: string; bytes?: number };
    self.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : String(error), stage: detail.stage, bytes: detail.bytes });
  }
};
