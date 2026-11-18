import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { createAnimatedFilmRenderer } from '../lib/canvas-v2/film-production/animated-film-renderer.mjs';
import { beatHold, defaultNarrationSpeed, defaultVoice, runMediaCommand } from '../lib/canvas-v2/film-production/film-narration.mjs';
import { configureBlender } from './blender-render.server.mjs';

interface BeatTiming { start: number; speechEnd: number; end: number }
export interface FilmLesson {
  audio?: 'silent';
  title: string;
  question: string;
  audience: string;
  takeaway: string;
  sourceNotes: string;
  visualApproach: string;
  narration?: { voice?: string; speed?: number };
  beats: { heading: string; narration: string; visual: string; voice?: string; speaker?: string; seconds?: number }[];
}
export interface FilmFrameSample { beat: number; progress: number }
export interface FilmScene {
  engine?: 'browser' | 'three';
  html: string;
  css: string;
  javascript: string;
  model?: { requestId: string; sha256: string };
  modelBytes?: Buffer;
  modelSource?: Buffer;
  artworks?: { requestId: string; index: number }[];
  archiveHtml?: string;
  workbench?: string;
  artworkFiles?: Record<string, Buffer>;
}
type FilmArtifact = [string, string, Buffer];
export interface StudioRender { duration: number; beats: BeatTiming[]; narration: string | null; silent?: true; artifacts: FilmArtifact[]; renderer: string }
interface FrameOptions {
  samples?: FilmFrameSample[];
  beats: number | BeatTiming[];
  frames?: number;
  fps?: number;
  frameStart?: number;
  frameEnd?: number;
  allowStill?: boolean;
  signal: AbortSignal;
  writeFrames?: (produce: (send: (bytes: Buffer) => Promise<void>) => Promise<void>) => Promise<void>;
}

const width = 1280, height = 720;
const ffmpeg = process.env.NORTHSTAR_FFMPEG ?? 'ffmpeg';
const ffprobe = process.env.NORTHSTAR_FFPROBE ?? 'ffprobe';
const mediaEnv = { PATH: process.env.PATH, LANG: process.env.LANG };
const filmThreeSource = () => readFile(new URL('./film-r179.js', import.meta.url), 'utf8');
const filmThreeLicense = () => readFile(new URL('./film-three.LICENSE.txt', import.meta.url), 'utf8');
type FrameProgress = (stage: 'capture' | 'encode', completed: number, total: number) => void;

/** UKIO's deterministic frame clock and screenshot contract on Northstar's
 * private worker browser. The authored program runs inside an opaque iframe. */
