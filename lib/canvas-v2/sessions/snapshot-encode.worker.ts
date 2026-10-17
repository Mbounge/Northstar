import type { NorthstarSnapshot } from './types';
import { snapshotBlobUrls } from './snapshot-blob-urls';
import { encodeSnapshotText } from './snapshot-codec';

// Snapshot serialization is large on screenshot-heavy boards. Keep the JSON
// walk and blob URL expansion off the input/rendering thread.
self.onmessage = async (event: MessageEvent<{ snapshot: NorthstarSnapshot; maxBytes: number }>) => {
  try {
    let text = JSON.stringify(event.data.snapshot);
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
    self.postMessage({ blob });
  } catch (error) {
    const detail = error as { stage?: string; bytes?: number };
    self.postMessage({ error: error instanceof Error ? error.message : String(error), stage: detail.stage, bytes: detail.bytes });
  }
};
