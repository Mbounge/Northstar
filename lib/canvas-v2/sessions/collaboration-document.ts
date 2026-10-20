import type { CanvasV2ArtifactRevision } from '../types';

export type SharedCells = Map<string, string>;
export interface CellChange { key: string; before: string | null; after: string | null }
export interface SharedOperation { id: string; clientId: string; changes: CellChange[]; label: string }
export interface AcceptedOperation extends SharedOperation { version: number; actorId: string }
type Segment = string | { ref: string };
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export const encodeSharedId = (id: string) => encodeURIComponent(id).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const prefix = (id: string) => `node:${encodeSharedId(id)}:`;
export function cellObjectId(key: string): string | undefined {
  const match = /^node:([^:]+):(open|body|close)$/.exec(key);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}
export function validCellKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 600 && (/^document:(html|css|javascript)$/.test(key) || !!cellObjectId(key) || /^evidence:[A-Za-z0-9_.%~-]+$/.test(key));
}
const decodeId = (value: string) => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const simple: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (simple[entity.toLowerCase()]) return simple[entity.toLowerCase()];
  const number = entity.slice(2, -1); const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
});
function stableIdAttribute(token: string): string | undefined {
  // Walk attributes rather than matching inside another quoted attribute.
  const start = /^<\s*[a-z][\w:-]*/i.exec(token)?.[0].length ?? token.length;
  const attributes = token.slice(start);
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of attributes.matchAll(pattern)) {
    if (match[1].toLowerCase() === 'data-canvas-v2-node-id') return decodeId(match[2] ?? match[3] ?? match[4] ?? '');
  }
}

/** Partition exact authored bytes by stable source identity. A parent stores
 * references to children, so editing a child never replaces its neighbours. */
export function partitionSharedHtml(html: string): SharedCells {
  const cells: SharedCells = new Map();
  const bodies = new Map<string, Segment[]>([['document:html', []]]);
  const stack: Array<{ tag: string; owner: string; id?: string }> = [];
  let owner = 'document:html', offset = 0;
  const append = (text: string) => {
    if (!text) return;
    const body = bodies.get(owner)!; const last = body.at(-1);
    if (typeof last === 'string') body[body.length - 1] = last + text; else body.push(text);
  };
  while (offset < html.length) {
    const start = html.indexOf('<', offset);
    if (start < 0) { append(html.slice(offset)); break; }
    append(html.slice(offset, start));
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4); const next = end < 0 ? html.length : end + 3;
      append(html.slice(start, next)); offset = next; continue;
    }
    let end = start + 1, quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) { append(html.slice(start)); break; }
    const token = html.slice(start, end + 1), match = /^<\s*(\/?)\s*([a-z][\w:-]*)\b/i.exec(token);
    offset = end + 1;
    if (!match) { append(token); continue; }
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const frame = stack.at(-1);
      if (!frame || frame.tag !== tag) { append(token); continue; }
      stack.pop();
      if (frame.id) { cells.set(prefix(frame.id) + 'close', token); owner = frame.owner; }
      else append(token);
      continue;
    }
    const id = stableIdAttribute(token);
    const selfClosing = VOID.has(tag) || /\/\s*>$/.test(token);
    if (id) {
      if (id.length > 256 || cells.has(prefix(id) + 'open')) throw new Error('This canvas contains a duplicate or invalid object identity.');
      bodies.get(owner)!.push({ ref: id });
      cells.set(prefix(id) + 'open', token); cells.set(prefix(id) + 'close', '');
      const previous = owner; owner = prefix(id) + 'body'; bodies.set(owner, []);
      if (selfClosing) owner = previous; else stack.push({ tag, id, owner: previous });
    } else {
      append(token);
      if (!selfClosing) stack.push({ tag, owner });
    }
    // HTML raw-text elements contain markup-looking strings, never children.
    if (!selfClosing && ['script', 'style', 'textarea', 'title'].includes(tag)) {
      const ending = new RegExp(`</${tag}\\s*>`, 'ig'); ending.lastIndex = offset;
      const close = ending.exec(html);
      if (!close) throw new Error('The shared canvas contains an unfinished raw-text element.');
      append(html.slice(offset, close.index));
      const frame = stack.pop()!;
      if (frame.id) { cells.set(prefix(frame.id) + 'close', close[0]); owner = frame.owner; } else append(close[0]);
      offset = close.index + close[0].length;
    }
  }
  if (stack.some(frame => frame.id)) throw new Error('The shared canvas contains an unfinished object.');
  for (const [key, body] of bodies) cells.set(key, JSON.stringify(body));
  return cells;
}