async function renderFilm(scene: FilmScene, options: FrameOptions) {
  const { signal, samples, beats } = options;
  signal.throwIfAborted();
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG','FONTCONFIG_PATH','PLAYWRIGHT_BROWSERS_PATH']
    .flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const executablePath = process.env.NORTHSTAR_FILM_CHROMIUM;
  if (executablePath && !isAbsolute(executablePath)) throw Error('Configure an absolute film browser path.');
  const browser: Browser = await chromium.launch({ executablePath, headless: true, env, timeout: 20_000,
    ...(process.platform === 'linux' && scene.engine === 'three'
      ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) });
  const close = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', close, { once: true });
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    context.on('page', other => { if (other !== page) void other.close(); });
    page.setDefaultTimeout(18_000);
    let runtimeError: string | undefined;
    page.on('pageerror', error => { runtimeError ??= error.message.slice(0, 400); });
    const three = scene.engine === 'three' ? (await filmThreeSource()).replace(/<\/script/gi, '<\\/script') : '';
    const model = scene.modelBytes ? 'window.UKIOGLTF=Object.freeze({parse:()=>window.UKIOThreeAssets.parse(' + JSON.stringify(scene.modelBytes.toString('base64')) + ')});' : '';
    const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
    const markup = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}${scene.css}</style><script>${three}\n${model}</script>${scene.html}<script>${scene.javascript}</script>`;
    await page.setContent('<body style="margin:0;overflow:hidden"><iframe title="Film scene" sandbox="allow-scripts" style="display:block;width:100vw;height:100vh;border:0"></iframe></body>');
    const iframe = page.locator('iframe');
    await iframe.evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, markup);
    const frame = await (await iframe.elementHandle())?.contentFrame();
    if (!frame) throw Error('The private film stage did not open.');
    await frame.waitForFunction(() => {
      const stage = window as unknown as { render?: unknown };
      return location.href === 'about:srcdoc' && (typeof stage.render === 'function' || document.readyState === 'complete');
    });
    await frame.evaluate(async () => {
      if (typeof (window as unknown as {render?: unknown}).render !== 'function') throw Error('Define window.render in the film workbench.');
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    const cdp = await context.newCDPSession(page);
    let previous: Buffer | undefined;
    let previousKey: string | number | undefined;
    const jpegPrefix = 'data:image/jpeg;base64,';
    const capture = async (state: { time: number; beatIndex: number; progress: number; beat: BeatTiming; duration: number }) => {
      signal.throwIfAborted();
      const painted = await frame.evaluate(async ({ value, previousKey, width, height }) => {
        const stage = window as unknown as {
          render: (data: typeof value) => void | Promise<void>;
          exportFilmCanvas?: HTMLCanvasElement;
          filmFrameKey?: (data: typeof value) => string | number;
        };
        const key = stage.exportFilmCanvas ? stage.filmFrameKey?.(value) : undefined;
        if (key !== undefined && key === previousKey) return { held: true };
        await stage.render(value);
        const canvas = stage.exportFilmCanvas;
        if (!canvas) return;
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width !== width || canvas.height !== height) {
          throw Error('The complete film export canvas must be 1280 by 720 pixels.');
        }
        return { jpeg: canvas.toDataURL('image/jpeg', .94), key };
      }, { value: state, previousKey, width, height });
      if (runtimeError) throw Error('Film scene error: ' + runtimeError);
      if (painted?.held && previous) return previous;
      if (painted?.jpeg?.startsWith(jpegPrefix)) {
        previous = Buffer.from(painted.jpeg.slice(jpegPrefix.length), 'base64');
        previousKey = painted.key;
        return previous;
      }
      if (painted) throw Error('The complete export canvas did not return a painted frame.');
      const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      })).data, 'base64');
      try { return await shot(); }
      catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Unable to capture screenshot')) throw error;
        signal.throwIfAborted();
        await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        return shot();
      }
    };
    if (samples && typeof beats === 'number') {
      const images: Buffer[] = [];
      for (const { beat, progress } of samples) images.push(await capture({
        time: (beat + progress) * 5, beatIndex: beat, progress,
        beat: { start: beat * 5, speechEnd: (beat + 1) * 5, end: (beat + 1) * 5 }, duration: beats * 5,
      }));
      if (!options.allowStill && new Set(images.map(image => createHash('sha256').update(image).digest('hex'))).size < 2) {
        throw Error('The rehearsal did not show a visual change across the sequence.');
      }
      return images;
    }
    const { fps, frames, frameStart = 0, frameEnd = frames, writeFrames } = options;
    if (typeof beats === 'number' || !fps || !frames || !frameEnd || !writeFrames || frameStart < 0 || frameEnd > frames || frameStart >= frameEnd) throw Error('Invalid film frame range.');
    await writeFrames(async send => {
      for (let index = frameStart; index < frameEnd; index++) {
        const time = index / fps;
        const beatIndex = Math.max(0, beats.findLastIndex(beat => time >= beat.start));
        const beat = beats[beatIndex];
        await send(await capture({ time, beatIndex, beat, progress: Math.min(1, (time - beat.start) / (beat.speechEnd - beat.start)), duration: frames / fps }));
      }
    });
  } finally {
    signal.removeEventListener('abort', close);
    await browser.close().catch(() => {});
  }
}

async function prepareNarration(lesson: FilmLesson, { cwd, signal }: { cwd: string; signal: AbortSignal }) {
  const command = { cwd, env: { ...mediaEnv, TMPDIR: cwd }, signal };
  const adapter = process.env.NORTHSTAR_NARRATION_ADAPTER;
  const python = process.env.NORTHSTAR_KOKORO_PYTHON;
  const models = process.env.NORTHSTAR_KOKORO_MODEL_DIR;
  const kokoro = !adapter && !!python && !!models;
  if ([adapter, python, models].some(value => value && !isAbsolute(value))) throw Error('Configure absolute paths for the narrator.');
  if (!kokoro && (lesson.narration || lesson.beats.some(beat => beat.voice))) throw Error('The selected neural voice is unavailable on this worker.');
  if (!adapter && !kokoro && process.platform !== 'darwin') throw Error('Configure Kokoro or a narration adapter on the film worker.');
  let duration = 0;
  const files: string[] = [], beats: BeatTiming[] = [];
  for (const [index, beat] of lesson.beats.entries()) {
    const script = join(cwd, `beat-${index}.txt`);
    const speech = join(cwd, `speech-${index}.${adapter || kokoro ? 'wav' : 'aiff'}`);
    const wave = join(cwd, `beat-${index}.wav`);
    await writeFile(script, beat.narration);
    if (adapter) await runMediaCommand(adapter, [script, speech], command);
    else if (kokoro) await runMediaCommand(python, ['-I', fileURLToPath(new URL('./kokoro-narration.py', import.meta.url)), models,
      script, speech, beat.voice ?? lesson.narration?.voice ?? defaultVoice, String(lesson.narration?.speed ?? defaultNarrationSpeed)], command);
    else await runMediaCommand('/usr/bin/say', ['-r', '140', '-o', speech, '-f', script], command);
    const length = Number((await runMediaCommand(ffprobe, ['-v','error','-show_entries','format=duration','-of','csv=p=0',speech], command)).trim());
    const { peak } = await audioPeak(speech, command);
    if (!Number.isFinite(length) || length < .4 || peak <= -60) throw Error(`No usable narration was recorded for “${beat.heading}”.`);
    await runMediaCommand(ffmpeg, ['-nostdin','-v','error','-y','-i',speech,'-ar','48000','-ac','1',wave], command);
    const speechEnd = duration + length, end = speechEnd + beatHold(beat, length);
    beats.push({ start: duration, speechEnd, end });
    duration = end;
    files.push(wave);
  }
  return { duration, files, beats, voice: adapter ? 'Configured narration' : kokoro ? 'Kokoro local narration' : 'macOS rehearsal voice' };
}
async function audioPeak(path: string, command: {cwd: string; env: Record<string, string|undefined>; signal: AbortSignal}) {
  const output = await runMediaCommand(ffmpeg, ['-nostdin','-nostats','-i',path,'-map','0:a:0','-af','volumedetect','-f','null','-'], command);
  const peak = Number(output.match(/max_volume: (-?[0-9.]+) dB/)?.[1]);
  if (!Number.isFinite(peak)) throw Error('The audio track has no measurable signal.');
  return { peak };
}

const render = createAnimatedFilmRenderer({ browser: { renderFilm, filmThreeSource, filmThreeLicense },
  prepareNarration, ffmpeg, maxDuration: 90, maxVideoBytes: 5_000_000 }) as
  (input: { lesson: FilmLesson; scene: FilmScene }, options: {signal: AbortSignal; onFrameProgress?: FrameProgress}) => Promise<StudioRender>;

async function inspectEncodedFilm(output: StudioRender, samples: FilmFrameSample[], signal: AbortSignal) {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-film-review-'));
  const command = { cwd, env: { ...mediaEnv, TMPDIR: cwd }, signal };
  const video = join(cwd, 'lesson.mp4');
  try {
    await writeFile(video, output.artifacts[0][2]);
    const probe = JSON.parse(await runMediaCommand(ffprobe, ['-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate:format=duration','-of','json',video], command)) as {
      streams: {codec_type: string; width?: number; height?: number; avg_frame_rate?: string}[]; format: {duration: string};
    };
    const picture = probe.streams.find(stream => stream.codec_type === 'video');
    const hasAudio = probe.streams.some(stream => stream.codec_type === 'audio');
    if (picture?.width !== width || picture.height !== height || picture.avg_frame_rate !== '24/1' ||
      Math.abs(Number(probe.format.duration) - output.duration) > .1 || hasAudio === Boolean(output.silent)) throw Error('The encoded film does not match its timeline and media tracks.');
    const peak = hasAudio ? (await audioPeak(video, command)).peak : null;
    if (peak !== null && peak <= -60) throw Error('The encoded narration is silent.');
    const images: Buffer[] = [], seconds: number[] = [];
    for (const [index, {beat, progress}] of samples.entries()) {
      const chapter = output.beats[beat];
      const time = Math.min(output.duration - .05, chapter.start + (chapter.speechEnd - chapter.start) * progress);
      const path = join(cwd, `review-${index}.jpg`);
      await runMediaCommand(ffmpeg, ['-nostdin','-v','error','-y','-ss',String(time),'-i',video,'-frames:v','1','-q:v','3',path], command);
      images.push(await readFile(path));
      seconds.push(time);
    }
    return { images, seconds, peak };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

let usingRenderer = false;
async function exclusive<T>(task: () => Promise<T>) {
  if (usingRenderer) throw Error('The film worker is already rehearsing or rendering. Retry after that operation completes.');
  usingRenderer = true;
  try { return await task(); }
  finally { usingRenderer = false; }
}
export const filmRenderWorker = {
  sample(scene: FilmScene, samples: FilmFrameSample[], beatCount: number, allowStill: boolean, signal: AbortSignal) {
    return exclusive(async () => (await renderFilm(scene, { samples, beats: beatCount, allowStill, signal }))!);
  },
  render(lesson: FilmLesson, scene: FilmScene, samples: FilmFrameSample[], signal: AbortSignal, onFrameProgress?: FrameProgress) {
    return exclusive(async () => {
      const output = await render({ lesson, scene }, { signal, onFrameProgress });
      return { output, ...await inspectEncodedFilm(output, samples, signal) };
    });
  },
  model(scene: unknown, signal: AbortSignal) {
    return exclusive(async () => {
      const binary = process.env.NORTHSTAR_BLENDER_BINARY;
      const blender = binary && await configureBlender(binary);
      if (!blender) throw Error('Blender is unavailable on this worker.');
      const result = await blender.execute({ input: { scene } }, { signal });
      const model = result.artifacts.find((item: { name: string }) => item.name === 'scene.glb');
      const source = result.artifacts.find((item: { name: string }) => item.name === 'scene.json');
      if (!model || !source) throw Error('Blender did not produce a retained GLB and editable source.');
      return { bytes:Buffer.from(model.dataBase64,'base64'),source:Buffer.from(source.dataBase64,'base64'),title:result.output.title };
    });
  },
};
