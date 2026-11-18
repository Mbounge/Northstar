import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, firefox, type Browser } from 'playwright-core';
import { encodeCanvasV2Screen, canvasV2ScreenBoundAssets } from '../lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';
import { isCanvasV2ScreenModelBytes } from '../lib/canvas-v2/screen-asset-pixels';
import { validateAccessibilityNativeRequest } from '../lib/canvas-v2/accessibility-native';
import { parseFilmInteraction } from '../lib/canvas-v2/interactive-film';
import { CANVAS_EXPLAINER_RENDER_TIMEOUT_MS, canvasExplainerDimensions, explainerSceneTime, parseExplainerBeats, parseExplainerPlayback, type CanvasExplainerChapter } from '../lib/canvas-v2/explainer';

const exec = promisify(execFile);
const framesPerSecond = 24;
let rendering = false;
async function command(file: string, args: string[], signal: AbortSignal, cwd: string) {
  return exec(file, args, { cwd, signal, timeout: 30_000, maxBuffer: 128_000, encoding: 'utf8' });
}

export async function renderCanvasExplainer(value: unknown, requestSignal: AbortSignal) {
  const raw = value as Record<string, unknown>;
  const input = validateAccessibilityNativeRequest({ ...raw, assets: undefined, steps: [{ action: 'checkpoint' }] });
  const sourceSha256 = createHash('sha256').update(encodeCanvasV2Screen(input.screen)).digest('hex');
  if (input.sourceSha256 !== sourceSha256) throw Error('Render the exact saved scene.');
  if (input.screen.width > 1280 || input.screen.height > 960) throw Error('Use a scene at most 1280 × 960 for film export.');
  const ids = canvasV2ScreenBoundAssets(input.screen);
  const assets = raw.assets as Record<string, string> | undefined;
  if (ids.some(id => {
    const source = assets?.[id];
    return typeof source !== 'string' || !(/^data:(?:image\/(?:png|jpeg|gif|webp)|font\/(?:ttf|otf|woff2?));base64,[A-Za-z0-9+/=]+$/.test(source)
      || /^data:model\/gltf-binary;base64,/.test(source) && isCanvasV2ScreenModelBytes(source));
  }) || JSON.stringify(assets ?? {}).length > 8_000_000) throw Error('Retain every image, font and model before rendering.');
  const beats = parseExplainerBeats(raw.beats);
  const interaction = raw.interaction === undefined ? undefined : parseFilmInteraction(raw.interaction, beats.length);
  const narrator = process.env.NORTHSTAR_NARRATION_ADAPTER;
  if (narrator && !isAbsolute(narrator)) throw Error('The narration adapter needs an absolute path.');
  const kokoroPython = process.env.NORTHSTAR_KOKORO_PYTHON;
  const kokoroModel = process.env.NORTHSTAR_KOKORO_MODEL_DIR;
  const useKokoro = !narrator && !!(kokoroPython || kokoroModel);
  if (useKokoro && (!isAbsolute(kokoroPython ?? '') || !isAbsolute(kokoroModel ?? ''))) {
    throw Error('Configure absolute paths to both Kokoro Python and the model directory.');
  }
  if (useKokoro && input.screen.language && !/^en(?:-|$)/i.test(input.screen.language)) {
    throw Error('The configured Kokoro profile supports English narration.');
  }
  if (!narrator && !useKokoro && process.platform !== 'darwin') throw Error('This worker needs a configured narration adapter.');
  const voice = narrator ? 'Configured narration adapter' : useKokoro ? 'Kokoro Heart' : 'macOS system voice';
  if (rendering) throw Error('A film is already rendering on this worker.');

  requestSignal.throwIfAborted();
  rendering = true;
  let browser: Browser | undefined;
  let cwd: string | undefined;
  const deadline = AbortSignal.timeout(CANVAS_EXPLAINER_RENDER_TIMEOUT_MS);
  const signal = AbortSignal.any([requestSignal, deadline]);
  let captured = 0;
  let totalFrames = 0;
  let stage = "synthesizing narration";
  const close = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', close, { once: true });
  try {
    cwd = await mkdtemp(join(tmpdir(), 'northstar-film-'));
    const ffmpeg = process.env.NORTHSTAR_FFMPEG ?? 'ffmpeg';
    const ffprobe = process.env.NORTHSTAR_FFPROBE ?? 'ffprobe';
    const audioFiles: string[] = [];
    const chapters: CanvasExplainerChapter[] = [];
    let duration = 0;
    for (const [index, beat] of beats.entries()) {
      const script = join(cwd, `beat-${index}.txt`);
      const speech = join(cwd, `speech-${index}.${narrator || useKokoro ? 'wav' : 'aiff'}`);
      const wave = join(cwd, `beat-${index}.wav`);
      await writeFile(script, beat.narration);
      try {
        if (narrator) await command(narrator, [script, speech], signal, cwd);
        else if (useKokoro) await command(kokoroPython!, ['-I', fileURLToPath(new URL('./kokoro-narration.py', import.meta.url)), kokoroModel!, script, speech], signal, cwd);
        else await command('/usr/bin/say', ['-r', '155', '-o', speech, '-f', script], signal, cwd);
      } catch {
        signal.throwIfAborted();
        throw Error('Narration could not be produced by the configured local voice.');
      }
      const length = Number((await command(ffprobe, ['-v','error','-show_entries','format=duration','-of','csv=p=0',speech], signal, cwd)).stdout.trim());
      const speechEnd = duration + length;
      const end = Math.ceil((speechEnd + .6) * framesPerSecond) / framesPerSecond;
      if (!Number.isFinite(length) || length <= 0 || end > 60) throw Error('Keep the narrated cut under one minute.');
      const measured = await command(ffmpeg, ['-nostdin','-nostats','-i',speech,'-af','volumedetect','-f','null','-'], signal, cwd);
      const peak = Number(measured.stderr.match(/max_volume: (-?[0-9.]+) dB/)?.[1]);
      if (!Number.isFinite(peak) || peak <= -60) throw Error(`The narrator returned no audible signal for “${beat.title}”.`);
      await command(ffmpeg, ['-nostdin','-v','error','-y','-i',speech,'-af','apad','-t',String(end-duration),'-ar','48000','-ac','1',wave], signal, cwd);
      audioFiles.push(wave);
      chapters.push({ ...beat, start: duration, speechEnd, end });
      duration = end;
    }
    await writeFile(join(cwd,'audio.txt'), audioFiles.map(path => `file '${path.split('/').at(-1)}'`).join('\n'));
    await command(ffmpeg, ['-nostdin','-v','error','-y','-f','concat','-safe','1','-i','audio.txt','-c','copy','narration.wav'], signal, cwd);
    stage = "preparing the scene";
    const width = input.screen.width, height = input.screen.height;
    const { pixelRatio, ...dimension } = canvasExplainerDimensions(width, height);
    const env = Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG','FONTCONFIG_PATH','PLAYWRIGHT_BROWSERS_PATH']
      .flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
    const chrome = process.env.NORTHSTAR_FILM_CHROMIUM;
    if (chrome && !isAbsolute(chrome)) throw Error('The film browser needs an absolute path.');
    const chromiumEnabled = Boolean(chrome) || process.env.NORTHSTAR_FILM_BROWSER === 'chromium';
    browser = chromiumEnabled ? await chromium.launch({ executablePath: chrome, headless: true, env, timeout: 20_000,
      ...(process.platform === 'linux' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}),
    })
      : await firefox.launch({ headless: true, env, timeout: 20_000, firefoxUserPrefs: { 'media.peerconnection.enabled': false, 'network.dns.disablePrefetch': true, 'network.prefetch-next': false } });
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: pixelRatio, serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    const source = buildCanvasV2ScreenRuntime(input.screen, new Map(ids.map(id => [id, assets![id]])), randomUUID(), undefined, input.fontCss, undefined, undefined, true, pixelRatio);
    await page.setContent('<body style="margin:0;overflow:hidden"><iframe title="Film scene" sandbox="allow-scripts" style="display:block;width:100vw;height:100vh;border:0"></iframe></body>');
    const iframe = page.locator('iframe');
    await iframe.evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, source);
    const frame = await (await iframe.elementHandle())?.contentFrame();
    if (!frame) throw Error('The private film scene did not open.');
    await frame.waitForFunction(() => document.readyState === 'complete' && location.href === 'about:srcdoc' &&
      !!(window as unknown as {northstarTimeline?:{getState():{duration?:number}}}).northstarTimeline?.getState().duration, undefined, { timeout: 12_000 })
      .catch(() => { throw Error('The scene did not register a working timeline.'); });
    const state = await frame.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
      const timeline = (window as unknown as { northstarTimeline?: { getState: () => { duration?: number; error: string; directCanvasExport?: boolean } } }).northstarTimeline;
      return timeline?.getState();
    });
    if (!state?.duration || state.error || pageErrors.length || beats.some(beat => beat.to > state.duration!)) throw Error('Register a working Northstar timeline and keep the beat ranges inside it.');
    const seek = async (time: number) => frame.evaluate(seconds => {
      const timeline = (window as unknown as { northstarTimeline: { seek(seconds: number): void } }).northstarTimeline;
      timeline.seek(seconds);
    }, time);
    // This page is private, has a fixed viewport and already awaited its fonts.
    // Avoid Playwright's all-frame caret/style setup and teardown for each JPEG.
    const clip = { x: 0, y: 0, width: dimension.width / pixelRatio, height: dimension.height / pixelRatio };
    const cdp = chromiumEnabled && !state.directCanvasExport ? await context.newCDPSession(page) : undefined;
    const shot = async () => {
      if (!cdp) return page.screenshot({ type:'jpeg', quality:94, timeout:6_000, clip });
      const result = await cdp.send('Page.captureScreenshot', { format:'jpeg', quality:94, clip:{...clip, scale:pixelRatio},
        fromSurface:true, captureBeyondViewport:false, optimizeForSpeed:true });
      return Buffer.from(result.data, 'base64');
    };
    const capture = async <T>(draw: () => Promise<T>, timeoutMs: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(`Timed out while ${stage} after ${captured} frames.`)), timeoutMs);
      });
      try {
        const result = await Promise.race([draw(), limit]);
        if (pageErrors.length) throw Error('The scene raised a runtime error during film playback.');
        return result;
      } finally { clearTimeout(timer); }
    };
    const captureFrame = (time: number) => capture(async () => {
      stage = 'seeking the authored timeline';
      await seek(time);
      stage = 'capturing the browser frame';
      return shot();
    }, 12_000);
    const directFrames = (times: number[]) => capture(async () => {
      stage = 'reading the painted Canvas2D frames';
      const pictures = await frame.evaluate(({times,width,height}) => {
        const timeline = (window as unknown as {northstarTimeline: {captureFrame(seconds: number, width: number, height: number): string}}).northstarTimeline;
        return times.map(time => timeline.captureFrame(time, width, height));
      }, {times, ...dimension});
      const prefix = 'data:image/jpeg;base64,';
      return pictures.map(picture => {
        if (!picture.startsWith(prefix)) throw Error('The export canvas did not return a valid painted JPEG.');
        return Buffer.from(picture.slice(prefix.length), 'base64');
      });
    }, 25_000);
    totalFrames = Math.round(duration * framesPerSecond);
    const times = Array.from({length:totalFrames}, (_, index) => explainerSceneTime(chapters, index / framesPerSecond));
    let frameKeys: readonly (string|number)[] = times;
    if (state.directCanvasExport) {
      stage = 'determining complete film frame states';
      frameKeys = await capture(() => frame.evaluate(seconds => {
        const timeline = (window as unknown as {northstarTimeline: {exportFrameKeys(times: number[]): string[]}}).northstarTimeline;
        return timeline.exportFrameKeys(seconds);
      }, times), 12_000);
    }
    // Match the UKIO quality preset while keeping long/high-motion cuts inside
    // the portable Canvas object's existing five-megabyte video budget.
    const videoKbps = Math.min(1950, Math.floor(4_600_000 * 8 / duration / 1000) - 96);
    const spatial = input.screen.trustedRuntimeLibraries?.some(library => library.startsWith('three'));
    const child = spawn(ffmpeg, ['-nostdin','-v','error','-y','-threads','1','-f','image2pipe','-framerate',String(framesPerSecond),
      '-vcodec','mjpeg','-i','pipe:0','-i','narration.wav','-t',String(duration),'-c:v','libx264','-threads','2','-preset','fast',
      '-crf',spatial?'18':'19','-maxrate',`${videoKbps}k`,'-bufsize',`${Math.round(videoKbps * 1.25)}k`,'-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','96k','-af','loudnorm=I=-16:TP=-1.8:LRA=10','-ar','48000','-movflags','+faststart','film.mp4'],
      { cwd, signal, stdio: ['pipe', 'ignore', 'ignore'] });
    const complete = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(Error('The video encoder did not finish.')));
    });
    child.stdin.on('error', () => {});
    void complete.catch(() => {});
    const data = (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
    const checkAt = new Map(chapters.map(chapter => [
      Math.round((chapter.start + chapter.speechEnd) / 2 * framesPerSecond), chapter.title,
    ]));
    const reviewFrames: { beat: string; seconds: number; image: string }[] = [];
    let first: Buffer | undefined;
    let last: Buffer | undefined;
    let queuedFrames: Buffer[] = [];
    try {
      for (let index = 0; index < totalFrames; index++) {
        signal.throwIfAborted();
        let pixels: Buffer;
        if (last && frameKeys[index] === frameKeys[index - 1]) pixels = last;
        else if (state.directCanvasExport) {
          if (!queuedFrames.length) {
            const batch = times.slice(index, index + 8).filter((_, position) =>
              position === 0 || frameKeys[index + position] !== frameKeys[index + position - 1]);
            queuedFrames = await directFrames(batch);
          }
          pixels = queuedFrames.shift()!;
        } else pixels = await captureFrame(times[index]);
        const beat = checkAt.get(index);
        if (beat) reviewFrames.push({ beat, seconds: index / framesPerSecond, image: data(pixels) });
        first ??= pixels;
        last = pixels;
        stage = 'feeding frames to the video encoder';
        await Promise.race([complete.then(() => { throw Error('The encoder stopped receiving frames.'); }), new Promise<void>((resolve, reject) => child.stdin.write(pixels, error => error ? reject(error) : resolve()))]);
        captured++;
      }
      stage = 'finishing the video encode';
      child.stdin.end();
      await complete;
    } catch (error) {
      child.kill();
      await complete.catch(() => {});
      throw error;
    }
    const film = join(cwd, 'film.mp4');
    if ((await stat(film)).size > 5_000_000) throw Error('The video is too large for the canvas. Shorten the scene.');
    const verdict = JSON.parse((await command(ffprobe, ['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',film], signal, cwd)).stdout);
    if (!verdict.streams?.some((stream: {codec_type:string}) => stream.codec_type === 'audio') ||
        !verdict.streams?.some((stream: {codec_type:string;width?:number;height?:number}) => stream.codec_type === 'video' && stream.width === dimension.width && stream.height === dimension.height) ||
        Math.abs(Number(verdict.format?.duration) - duration) > .15 || !first || !last) throw Error('The encoded video or narration did not verify.');
    // Reject empty renders even when the browser registered a working clock.
    // Sample actual decoded pixels at the beat midpoints, not the DOM.
    for (const frame of reviewFrames) {
      const path = join(cwd, 'review.jpg');
      await writeFile(path, Buffer.from(frame.image.split(',')[1], 'base64'));
      const signalStats = await command(ffmpeg, ['-nostdin','-nostats','-i',path,'-vf','scale=96:54,signalstats,metadata=print',
        '-frames:v','1','-f','null','-'], signal, cwd);
      const lo = Number(signalStats.stderr.match(/lavfi.signalstats.YMIN=(\d+)/)?.[1]);
      const hi = Number(signalStats.stderr.match(/lavfi.signalstats.YMAX=(\d+)/)?.[1]);
      if (!(hi - lo > 10)) throw Error(`The middle of “${frame.beat}” rendered blank. Keep a visible subject in each part of the lesson.`);
    }
    const bytes = await readFile(film);
    const sourceRevision = createHash('sha256').update(bytes).digest('hex');
    const playback = parseExplainerPlayback({ duration, poster: data(first), chapters,
      ...(interaction ? { interaction: { ...interaction, sourceRevision, frame: [dimension.width, dimension.height], fps: framesPerSecond } } : {}),
    });
    return { kind: 'northstar-narrated-explainer' as const, sourceSha256, ...playback, ...dimension,
      video: 'data:video/mp4;base64,' + bytes.toString('base64'),
      voice, endFrame: data(last), reviewFrames };
  } catch (error) {
    if (deadline.aborted && !requestSignal.aborted) {
      const progress = totalFrames ? ` Captured ${captured} of ${totalFrames} frames.` : '';
      throw Error(`The film exceeded the hosted render time limit while ${stage}.${progress}`, { cause: error });
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', close);
    await browser?.close().catch(() => {});
    if (cwd) await rm(cwd, { recursive: true, force: true });
    rendering = false;
  }
}
