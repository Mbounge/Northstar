import { createHash } from 'node:crypto';
import { readFile, realpath, readdir } from 'node:fs/promises';
import { resolve, relative, join, extname, basename } from 'node:path';
import sharp from 'sharp';

export const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export type Capture = { id: string; file: string; sha256: string; width: number; height: number; label: string };
export type Asset = { id: string; file: string; sha256: string; mime: string; bytes: number; origin: string };
export type Evidence = { version: 1; app: string; source: string; sourceHash: string; fingerprint: string; viewport: { width: number; height: number }; captures: Capture[]; observations: Array<{ id: string; captureId: string; detail: string }>; assets: Asset[]; context: string; contextSources: Array<{file: string; sha256: string}>; limitations: string[] };
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
export function redact(value: unknown): string {
  return JSON.stringify(value ?? null, (key, item) => /password|secret|token|identity_email|identity_profile|fields_filled|persona|verification|code|email/i.test(key) ? '[private]' : item)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[demo email]').replace(/\b\d{6}\b/g, '[demo code]');
}
export async function boundedJson(path: string, max = 8_000_000) {
  const data = await readFile(path); if (data.length > max) throw new Error('Evidence JSON exceeds its size limit');
  return { value: object(JSON.parse(data.toString('utf8'))), hash: sha(data) };
}
export async function contained(root: string, path: string) {
  const realRoot = await realpath(root), candidate = await realpath(resolve(root, path));
  const rel = relative(realRoot, candidate);
  if (!rel || rel.startsWith('..') || rel.startsWith('/') || /\\/.test(rel)) throw new Error('Evidence path escapes its declared root');
  return candidate;
}
export async function loadEvidence(session: string, options: { manifest?: string; width?: number; height?: number; assetsDir?: string; select?: string[] } = {}): Promise<Evidence> {
  session = await realpath(session);
  const names = await readdir(session);
  const source = options.manifest ? await contained(session, options.manifest) : join(session, ['simulation_capture.json', 'onboarding_manifest.json', 'session_manifest.json', 'ios_capture_state.json', 'capture_storyboard.json'].find(name => names.includes(name)) ?? 'simulation_capture.json');
  const { value: data, hash: sourceHash } = await boundedJson(source);
  const refs: Array<{ path: string; label: string }> = [], observationInputs: Array<{ file: string; detail: unknown }> = [];
  const limitations: string[] = [], excluded = new Set<string>();
  if (basename(source) === 'simulation_capture.json') {
    for (const raw of data.captures ?? []) { const c = object(raw); if (c.external === true) { excluded.add(basename(String(c.file ?? ''))); continue; } refs.push({ path: String(c.file ?? ''), label: String(c.label ?? '') }); }
    for (const raw of data.observations ?? []) { const o = object(raw); observationInputs.push({ file: String(o.file ?? ''), detail: o.detail }); }
    limitations.push(...(Array.isArray(data.limitations) ? data.limitations.map(String) : []));
  } else if (Array.isArray(data.ordered_screenshots)) {
    // Email-app detours are evidence of the capture process, not screens of
    // the target app. They must never become simulated in-app destinations.
    if (data.metadata?.package !== 'com.google.android.gm') for (const raw of data.timeline ?? []) { const t = object(raw); if (['EMAIL_OPENED', 'CODE_EXTRACTED'].includes(t.action) && t.screenshot) excluded.add(basename(String(t.screenshot))); }
    for (const raw of data.ordered_screenshots) { const c = object(raw); refs.push({ path: 'screenshots/' + String(c.filename ?? ''), label: `Capture ${c.sequence}` }); }
    for (const raw of data.timeline ?? []) { const t = object(raw); observationInputs.push({ file: String(t.screenshot ?? ''), detail: { action: t.action, target: t.target, state: t.state, description: t.screen_desc, phase: t.phase } }); }
    if (data.result?.status !== 'COMPLETED_SETTLED') limitations.push('Onboarding capture is partial; no complete-app coverage claim is permitted.');
  } else if (Array.isArray(data.tabs)) {
    for (const raw of data.tabs) {
      const tab = object(raw);
      const paths = [...(tab.survey_screenshots ?? [])];
      for (const raw of tab.interactions ?? []) {
        const item = object(raw), files = item.screenshot_files ?? item.screenshots ?? [];
        paths.push(...files); for (const file of files) observationInputs.push({ file: String(file), detail: item });
      }
      for (const path of paths) refs.push({ path: String(path).startsWith('/') ? String(path) : 'screenshots/' + String(path).replace(/^screenshots\//, ''), label: String(tab.canonical_path ?? tab.name ?? '') });
    }
    limitations.push('Browsing coverage is limited to the saved canonical manifest.');
  } else if (Array.isArray(data.screens)) {
    const target = data.screens.map(object).find(c => c.signature === data.root_signature)?.active_bundle;
    if (!target) throw new Error('iOS evidence needs its captured root_signature or an explicit simulation_capture.json scope');
    for (const raw of data.screens) { const c = object(raw); if (c.active_bundle !== target) { excluded.add(basename(String(c.name ?? ''))); continue; } refs.push({ path: 'screenshots/' + String(c.name ?? ''), label: String((c.labels ?? []).join(' · ')) }); }
    for (const raw of data.transitions ?? []) observationInputs.push({ file: '', detail: raw });
    limitations.push('The iOS capture may be partial; transitions without a destination remain unverified.');
  } else if (Array.isArray(data.lanes)) {
    for (const raw of data.lanes) { const lane = object(raw); for (const path of lane.screens ?? []) refs.push({ path: 'screenshots/' + basename(String(path)), label: String(lane.title ?? '') }); }
    for (const raw of data.edges ?? []) observationInputs.push({ file: '', detail: raw });
    limitations.push(...(Array.isArray(data.known_gaps) ? data.known_gaps.map(item => redact(item)) : []));
  } else throw new Error('Unsupported capture manifest; supply simulation_capture.json with explicit captures and observations');
  const unique = new Map<string, { path: string; label: string }>();
  for (const ref of refs) { if (excluded.has(basename(ref.path))) continue; const path = await contained(session, ref.path); unique.set(path, { path, label: ref.label }); }
  if (excluded.size) limitations.push(`${excluded.size} external-app captures excluded; verification is simulated locally without visiting an inbox or using real codes.`);
  const selected = [...unique.values()].filter(ref => !options.select?.length || options.select.includes(basename(ref.path)));
  if (!selected.length || selected.length > 48 || options.select?.some(name => !selected.some(ref => basename(ref.path) === name))) throw new Error('Select between 1 and 48 existing canonical captures; larger apps require explicit scoped batches');
  const captures: Capture[] = [];
  let bytes = 0;
  for (const ref of selected) {
    const data = await readFile(ref.path); bytes += data.length;
    if (data.length > 12_000_000 || bytes > 120_000_000) throw new Error('Capture pixel budget exceeded');
    const meta = await sharp(data, { limitInputPixels: 40_000_000 }).metadata();
    if (meta.format !== 'png' || !meta.width || !meta.height) throw new Error('Canonical captures must be readable PNG files');
    captures.push({ id: `capture-${captures.length + 1}`, file: ref.path, sha256: sha(data), width: meta.width, height: meta.height, label: ref.label.slice(0, 300) });
  }
  const width = options.width ?? (basename(source) === 'ios_capture_state.json' || data.platform === 'ios' || data.metadata?.platform === 'ios' ? 390 : 360);
  const height = options.height ?? Math.round(captures[0].height * width / captures[0].width);
  if (![width, height].every(Number.isInteger) || width < 240 || width > 1920 || height < 240 || height > 1600) throw new Error('Supply a valid logical --width/--height for this capture');
  if (captures.some(c => Math.abs(c.width / c.height - width / height) > .002)) throw new Error('Mixed viewport/panorama captures need a separately scoped manifest; do not stretch them into one device');
  const observations = observationInputs.filter(o => !excluded.has(basename(o.file))).map((o, i) => ({ id: `observation-${i + 1}`, captureId: captures.find(c => basename(c.file) === basename(o.file))?.id ?? '', detail: redact(o.detail).slice(0, 6000) }));
  let context = ''; const contextSources: Evidence['contextSources'] = [];
  for (const name of ['apk_intelligence.json', 'agent_memory.json', 'enriched/session_intelligence.json']) {
    try { const safe = await contained(session, name), source = await boundedJson(safe); contextSources.push({file: safe, sha256: source.hash}); context += `\n${name}: ${redact(source.value).slice(0, 18_000)}`; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const assets: Asset[] = [];
  const assetRoots = options.assetsDir ? [await realpath(options.assetsDir)] : (await Promise.all(['extracted_fonts', 'extracted_icons'].map(async name => { try { const path = await contained(session, name + '/.'); return path; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; } }))).filter(Boolean);
  let assetBytes = 0, entries = 0;
  for (const root of assetRoots) {
    const queue = [''];
    while (queue.length) {
      const folder = queue.shift()!;
      for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
        if (++entries > 2000) throw new Error('Curate the APK assets into a smaller directory');
        if (entry.isSymbolicLink()) throw new Error('Asset symlinks are not supported');
        const name = join(folder, entry.name);
        if (entry.isDirectory()) { if (name.split('/').length <= 5) queue.push(name); continue; }
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' } as Record<string, string>)[extname(name).toLowerCase()];
        if (!mime) continue;
        const file = await contained(root, name), data = await readFile(file); assetBytes += data.length;
        if (assets.length >= 100 || data.length > 8_000_000 || assetBytes > 30_000_000) throw new Error('Curate the APK asset directory to at most 100 assets / 30 MB');
        if (mime.startsWith('image/')) { const meta=await sharp(data,{limitInputPixels:16_000_000}).metadata(); if (!meta.width || !meta.height || meta.width*meta.height>16_000_000) throw new Error('Artwork exceeds its decoded pixel budget'); }
        if (captures.some(c => c.sha256 === sha(data))) throw new Error('A complete capture cannot be supplied as an artwork asset');
        assets.push({ id: `asset-${assets.length + 1}`, file, sha256: sha(data), mime, bytes: data.length, origin: basename(root) + '/' + name });
      }
    }
  }
  const payload = { version: 1 as const, app: String(data.app ?? data.metadata?.app ?? basename(session)).slice(0, 120), source, sourceHash, viewport: { width, height }, captures, observations, assets, context, contextSources, limitations };
  return { ...payload, fingerprint: sha(JSON.stringify(payload)) };
}
export async function assertEvidenceUnchanged(evidence: Evidence) {
  const { fingerprint, ...payload } = evidence;
  if (sha(JSON.stringify(payload)) !== fingerprint) throw new Error('Prepared evidence was modified; prepare a new run');
  if (sha(await readFile(evidence.source)) !== evidence.sourceHash) throw new Error('Source manifest changed; prepare a new run');
  for (const file of [...evidence.captures, ...evidence.assets, ...evidence.contextSources]) if (sha(await readFile(file.file)) !== file.sha256) throw new Error('Source pixels or assets changed; prepare a new run');
}

/** Optional onboarding + browsing sources for one app; IDs are remapped once
 * and every contributing manifest remains part of the immutable source set. */
export async function loadCombinedEvidence(session: string, related: string[], options: Parameters<typeof loadEvidence>[1] = {}): Promise<Evidence> {
  const primary = await loadEvidence(session, options);
  if (!related.length) return primary;
  if (related.length > 4) throw new Error('Use at most four related capture sessions');
  const parts = [primary];
  for (const root of related) parts.push(await loadEvidence(root, { width: primary.viewport.width, height: primary.viewport.height, select: options.select }));
  const captures: Capture[] = [], observations: Evidence['observations'] = [], assets: Asset[] = [];
  for (const part of parts) {
    if (part.app.toLowerCase() !== primary.app.toLowerCase()) throw new Error('Related capture sessions must describe the same app');
    const ids = new Map<string,string>();
    for (const c of part.captures) { const existing = captures.find(s => s.file === c.file); const id = existing?.id ?? `capture-${captures.length+1}`; ids.set(c.id,id); if (!existing) captures.push({...c,id}); }
    for (const o of part.observations) observations.push({...o,id:`observation-${observations.length+1}`,captureId:ids.get(o.captureId)??''});
    for (const a of part.assets) if (!assets.some(s => s.sha256===a.sha256)) assets.push({...a,id:`asset-${assets.length+1}`});
  }
  if (captures.length > 48 || assets.length > 100 || assets.reduce((n,a)=>n+a.bytes,0)>30_000_000) throw new Error('Combined capture scope exceeds its evidence budget');
  const base = { ...primary }; delete (base as Partial<Evidence>).fingerprint;
  const payload = {...base,captures,observations,assets,context:parts.map(p=>p.context).join('\n'),contextSources:[...primary.contextSources,...parts.slice(1).flatMap(p=>[{file:p.source,sha256:p.sourceHash},...p.contextSources])],limitations:[...new Set(parts.flatMap(p=>p.limitations))]};
  return {...payload,fingerprint:sha(JSON.stringify(payload))};
}
