import { createSnapshotPersistenceDecoder, decodeSnapshot, encodeSnapshot } from '@/lib/canvas-v2/sessions/snapshot';
import { snapshotBlobUrls } from '@/lib/canvas-v2/sessions/snapshot-blob-urls';
import { assertSnapshotSize } from '@/lib/canvas-v2/sessions/snapshot-size';
import { encodeSnapshotText, unpackSnapshotText } from '@/lib/canvas-v2/sessions/snapshot-codec';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';

/** Test-only, per-tab state. sessionStorage is intentionally used instead of
 * localStorage so a browser refresh survives without sharing a live canvas
 * across independent Northstar test tabs. */
export const SUBAGENT_SNAPSHOT_STORAGE_KEY = 'northstar-e2e:codex-subagent:snapshot:v1';
// The local showcase retains original clips, models and generated photographs.
// Bound the complete test board separately from an individual wire operation.
export const SUBAGENT_SNAPSHOT_MAX_BYTES = 128 * 1024 * 1024;

/** The test transport can move archived canvases without clipboard access. */
export function importSubagentSnapshot(raw: string): NorthstarSnapshot {
  if (new TextEncoder().encode(raw).byteLength > SUBAGENT_SNAPSHOT_MAX_BYTES) throw new Error('This canvas file exceeds the test snapshot size limit.');
  const snapshot = normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(raw)));
  if (snapshotBlobUrls(raw).length) throw new Error('This canvas file contains temporary media URLs. Export a materialized snapshot before importing.');
  return snapshot;
}
export async function importSubagentSnapshotBlob(blob: Blob): Promise<NorthstarSnapshot> {
  assertSnapshotSize(blob.size, SUBAGENT_SNAPSHOT_MAX_BYTES);
  const raw = await unpackSnapshotText(await blob.text(), SUBAGENT_SNAPSHOT_MAX_BYTES);
  if (snapshotBlobUrls(raw).length) throw new Error('This canvas file contains temporary media URLs. Export a materialized snapshot before importing.');
  return normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(raw)));
}
const SUBAGENT_SNAPSHOT_TAB_KEY = `${SUBAGENT_SNAPSHOT_STORAGE_KEY}:tab`;
const SUBAGENT_SNAPSHOT_DB = 'northstar-e2e:codex-subagent';
const SUBAGENT_SNAPSHOT_STORE = 'snapshots';
const SUBAGENT_SNAPSHOT_DB_KEY = 'current';
const SUBAGENT_SNAPSHOT_LIST_LIMIT = 24;

type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function normalizeSubagentSnapshot(snapshot: NorthstarSnapshot): NorthstarSnapshot {
  const turns = snapshot.turns.map(turn => {
    if (turn.status !== 'routing' && turn.status !== 'running') return turn;
    return {
      ...turn,
      status: 'stopped' as const,
      activeSince: undefined,
      error: turn.error || 'The page closed during this test run. Send a follow-up to continue from the saved canvas.',
    };
  });
  return turns.every((turn, index) => turn === snapshot.turns[index]) ? snapshot : { ...snapshot, turns };
}

export function readSubagentSnapshot(storage: SnapshotStorage): NorthstarSnapshot | undefined {
  try {
    const raw = storage.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY);
    if (!raw || new TextEncoder().encode(raw).byteLength > SUBAGENT_SNAPSHOT_MAX_BYTES) return;
    const parsed = JSON.parse(raw);
    // The legacy synchronous reader cannot inflate a packed archive. Leave it
    // intact for readSubagentSnapshotDurable rather than deleting valid work.
    if (parsed?.schema === 'northstar.snapshot.gzip.v1') return;
    return normalizeSubagentSnapshot(decodeSnapshot(parsed));
  } catch {
    try { storage.removeItem(SUBAGENT_SNAPSHOT_STORAGE_KEY); } catch { /* Storage can be unavailable or quota-restricted. */ }
    return;
  }
}

