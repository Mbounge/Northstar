export type ScreenPresentation = { url: string; width: number; height: number; version: object };
/** Local harness timings contain sizes/identities only, never captured pixels. */
export function recordScreenPresentationTiming(nodeId: string, stage: string, start: number) {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return;
  const name = 'northstar:presentation:' + stage;
  if (performance.getEntriesByName(name).length >= 128) performance.clearMeasures(name);
  performance.measure(name, { start, end: performance.now(), detail: { nodeId } });
}
type Entry = { id: string; visible: boolean; disposed: boolean; epoch: number; touched: number; image?: ScreenPresentation; capture: (signal: AbortSignal) => Promise<ScreenPresentation>; publish: (image?: ScreenPresentation) => void };

/** Self-contained for the opaque runtime. Yield through child rendering turns
 * before asking the host to release a last-known image. The host already owns
 * viewport intersection: a second observer inside many transformed cross-origin
 * frames can stall even after a visible return. This remains an advisory
 * handoff, not a GPU presentation acknowledgement. */
export function createScreenPresentationHandoff(onReady: (id: string) => void, onProgress?: (id: string, stage: string) => void) {
  let current = '', frame = 0, task = 0;
  let requestToken: object | undefined;
  const cancel = () => {
    current = ''; requestToken = undefined;
    if (frame) cancelAnimationFrame(frame);
    if (task) clearTimeout(task);
    frame = task = 0;
  };
  const advance = (id: string, token: object) => {
    if (current !== id || requestToken !== token || frame || task) return;
    frame = requestAnimationFrame(() => {
      if (current !== id || requestToken !== token) return;
      onProgress?.(id, 'first-frame');
      frame = requestAnimationFrame(() => {
        if (current !== id || requestToken !== token) return;
        onProgress?.(id, 'second-frame');
        frame = 0;
        // A task after the frame gives its rendering update a chance to finish.
        task = window.setTimeout(() => {
          if (current !== id || requestToken !== token) return;
          onProgress?.(id, 'ready');
          task = 0; current = ''; requestToken = undefined; onReady(id);
        }, 0);
      });
    });
  };
  return {
    request(id: string) {
      cancel();
      if (!id || id.length > 80) return;
      current = id;
      const token = requestToken = {};
      onProgress?.(id, 'accepted');
      advance(id, token);
    },
    dispose: cancel,
  };
}

export function screenPresentationCommandChangesState(action: string, value?: string) {
  if (action === 'edit-target') return value === 'reveal' || value === 'reveal-only';
  return !['inspect', 'snapshot', 'presentation-snapshot', 'asset-target', 'feedback-target', 'edit-hover', 'edit-targets', 'edit-selection', 'edit-mode', 'feedback-mode'].includes(action);
}

/** Keep current interaction-state selectors meaningful in an inert copy. */
export function screenPresentationSelector(selector: string) {
  let result = '', quote = '', escaped = false;
  const states = ['focus-within', 'focus-visible', 'hover', 'focus'];
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (escaped) { result += character; escaped = false; continue; }
    if (character.charCodeAt(0) === 92) { result += character; escaped = true; continue; }
    if (quote) { result += character; if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; result += character; continue; }
    const state = character === ':' && states.find(value => selector.startsWith(':' + value, index) && !/[a-zA-Z0-9_-]/.test(selector[index + value.length + 1] ?? ''));
    if (state) { result += '[data-northstar-presentation-' + state + ']'; index += state.length; }
    else result += character;
  }
  return result;
}

/** Ephemeral visual continuity only. These last-known frames never become
 * saved source, exported pixels or model evidence. Captures are serialized and
 * yield to input; eviction bounds retained estimates, not browser/GPU memory. */
export function createScreenPresentationCache({ quiet, now = () => performance.now(), maxEntries = 64, maxPixels = 16_000_000, maxBytes = 32_000_000 }: {
  quiet: (isCurrent: () => boolean) => Promise<void>; now?: () => number;
  maxEntries?: number; maxPixels?: number; maxBytes?: number;
}) {
  const entries = new Map<string, Entry>(), pending = new Set<Entry>();
  let running = false, active: { entry: Entry; aborter: AbortController } | undefined;
  const drop = (entry: Entry) => { if (entry.image) { entry.image = undefined; entry.publish(); } };
  const trim = () => {
    let count = 0, pixels = 0, bytes = 0;
    for (const entry of [...entries.values()].filter(value => value.image).sort((a, b) => b.touched - a.touched)) {
      const image = entry.image!;
      if (count + 1 > maxEntries || pixels + image.width * image.height > maxPixels || bytes + image.url.length * 2 > maxBytes) { drop(entry); continue; }
      count++;
      pixels += image.width * image.height; bytes += image.url.length * 2;
    }
  };
  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (pending.size) {
        const entry = pending.values().next().value!; pending.delete(entry);
        if (entry.disposed || !entry.visible || entry.image) continue;
        const epoch = entry.epoch, aborter = new AbortController(); active = { entry, aborter };
        const current = () => !entry.disposed && entry.visible && entry.epoch === epoch && !aborter.signal.aborted;
        try {
          await quiet(current);
          if (!current()) continue;
          const image = await entry.capture(aborter.signal);
          if (!current()) continue;
          if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.url) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0 || image.width > 640 || image.height > 640 || image.width * image.height > maxPixels || image.url.length * 2 > maxBytes) continue;
          entry.image = image; entry.touched = now(); trim();
          if (entry.image) entry.publish(entry.image);
        } catch { /* A continuity preview is optional; the live frame remains. */ }
        finally {
          if (active?.aborter === aborter) active = undefined;
          // Input cancels work, not the request to prepare an unchanged visible
          // card. Retry only after the queue's next input-quiet boundary.
          if (aborter.signal.aborted && !entry.disposed && entry.visible && !entry.image) pending.add(entry);
        }
      }
    } finally { running = false; }
  };
  return {
    register(id: string, capture: Entry['capture'], publish: Entry['publish']) {
      const previous = entries.get(id);
      if (previous) { previous.disposed = true; pending.delete(previous); if (active?.entry === previous) active.aborter.abort(); drop(previous); }
      const entry: Entry = { id, visible: false, disposed: false, epoch: 0, touched: now(), capture, publish };
      entries.set(id, entry);
      const request = () => { if (!entry.disposed && entry.visible && !entry.image) { pending.add(entry); void pump(); } };
      return {
        visible(value: boolean) { entry.visible = value; if (value) { entry.touched = now(); request(); } else { pending.delete(entry); if (active?.entry === entry) active.aborter.abort(); } },
        invalidate() { entry.epoch++; drop(entry); if (active?.entry === entry) active.aborter.abort(); request(); },
        dispose() { entry.disposed = true; pending.delete(entry); if (active?.entry === entry) active.aborter.abort(); if (entries.get(id) === entry) entries.delete(id); drop(entry); },
      };
    },
    interrupt() { active?.aborter.abort(); },
    reset() {
      active?.aborter.abort();
      for (const entry of entries.values()) { entry.epoch++; drop(entry); if (entry.visible) pending.add(entry); }
      void pump();
    },
  };
}
