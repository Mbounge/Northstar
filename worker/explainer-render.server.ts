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
import { explainerSceneTime, parseExplainerBeats, parseExplainerPlayback, type CanvasExplainerChapter } from '../lib/canvas-v2/explainer';

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
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(175_000)]);
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
    const width = input.screen.width, height = input.screen.height;
    const dimension = { width: width - width % 2, height: height - height % 2 };
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
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    const source = buildCanvasV2ScreenRuntime(input.screen, new Map(ids.map(id => [id, assets![id]])), randomUUID(), undefined, input.fontCss, undefined, undefined, true);
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
      const timeline = (window as unknown as { northstarTimeline?: { getState: () => { duration?: number; error: string } } }).northstarTimeline;
      return timeline?.getState();
    });
    if (!state?.duration || state.error || pageErrors.length || beats.some(beat => beat.to > state.duration!)) throw Error('Register a working Northstar timeline and keep the beat ranges inside it.');
    const seek = async (time: number) => frame.evaluate(seconds => {
      const timeline = (window as unknown as { northstarTimeline: { seek(seconds: number): void } }).northstarTimeline;
      timeline.seek(seconds);
    }, time);
    const shot = async () => page.screenshot({ type: 'jpeg', quality: 81, timeout: 6_000, clip: { x: 0, y: 0, ...dimension } });
    const child = spawn(ffmpeg, ['-nostdin','-v','error','-y','-threads','1','-f','image2pipe','-framerate',String(framesPerSecond),
      '-vcodec','mjpeg','-i','pipe:0','-i','narration.wav','-t',String(duration),'-c:v','libx264','-threads','2','-preset','fast',
      '-crf','21','-maxrate','500k','-bufsize','900k','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-movflags','+faststart','film.mp4'],
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
    try {
      for (let index = 0; index < Math.round(duration * framesPerSecond); index++) {
        signal.throwIfAborted();
        await seek(explainerSceneTime(chapters, index / framesPerSecond));
        if (pageErrors.length) throw Error('The scene raised a runtime error during film playback.');
        const pixels = await shot();
        const beat = checkAt.get(index);
        if (beat) reviewFrames.push({ beat, seconds: index / framesPerSecond, image: data(pixels) });
        first ??= pixels;
        last = pixels;
        await Promise.race([complete.then(() => { throw Error('The encoder stopped receiving frames.'); }), new Promise<void>((resolve, reject) => child.stdin.write(pixels, error => error ? reject(error) : resolve()))]);
      }
      child.stdin.end();
      await complete;
    } catch (error) {
      child.kill();
      await complete.catch(() => {});
      throw error;
    }
    const film = join(cwd, 'film.mp4');
    if ((await stat(film)).size > 5_000_000) throw Error('The video is too large for the canvas. Shorten the scene.');
    const verdict = JSON.parse((await command(ffprobe, ['-v','error','-show_entries','stream=codec_type:format=duration','-of','json',film], signal, cwd)).stdout);
    if (!verdict.streams?.some((stream: {codec_type:string}) => stream.codec_type === 'audio') ||
        !verdict.streams?.some((stream: {codec_type:string}) => stream.codec_type === 'video') ||
        Math.abs(Number(verdict.format?.duration) - duration) > .15 || !first || !last) throw Error('The encoded video or narration did not verify.');
    // Reject empty renders even when the browser registered a working clock.
    // Sample actual decoded pixels at the beat midpoints, not the DOM.
    let visible = false;
    for (const frame of reviewFrames) {
      const path = join(cwd, 'review.jpg');
      await writeFile(path, Buffer.from(frame.image.split(',')[1], 'base64'));
      const signalStats = await command(ffmpeg, ['-nostdin','-nostats','-i',path,'-vf','scale=96:54,signalstats,metadata=print',
        '-frames:v','1','-f','null','-'], signal, cwd);
      const lo = Number(signalStats.stderr.match(/lavfi.signalstats.YMIN=(\d+)/)?.[1]);
      const hi = Number(signalStats.stderr.match(/lavfi.signalstats.YMAX=(\d+)/)?.[1]);
      if (hi - lo > 10) { visible = true; break; }
    }
    if (!visible) throw Error('The rendered film is blank. Check that the artwork stays visible when the timeline controls are hidden.');
    const bytes = await readFile(film);
    const sourceRevision = createHash('sha256').update(bytes).digest('hex');
    const playback = parseExplainerPlayback({ duration, poster: data(first), chapters,
      ...(interaction ? { interaction: { ...interaction, sourceRevision, frame: [dimension.width, dimension.height], fps: framesPerSecond } } : {}),
    });
    return { kind: 'northstar-narrated-explainer' as const, sourceSha256, ...playback, ...dimension,
      video: 'data:video/mp4;base64,' + bytes.toString('base64'),
      voice, endFrame: data(last), reviewFrames };
  } finally {
    signal.removeEventListener('abort', close);
    await browser?.close().catch(() => {});
    if (cwd) await rm(cwd, { recursive: true, force: true });
    rendering = false;
  }
}
