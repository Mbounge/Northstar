import type { NorthstarSnapshot } from './types';

// Snapshot serialization is large on screenshot-heavy boards. Keep the JSON
// walk and blob URL expansion off the input/rendering thread.
self.onmessage = async (event: MessageEvent<NorthstarSnapshot>) => {
  try {
    let text = JSON.stringify(event.data);
    const urls = [...new Set(text.match(/blob:https?:[^\s"'<>\\]+/g) ?? [])];
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
    const blob = new Blob([text], { type: 'application/json' });
    if (blob.size > 100 * 1024 * 1024) throw new Error('This session exceeds the current 100 MB storage limit. Your open canvas is still available.');
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
