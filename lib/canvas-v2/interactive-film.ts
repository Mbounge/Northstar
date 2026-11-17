import type { CanvasExplainerChapter } from './explainer';

export type FilmCrop = [number, number, number, number];
export interface FilmView { id: string; label: string; rect: FilmCrop; }
export interface FilmChoice { label: string; beat: number; }
export interface FilmBranch {
  afterBeat: number;
  prompt: string;
  choices: FilmChoice[];
  rejoinBeat: number;
}
export interface FilmInteraction { views: FilmView[]; branches: FilmBranch[]; }
export interface InteractiveFilm extends FilmInteraction {
  sourceRevision: string;
  frame: [number, number];
  fps: number;
}

const isLabel = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isIndex = (value: number, beats: number) => Number.isInteger(value) && value >= 1 && value <= beats;

export function parseFilmInteraction(raw: unknown, beatCount: number): FilmInteraction {
  const input = raw as Partial<FilmInteraction> | undefined;
  const views = input?.views ?? [];
  const branches = input?.branches ?? [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(views) || !Array.isArray(branches) ||
      views.length > 4 || views.length === 1 || branches.length > 3 || (!views.length && !branches.length)) {
    throw Error('Use two to four synchronized views or up to three branching points.');
  }

  if (views.some(view => {
    if (!view || typeof view.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(view.id) ||
        !isLabel(view.label, 48) || !Array.isArray(view.rect) || view.rect.length !== 4) return true;
    const [x, y, width, height] = view.rect;
    return view.rect.some(value => !Number.isFinite(value) || value < 0 || value > 1)
      || width < .05 || height < .05 || x + width > 1.000001 || y + height > 1.000001;
  }) || new Set(views.map(view => view.id)).size !== views.length ||
      new Set(views.map(view => view.label.trim())).size !== views.length) {
    throw Error('Give each view a distinct label, ID and a crop inside the encoded frame.');
  }
  if (views.some(({ rect }) => Math.abs(rect[2] / rect[3] / (views[0].rect[2] / views[0].rect[3]) - 1) > .005)) {
    throw Error('Synchronized views need matching aspect ratios.');
  }
  const valid = branches.every(branch => {
    if (!branch || !isLabel(branch.prompt, 220) || !isIndex(branch.afterBeat, beatCount) ||
        !isIndex(branch.rejoinBeat, beatCount) || !Array.isArray(branch.choices) ||
        branch.choices.length < 2 || branch.choices.length !== branch.rejoinBeat - branch.afterBeat - 1) return false;
    return branch.choices.every(choice => choice && isLabel(choice.label, 80) &&
      Number.isInteger(choice.beat) && choice.beat > branch.afterBeat && choice.beat < branch.rejoinBeat) &&
      new Set(branch.choices.map(choice => choice.beat)).size === branch.choices.length &&
      new Set(branch.choices.map(choice => choice.label.trim())).size === branch.choices.length;
  });
  if (branches.some(branch => !isLabel(branch?.prompt, 220))) {
    throw Error('Put the viewer question in interaction.branches[].prompt, up to 220 characters.');
  }
  if (!valid) throw Error(`Place each choice on a consecutive beat between the question and the shared ending. This cut has ${beatCount} beat(s). Example for 4 beats: {afterBeat:1,prompt:"Which route?",choices:[{label:"First route",beat:2},{label:"Second route",beat:3}],rejoinBeat:4}.`);
  const sorted = [...branches].sort((a, b) => a.afterBeat - b.afterBeat);
  if (sorted.some((branch, index) => index > 0 && branch.afterBeat < sorted[index - 1].rejoinBeat)) {
    throw Error('Complete each set of choices before the next branching point.');
  }
  return {
    views: views.map(view => ({ id: view.id, label: view.label.trim(), rect: [...view.rect] })),
    branches: sorted.map(branch => ({
      afterBeat: branch.afterBeat, prompt: branch.prompt.trim(), rejoinBeat: branch.rejoinBeat,
      choices: branch.choices.map(choice => ({ label: choice.label.trim(), beat: choice.beat })),
    })),
  };
}

export function parseInteractiveFilm(raw: unknown, beatCount: number): InteractiveFilm {
  const input = raw as InteractiveFilm;
  if (!input || typeof input.sourceRevision !== 'string' || !/^[0-9a-f]{64}$/.test(input.sourceRevision) ||
      !Array.isArray(input.frame) || input.frame.length !== 2 ||
      input.frame.some(size => !Number.isInteger(size) || size < 96 || size > 1280) ||
      !Number.isInteger(input.fps) || input.fps < 1 || input.fps > 120) throw Error('Invalid interactive film record.');
  return { ...parseFilmInteraction(input, beatCount), sourceRevision: input.sourceRevision, frame: [...input.frame], fps: input.fps };
}

/** All times come from the measured cut, including any silence added by the renderer. */
export function filmPlaybackBranches(interaction: InteractiveFilm, chapters: CanvasExplainerChapter[]) {
  return interaction.branches.map(branch => ({
    ...branch,
    holdAt: chapters[branch.afterBeat - 1].end - 1 / interaction.fps,
    rejoinAt: chapters[branch.rejoinBeat - 1].start,
    choices: branch.choices.map(choice => ({
      ...choice, from: chapters[choice.beat - 1].start, until: chapters[choice.beat - 1].end,
    })),
  }));
}

const shortText = (maxLength: number) => ({ type: 'string', maxLength });
const beat = { type: 'integer', minimum: 1, maximum: 6 };
export const FILM_INTERACTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    views: { type: 'array', maxItems: 4, items: {
      type: 'object', additionalProperties: false, required: ['id', 'label', 'rect'],
      properties: { id: shortText(48), label: shortText(48), rect: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 1 } } },
    } },
    branches: { type: 'array', maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: ['afterBeat', 'prompt', 'choices', 'rejoinBeat'],
      properties: { afterBeat: beat, prompt: shortText(220), rejoinBeat: beat, choices: { type: 'array', minItems: 2, maxItems: 4, items: {
        type: 'object', additionalProperties: false, required: ['label', 'beat'],
        properties: { label: shortText(80), beat },
      } } },
    } },
  },
} as const;