type EncodedSnapshot = { raw: string; bytes: number };
export interface SavedSubagentSnapshotSummary {
  key: string;
  title: string;
  appCount: number;
  objectCount: number;
  savedAt: string;
  bytes: number;
}
export type SubagentSnapshotWriteResult =
  | { ok: true; bytes: number; storage: 'indexeddb' | 'sessionStorage' }
  | { ok: false; stage: 'encode' | 'size' | 'storage'; message: string; bytes?: number };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const decodeSnapshotForPersistence = createSnapshotPersistenceDecoder();

async function encodeSnapshotOnMainThread(snapshot: NorthstarSnapshot): Promise<Blob> {
  let text = JSON.stringify(snapshot);
  const urls = snapshotBlobUrls(text);
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Uploaded media fetch failed (${response.status}).`);
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Uploaded media could not be materialized.'));
      reader.readAsDataURL(blob);
    });
    text = text.split(url).join(data);
  }
  return encodeSnapshotText(text, SUBAGENT_SNAPSHOT_MAX_BYTES);
}

async function encodedSnapshotBlob(snapshot: NorthstarSnapshot): Promise<Blob> {
  const normalized = normalizeSubagentSnapshot(decodeSnapshotForPersistence(snapshot));
  let blob: Blob;
  try {
    blob = await encodeSnapshot(normalized, { maxBytes: SUBAGENT_SNAPSHOT_MAX_BYTES });
  } catch (workerError) {
    // A size rejection is final. Repeating the same large JSON walk on the UI
    // thread cannot fix it and makes camera navigation stall.
    if ((workerError as { stage?: string }).stage === 'size') throw workerError;
    try { blob = await encodeSnapshotOnMainThread(normalized); }
    catch (fallbackError) { throw new Error(`worker encode failed: ${errorMessage(workerError)}; main-thread fallback failed: ${errorMessage(fallbackError)}`); }
  }
  assertSnapshotSize(blob.size, SUBAGENT_SNAPSHOT_MAX_BYTES);
  return blob;
}

async function encodedSnapshot(snapshot: NorthstarSnapshot): Promise<EncodedSnapshot> {
  const blob = await encodedSnapshotBlob(snapshot);
  return { raw: await blob.text(), bytes: blob.size };
}

function durableSnapshotKey(storage: SnapshotStorage): string {
  try {
    const existing = storage.getItem(SUBAGENT_SNAPSHOT_TAB_KEY);
    if (existing) return existing;
    const generated = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(SUBAGENT_SNAPSHOT_TAB_KEY, generated);
    return generated;
  } catch { return 'default'; }
}

function openSubagentSnapshotDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SUBAGENT_SNAPSHOT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SUBAGENT_SNAPSHOT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open durable test storage.'));
  });
}

type DurableSnapshotRecord = { raw: string; savedAt: string };

async function durableRaw(value: unknown): Promise<DurableSnapshotRecord | undefined> {
  if (value instanceof Blob) return { raw: await unpackSnapshotText(await value.text(), SUBAGENT_SNAPSHOT_MAX_BYTES), savedAt: '' };
  if (typeof value === 'string') return { raw: await unpackSnapshotText(value, SUBAGENT_SNAPSHOT_MAX_BYTES), savedAt: '' };
  if (value && typeof value === 'object' && (value as { blob?: unknown }).blob instanceof Blob) {
    const record = value as { blob: Blob; savedAt?: string };
    return { raw: await unpackSnapshotText(await record.blob.text(), SUBAGENT_SNAPSHOT_MAX_BYTES), savedAt: typeof record.savedAt === 'string' ? record.savedAt : '' };
  }
  if (value && typeof value === 'object' && typeof (value as { raw?: unknown }).raw === 'string') {
    const savedAt = typeof (value as { savedAt?: unknown }).savedAt === 'string' ? (value as { savedAt: string }).savedAt : '';
    return { raw: await unpackSnapshotText((value as { raw: string }).raw, SUBAGENT_SNAPSHOT_MAX_BYTES), savedAt };
  }
  return undefined;
}

async function readDurableRecord(key: string): Promise<DurableSnapshotRecord | undefined> {
  if (!key || key.length > 256) return;
  const database = await openSubagentSnapshotDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUBAGENT_SNAPSHOT_STORE, 'readonly');
    const request = transaction.objectStore(SUBAGENT_SNAPSHOT_STORE).get(key || SUBAGENT_SNAPSHOT_DB_KEY);
    const close = () => database.close();
    request.onsuccess = () => {
      const value = request.result;
      void durableRaw(value).then(resolve, reject);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read durable test storage.'));
    transaction.oncomplete = close;
    transaction.onerror = () => { close(); reject(transaction.error ?? new Error('Could not read durable test storage.')); };
    transaction.onabort = () => { close(); reject(transaction.error ?? new Error('Could not read durable test storage.')); };
  });
}

async function readDurableSnapshot(key: string): Promise<string | undefined> {
  return (await readDurableRecord(key))?.raw;
}

async function writeDurableSnapshot(blob: Blob, key: string): Promise<void> {
  const database = await openSubagentSnapshotDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SUBAGENT_SNAPSHOT_STORE, 'readwrite');
    // Blob structured cloning shares immutable backing data. Avoid turning a
    // 120 MB board back into a UI-thread string for every camera checkpoint.
    transaction.objectStore(SUBAGENT_SNAPSHOT_STORE).put({ blob, savedAt: new Date().toISOString() }, key || SUBAGENT_SNAPSHOT_DB_KEY);
    const close = () => database.close();
    transaction.oncomplete = () => { close(); resolve(); };
    transaction.onerror = () => { close(); reject(transaction.error ?? new Error('Could not write durable test storage.')); };
    transaction.onabort = () => { close(); reject(transaction.error ?? new Error('Could not write durable test storage.')); };
  });
}

/** Refresh-safe test storage. IndexedDB keeps large encoded media out of the small sessionStorage quota. */
export async function readSubagentSnapshotDurable(storage: SnapshotStorage): Promise<NorthstarSnapshot | undefined> {
  try {
    const raw = await readDurableSnapshot(durableSnapshotKey(storage));
    if (raw) return normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(raw)));
  } catch { /* Fall back to the old per-tab copy when durable storage is unavailable. */ }
  try {
    const raw = storage.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY);
    return raw ? normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(await unpackSnapshotText(raw, SUBAGENT_SNAPSHOT_MAX_BYTES)))) : undefined;
  } catch { return undefined; }
}

/** Download only the validated, materialized saved record. No ephemeral blob
 * URLs or active transport turn are exported into an archival snapshot. */
export async function exportSubagentSnapshot(storage: SnapshotStorage): Promise<Blob> {
  const snapshot = await readSubagentSnapshotDurable(storage);
  if (!snapshot) throw new Error('There is no valid saved test canvas to download.');
  return encodedSnapshotBlob(snapshot);
}

function snapshotSummary(key: string, raw: string, savedAt: string): SavedSubagentSnapshotSummary | undefined {
  try {
    const snapshot = normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(raw)));
    const identities = snapshot.memory?.productIdentities ?? [];
    const apps = new Set(identities.map(identity => identity.id || identity.name).filter(Boolean));
    const evidenceApps = snapshot.revision.evidence.map(asset => asset.app).filter((app): app is string => Boolean(app?.trim()));
    evidenceApps.forEach(app => apps.add(app));
    const nodeIds = new Set<string>();
    const nodePattern = /data-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi;
    for (const match of snapshot.revision.document.html.matchAll(nodePattern)) nodeIds.add(match[1]);
    nodeIds.delete('canvas');
    const title = snapshot.revision.summary?.trim() || identities[0]?.name?.trim() || `Saved canvas ${key.slice(0, 8)}`;
    return { key, title: title.slice(0, 120), appCount: apps.size, objectCount: nodeIds.size, savedAt: savedAt || snapshot.revision.createdAt, bytes: new TextEncoder().encode(raw).byteLength };
  } catch { return undefined; }
}

/** List a bounded set of durable snapshots without changing any record. */
export async function listSavedSubagentSnapshots(limit = SUBAGENT_SNAPSHOT_LIST_LIMIT): Promise<SavedSubagentSnapshotSummary[]> {
  const boundedLimit = Math.max(1, Math.min(SUBAGENT_SNAPSHOT_LIST_LIMIT, Math.floor(limit)));
  try {
    const database = await openSubagentSnapshotDatabase();
    const keys = await new Promise<string[]>((resolve, reject) => {
      const request = database.transaction(SUBAGENT_SNAPSHOT_STORE, 'readonly').objectStore(SUBAGENT_SNAPSHOT_STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result.filter((key): key is string => typeof key === 'string'));
      request.onerror = () => reject(request.error ?? new Error('Could not list durable test storage.'));
    });
    database.close();
    const result: SavedSubagentSnapshotSummary[] = [];
    // IndexedDB keys are not chronological. Limiting before sorting can hide
    // the newest demo forever behind older randomly keyed test canvases.
    for (const key of keys) {
      const record = await readDurableRecord(key);
      const summary = record && snapshotSummary(key, record.raw, record.savedAt);
      if (summary) result.push(summary);
    }
    return result.sort((left, right) => right.savedAt.localeCompare(left.savedAt)).slice(0, boundedLimit);
  } catch { return []; }
}

/** Load one selected durable snapshot; invalid or malformed keys never mutate storage. */
export async function loadSavedSubagentSnapshot(key: string): Promise<NorthstarSnapshot | undefined> {
  if (typeof key !== 'string' || !key.trim() || key.length > 256) return undefined;
  try {
    const record = await readDurableRecord(key);
    return record ? normalizeSubagentSnapshot(decodeSnapshot(JSON.parse(record.raw))) : undefined;
  } catch { return undefined; }
}

export function writeSubagentSnapshot(storage: SnapshotStorage, snapshot: NorthstarSnapshot): boolean {
  try {
    const normalized = normalizeSubagentSnapshot(decodeSnapshot(snapshot));
    const raw = JSON.stringify(normalized);
    if (new TextEncoder().encode(raw).byteLength > SUBAGENT_SNAPSHOT_MAX_BYTES) return false;
    storage.setItem(SUBAGENT_SNAPSHOT_STORAGE_KEY, raw);
    return true;
  } catch {
    // A private tab may deny sessionStorage or run out of quota. The live
    // canvas remains the source of truth; persistence is a best-effort aid.
    return false;
  }
}

/** Persist uploaded blob URLs as data URLs before their owning document closes. */
export async function writeSubagentSnapshotAsync(storage: SnapshotStorage, snapshot: NorthstarSnapshot): Promise<boolean> {
  try {
    const { raw } = await encodedSnapshot(snapshot);
    storage.setItem(SUBAGENT_SNAPSHOT_STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export async function writeSubagentSnapshotDurableDetailed(storage: SnapshotStorage, snapshot: NorthstarSnapshot): Promise<SubagentSnapshotWriteResult> {
  let blob: Blob;
  try {
    blob = await encodedSnapshotBlob(snapshot);
  } catch (error) {
    const stage = (error as { stage?: unknown }).stage === 'size' ? 'size' : 'encode';
    return { ok: false, stage, message: errorMessage(error), bytes: (error as { bytes?: number }).bytes };
  }
  try {
    await writeDurableSnapshot(blob, durableSnapshotKey(storage));
    return { ok: true, bytes: blob.size, storage: 'indexeddb' };
  } catch (indexedDbError) {
    try {
      storage.setItem(SUBAGENT_SNAPSHOT_STORAGE_KEY, await blob.text());
      return { ok: true, bytes: blob.size, storage: 'sessionStorage' };
    } catch (sessionError) {
      return { ok: false, stage: 'storage', bytes: blob.size, message: `IndexedDB write failed: ${errorMessage(indexedDbError)}; sessionStorage fallback failed: ${errorMessage(sessionError)}` };
    }
  }
}

export async function writeSubagentSnapshotDurable(storage: SnapshotStorage, snapshot: NorthstarSnapshot): Promise<boolean> {
  return (await writeSubagentSnapshotDurableDetailed(storage, snapshot)).ok;
}