export function sharedCellsFromRevision(revision: CanvasV2ArtifactRevision): SharedCells {
  const cells = partitionSharedHtml(revision.document.html);
  cells.set('document:css', revision.document.css);
  cells.set('document:javascript', JSON.stringify(revision.document.javascript ?? null));
  for (const asset of revision.evidence) cells.set(`evidence:${encodeSharedId(asset.id)}`, JSON.stringify(asset));
  return cells;
}

export function revisionFromSharedCells(cells: ReadonlyMap<string, string>, previous: CanvasV2ArtifactRevision, version: string): CanvasV2ArtifactRevision {
  const html = htmlFromSharedCells(cells), css = cells.get('document:css') ?? '';
  const javascript: unknown = JSON.parse(cells.get('document:javascript') ?? 'null');
  if (javascript !== null && typeof javascript !== 'string') throw new Error('Invalid shared canvas script.');
  const evidence = [...cells].filter(([key]) => key.startsWith('evidence:')).map(([, value]) => JSON.parse(value));
  return { ...previous, placementAuthority:'shared', sceneTransaction: undefined, id: version, state: 'committed', createdAt: new Date().toISOString(), document: { html, css, ...(javascript === null ? {} : { javascript }) }, evidence };
}

export function htmlFromSharedCells(cells: ReadonlyMap<string, string>): string {
  const used = new Set<string>(); let size = 0;
  const render = (key: string, depth: number): string => {
    if (depth > 128) throw new Error('The shared object hierarchy is too deep.');
    const raw = cells.get(key); if (raw === undefined) throw new Error('A shared object is missing. Reconnect before editing.');
    const body: unknown = JSON.parse(raw);
    if (!Array.isArray(body) || body.length > 100_000) throw new Error('Invalid shared object contents.');
    return body.map((segment: unknown) => {
      if (typeof segment === 'string') { size += segment.length; if (size > 120_000_000) throw new Error('The shared canvas is too large.'); return segment; }
      if (!segment || typeof segment !== 'object' || !('ref' in segment) || typeof segment.ref !== 'string' || used.has(segment.ref)) throw new Error('Invalid shared object reference.');
      used.add(segment.ref); const name = prefix(segment.ref);
      const open = cells.get(name + 'open'), close = cells.get(name + 'close');
      if (open === undefined || close === undefined) throw new Error('A shared object is incomplete.');
      size += open.length + close.length;
      return open + render(name + 'body', depth + 1) + close;
    }).join('');
  };
  return render('document:html', 0);
}

export async function hashSharedCell(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function diffSharedCells(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): Promise<CellChange[]> {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return (await Promise.all([...keys].filter(key => before.get(key) !== after.get(key)).map(async key => ({ key, before: before.has(key) ? await hashSharedCell(before.get(key)!) : null, after: after.get(key) ?? null }))));
}
export function applySharedChanges(cells: ReadonlyMap<string, string>, changes: readonly CellChange[]): SharedCells {
  const next = new Map(cells);
  const seen = new Set<string>();
  for (const change of changes) {
    if (!validCellKey(change.key) || seen.has(change.key) || (change.after !== null && typeof change.after !== 'string') || (change.before !== null && !/^[a-f0-9]{64}$/.test(change.before))) throw new Error('Invalid collaborative edit.');
    seen.add(change.key);
    if (change.after === null) next.delete(change.key); else next.set(change.key, change.after);
  }
  return next;
}
export async function conflictingSharedCells(cells: ReadonlyMap<string, string>, changes: readonly CellChange[]): Promise<string[]> {
  return (await Promise.all(changes.map(async change => ((cells.has(change.key) ? await hashSharedCell(cells.get(change.key)!) : null) === change.before ? undefined : change.key)))).filter((key): key is string => !!key);
}
