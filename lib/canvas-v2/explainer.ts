import { FILM_INTERACTION_SCHEMA, parseInteractiveFilm, type InteractiveFilm } from './interactive-film';

export const CANVAS_EXPLAINER_RENDER_TIMEOUT_MS = 295_000;
export const CANVAS_EXPLAINER_REQUEST_TIMEOUT_MS = CANVAS_EXPLAINER_RENDER_TIMEOUT_MS + 10_000;

export interface CanvasExplainerBeat {
  title: string;
  narration: string;
  description: string;
  from: number;
  to: number;
}
export interface CanvasExplainerChapter extends CanvasExplainerBeat {
  start: number;
  speechEnd: number;
  end: number;
}
export interface CanvasExplainerPlayback {
  duration: number;
  poster: string;
  chapters: CanvasExplainerChapter[];
  interaction?: InteractiveFilm;
}
export interface CanvasExplainerRender extends CanvasExplainerPlayback {
  kind: 'northstar-narrated-explainer';
  sourceSha256: string;
  voice: string;
  video: string;
  width: number;
  height: number;
  endFrame: string;
  reviewFrames: { beat: string; seconds: number; image: string }[];
}
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);

export function parseExplainerBeats(raw: unknown): CanvasExplainerBeat[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) throw Error('Provide one to six teaching beats.');
  return raw.map(beat => {
    if (!beat || !boundedText(beat.title, 90) || !boundedText(beat.narration, 320) || !boundedText(beat.description, 440)
      || !Number.isFinite(beat.from) || !Number.isFinite(beat.to) || beat.from < 0 || beat.to > 90 || beat.to < beat.from) {
      throw Error('Each beat needs a title, narration, visual description and a valid scene time range in seconds.');
    }
    const { title, narration, description, from, to } = beat;
    return { title: title.trim(), narration: narration.trim(), description: description.trim(), from, to };
  });
}

export function isCanvasExplainerFrame(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 400_000 &&
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function parseExplainerPlayback(raw: unknown): CanvasExplainerPlayback {
  const input = raw as CanvasExplainerPlayback;
  if (!input || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 90 ||
    !isCanvasExplainerFrame(input.poster)) throw Error('Invalid narrated video preview.');
  const beats = parseExplainerBeats(input.chapters);
  let previous = 0;
  const chapters = beats.map((beat, index) => {
    const { start, speechEnd, end } = input.chapters[index];
    if (![start, speechEnd, end].every(Number.isFinite) || Math.abs(start - previous) > .002 ||
      start < 0 || speechEnd <= start || end < speechEnd || end > input.duration + .002) throw Error('Narrated video timings do not match the chapters.');
    previous = end;
    return { ...beat, start, speechEnd, end };
  });
  if (Math.abs(previous - input.duration) > .1) throw Error('Narrated video timings do not cover the full film.');
  const interaction = input.interaction === undefined ? undefined : parseInteractiveFilm(input.interaction, chapters.length);
  return { duration: input.duration, poster: input.poster, chapters, ...(interaction ? { interaction } : {}) };
}

/** Caption windows follow measured speech per beat. Word-level timing inside
 * each beat is estimated; captions should be reviewed against playback. */
export function explainerWebVtt(chapters: CanvasExplainerChapter[]) {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `00:${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const cues = chapters.flatMap(chapter => {
    const chunks: string[][] = [];
    for (const word of chapter.narration.split(/\s+/)) {
      const current = chunks.at(-1);
      if (!current || current.join(' ').length + word.length > 71) chunks.push([word]);
      else current.push(word);
    }
    const total = chunks.reduce((sum, words) => sum + words.length, 0);
    let elapsed = 0;
    return chunks.map(words => {
      const at = () => chapter.start + (chapter.speechEnd - chapter.start) * elapsed / total;
      const start = at();
      elapsed += words.length;
      return `${stamp(start)} --> ${stamp(at())}\n${escape(words.join(' '))}`;
    });
  });
  return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
}

export function canvasExplainerDimensions(width: number, height: number) {
  const pixelRatio = width <= 960 && height <= 540 ? 2 : 1;
  return { width: (width - width % 2) * pixelRatio, height: (height - height % 2) * pixelRatio, pixelRatio };
}

export function explainerSceneTime(chapters: CanvasExplainerChapter[], seconds: number) {
  const chapter = chapters.find(item => seconds < item.end) ?? chapters.at(-1)!;
  const progress = Math.max(0, Math.min(1, (seconds - chapter.start) / (chapter.speechEnd - chapter.start)));
  return chapter.from + (chapter.to - chapter.from) * progress;
}

const text = { type: 'string' };
export const CANVAS_EXPLAINER_TOOL = {
  type: 'function',
  name: 'canvas_render_explainer',
  description: 'Render and place a narrated, captioned video beside an authored Canvas scene. First compose and review the scene, then canvas_read(nodeId). Its HTML needs a data-northstar-timeline container and JS must register northstarTimeline.register({duration, render(seconds), loop, autoplay}). Draw from time without independent timers so the live and rendered versions match. Use an empty timeline slot for built-in controls. For custom controls, tag their container data-northstar-timeline-controls to hide it during export. For each teaching beat supply its title, spoken text, a separate description of the essential visual action for the transcript, and the scene time range in seconds. Equal times hold a still. Use a concise script. The finished object retains captions, descriptive transcript and chapter seeking. For synchronized views, author tiles in the same exact frame and supply normalized rectangles [left, top, width, height]. Each view must have the same aspect ratio and show the same scene time. For choice-driven playback, give the question its own beat, then one consecutive beat per alternative and a shared rejoin beat. Interaction beat numbers start at 1. For a four-beat cut, use {afterBeat:1,prompt:"Which route?",choices:[{label:"First route",beat:2},{label:"Second route",beat:3}],rejoinBeat:4}. The player pauses before the alternatives and plays the chosen beat before jumping to the rejoin. Keep essential labels inside both tiles. Before export, review exact opening, transition and ending frames of the authored scene. Check that each tile makes sense on its own, the learner can follow the action without sound, and the subject and labels stay fully visible. Review the encoded cut and both paths with sound and captions before declaring it ready.',
  parameters: {
    type: 'object', additionalProperties: false, required: ['nodeId', 'title', 'beats'],
    properties: {
      nodeId: text, title: { ...text, maxLength: 140 }, interaction: FILM_INTERACTION_SCHEMA,
      beats: { type: 'array', minItems: 1, maxItems: 6, items: {
        type: 'object', additionalProperties: false, required: ['title', 'narration', 'description', 'from', 'to'],
        properties: {
          title: { ...text, maxLength: 90 }, narration: { ...text, maxLength: 320 }, description: { ...text, maxLength: 440 },
          from: { type: 'number', minimum: 0, maximum: 90 }, to: { type: 'number', minimum: 0, maximum: 90 },
        },
      } },
    },
  },
} as const;
