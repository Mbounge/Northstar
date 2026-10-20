/** Transport only: durable snapshots keep their existing JSON/blob format. */
export const SNAPSHOT_TRANSPORT = 'northstar-snapshot-strings-v1' as const;
const INTERN_FROM = 32_768;
type Path = (string | number)[];
export type CapturedSnapshot = { metadata: unknown; strings: { path: Path; value: string }[] };
export type SnapshotTransportRequest = {
  protocol: typeof SNAPSHOT_TRANSPORT; requestId: number; maxBytes: number;
  metadata: unknown; references: { path: Path; id: number }[];
  strings: [number, string][]; retainIds: number[];
};
type Reply = { requestId?: number; blob?: Blob; error?: string; stage?: string; bytes?: number };

/** Capture every mutable field now. Only immutable string values are shared;
 * revision IDs and object identity are never used as freshness evidence. */
export function captureSnapshotTransport(snapshot: unknown): CapturedSnapshot {
  const strings: CapturedSnapshot['strings'] = [], ancestors = new Set<object>();
  const walk = (value: unknown, path: Path): unknown => {
    if (typeof value === 'string' && value.length >= INTERN_FROM) { strings.push({ path, value }); return null; }
    if (typeof value === 'function' || typeof value === 'symbol') throw new DOMException('The canvas contains a value that cannot be saved.', 'DataCloneError');
    if (typeof value === 'bigint') throw new TypeError('BigInt cannot be saved as canvas JSON.');
    if (!value || typeof value !== 'object') return value;
    if (ancestors.has(value)) throw new TypeError('Circular canvas data cannot be saved as JSON.');
    // Dates/typed values retain the same structured-clone -> JSON semantics as
    // the original worker. The normal snapshot contract uses plain JSON trees.
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return structuredClone(value);
    ancestors.add(value);
    const copy = Array.isArray(value) ? new Array(value.length) : Object.create(null);
    try {
      for (const key of Object.keys(value)) {
        const part = Array.isArray(value) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length ? Number(key) : key;
        // JSON ignores extra array properties. Preserve structured-clone
        // rejection of uncloneable extras without inventing JSON path slots.
        if (Array.isArray(value) && typeof part !== 'number') { structuredClone((value as unknown as Record<string, unknown>)[key]); continue; }
        Object.defineProperty(copy, key, { value: walk((value as Record<string, unknown>)[key], [...path, part]), enumerable: true, writable: true, configurable: true });
      }
    } finally { ancestors.delete(value); }
    return copy;
  };
  return { metadata: walk(snapshot, []), strings };
}

/** Validate all slots before changing either metadata or the decoder table. */
export function restoreSnapshotTransport(request: SnapshotTransportRequest, dictionary: Map<number, string>): unknown {
  if (request.protocol !== SNAPSHOT_TRANSPORT || !Array.isArray(request.strings) || !Array.isArray(request.references) || !Array.isArray(request.retainIds)) throw new Error('Invalid canvas snapshot transport.');
  const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
  const candidate = new Map(dictionary), additions = new Set<number>();
  for (const entry of request.strings) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validId(entry[0]) || typeof entry[1] !== 'string' || additions.has(entry[0]) || candidate.has(entry[0]) && candidate.get(entry[0]) !== entry[1]) throw new Error('Invalid retained canvas string.');
    additions.add(entry[0]); candidate.set(entry[0], entry[1]);
  }
  const retained = new Set<number>();
  for (const id of request.retainIds) { if (!validId(id) || retained.has(id) || !candidate.has(id)) throw new Error('Missing retained canvas string.'); retained.add(id); }
  const used = new Set<number>(), paths = new Set<string>();
  const slots: { parent: object; key: string | number; value: string }[] = [];
  let root = request.metadata, rootValue: string | undefined;
  for (const reference of request.references) {
    if (!reference || !validId(reference.id) || !retained.has(reference.id) || !Array.isArray(reference.path)) throw new Error('Missing canvas snapshot reference.');
    const pathKey = JSON.stringify(reference.path);
    if (paths.has(pathKey)) throw new Error('Repeated canvas snapshot slot.'); paths.add(pathKey); used.add(reference.id);
    if (!reference.path.length) { if (root !== null) throw new Error('Invalid canvas snapshot root.'); rootValue = candidate.get(reference.id)!; continue; }
    let parent: unknown = root;
    for (let i = 0; i < reference.path.length; i++) {
      const key = reference.path[i];
      if (!parent || typeof parent !== 'object' || (Array.isArray(parent) ? typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0 || key >= parent.length : typeof key !== 'string') || !Object.hasOwn(parent, key)) throw new Error('Invalid canvas snapshot path.');
      const value = (parent as Record<string | number, unknown>)[key];
      if (i === reference.path.length - 1) { if (value !== null) throw new Error('Invalid canvas snapshot placeholder.'); slots.push({ parent, key, value: candidate.get(reference.id)! }); }
      else parent = value;
    }
  }
  if (used.size !== retained.size || [...additions].some(id => !retained.has(id))) throw new Error('Unused canvas snapshot strings.');
  for (const slot of slots) Object.defineProperty(slot.parent, slot.key, { value: slot.value, enumerable: true, writable: true, configurable: true });
  if (rootValue !== undefined) root = rootValue;
  dictionary.clear(); for (const id of retained) dictionary.set(id, candidate.get(id)!);
  return root;
}

/** One worker and one latest string table. Each queued request owns a complete
 * call-time metadata capture and string values, so recovery can always reseed. */
export function createSnapshotTransportEncoder({ createWorker, onTransfer }: {
  createWorker: () => Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
  onTransfer?: (startedAt: number, durationMs: number) => void;
}) {
  let worker: ReturnType<typeof createWorker> | undefined, known = new Map<string, number>();
  let nextId = 1, sequence = 0, generation = 0, disposed = false;
  let tail: Promise<unknown> = Promise.resolve(), rejectActive: ((error: Error) => void) | undefined;
  const reset = () => { worker?.terminate(); worker = undefined; known = new Map(); nextId = 1; generation++; };
  const run = (captured: CapturedSnapshot, maxBytes: number): Promise<Blob> => {
    if (disposed) return Promise.reject(new Error('The canvas encoder is closed.'));
    const port = worker ??= createWorker(), epoch = generation, requestId = ++sequence;
    const next = new Map<string, number>(), strings: [number, string][] = [];
    const references = captured.strings.map(({ path, value }) => {
      let id = next.get(value);
      if (id === undefined) { id = known.get(value) ?? nextId++; next.set(value, id); if (!known.has(value)) strings.push([id, value]); }
      return { path, id };
    });
    const request: SnapshotTransportRequest = { protocol: SNAPSHOT_TRANSPORT, requestId, maxBytes, metadata: captured.metadata, strings, references, retainIds: [...next.values()] };
    return new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => { if (settled) return; settled = true; rejectActive = undefined; reset(); reject(error); };
      rejectActive = fail;
      port.onmessage = (event: MessageEvent<Reply>) => {
        const reply = event.data;
        if (settled || worker !== port || generation !== epoch || reply.requestId !== requestId) return;
        if (reply.blob) { settled = true; known = next; rejectActive = undefined; resolve(reply.blob); }
        else fail(Object.assign(new Error(reply.error || 'Could not save this canvas.'), { stage: reply.stage, bytes: reply.bytes }));
      };
      port.onerror = () => {
        if (worker !== port || generation !== epoch) return;
        if (settled) reset();
        else fail(new Error('Could not prepare this canvas for saving. Please retry.'));
      };
      const start = performance.now();
      try { port.postMessage(request); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      finally { onTransfer?.(start, performance.now() - start); }
    });
  };
  return {
    encode(snapshot: unknown, maxBytes: number): Promise<Blob> {
      let captured: CapturedSnapshot;
      try { if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid canvas snapshot size limit.'); captured = captureSnapshotTransport(snapshot); }
      catch (error) { return Promise.reject(error); }
      const job = tail.then(() => run(captured, maxBytes));
      tail = job.then(() => undefined, () => undefined);
      return job;
    },
    dispose() { disposed = true; rejectActive?.(new Error('The canvas encoder is closed.')); reset(); },
  };
}
