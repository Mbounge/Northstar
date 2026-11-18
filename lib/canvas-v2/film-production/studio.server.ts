import { createHash, randomUUID } from 'node:crypto';
import { FILM_SHOT_PLAN, FILM_SHOT_TEST, FILM_SHOT_CRITIC_TASK, FILM_PROTOTYPE_CRITIC_TASK,
  filmShotPlan, sceneIdentity, shotTestInput } from './film-production.mjs';
import { EDIT_FILM_SCENE, FILM_WORKBENCH_GUIDE, assembleFilmWorkbench, filmWorkbenchGuide, updateFilmWorkbench } from './film-workbench.mjs';
import { filmRenderInput } from './animated-film-renderer.mjs';
import { silentFilmLessonInput, validateAnimatedExplainerInput, validateSilentFilmLesson } from './film-narration.mjs';
import { CANVAS_BLENDER_TOOL } from '../blender-tool';
import { FILM_INTERACTION_SCHEMA, parseFilmInteraction } from '../interactive-film';
import { parseExplainerPlayback } from '../explainer';
import { object, string, type JsonObject } from '../managed-agent/protocol';
import type { NorthstarArtifact } from '../creative/types';
import type { DynamicToolCallResponse } from '../codex-app-server/generated/v2/DynamicToolCallResponse';
import type { DynamicToolSpec } from '../codex-app-server/generated/v2/DynamicToolSpec';
import type { filmRenderWorker } from '../../../worker/film-studio.server';

type Item = DynamicToolCallResponse['contentItems'][number];
export const PUBLISH_FILM = 'canvas_publish_film';
const BUILD_MODEL = 'build_film_model';
const RENDER = 'render_animated_film';
const FORMAT = 'read_film_workbench';
const EDIT = 'edit_film_scene';
const PLAN = 'plan_film_sequence';
const PREVIEW = 'preview_film_shots';
const TOOLS = [
  { ...FILM_WORKBENCH_GUIDE, description: FILM_WORKBENCH_GUIDE.description + ' The selected workbench stays private. Use reset only to start a different film.' ,
    inputSchema: { ...FILM_WORKBENCH_GUIDE.inputSchema, properties: { ...FILM_WORKBENCH_GUIDE.inputSchema.properties, reset: {type:'boolean'} } } },
  { ...EDIT_FILM_SCENE, description: EDIT_FILM_SCENE.description + ' Stage content off-canvas until publication. Bind a Blender receipt from build_film_model in model.requestId and model.sha256.' },
  FILM_SHOT_PLAN, FILM_SHOT_TEST,
  { type: 'function', name: BUILD_MODEL, description: 'Build original Blender geometry privately for this film. Pass the returned model receipt unchanged to edit_film_scene.',
    inputSchema: { ...CANVAS_BLENDER_TOOL.parameters, properties: { scene: CANVAS_BLENDER_TOOL.parameters.properties.scene } } },
  { type: 'function', name: RENDER, description: 'Render the exact approved workbench as a narrated or silent film. Silent films use lesson.audio="silent" and seconds for each beat. Reviews the encoded MP4 and retains the transcript, editable source, and captions when narrated. Use scene:{workbench:true}. Branches are optional and belong only in intentionally interactive films.',
    inputSchema: { ...filmRenderInput, properties: { lesson: { anyOf:[filmRenderInput.properties.lesson,silentFilmLessonInput] }, scene: { type:'object',additionalProperties:false,required:['workbench'],properties:{workbench:{type:'boolean',const:true}} },
      interaction: FILM_INTERACTION_SCHEMA } } },
  { type:'function', name:PUBLISH_FILM, description:'Place one final, approved native player on Canvas. First call canvas_read. Pass the exact publicationId from render_animated_film. A receipt places a single player. Supply replaceNodeId from canvas_read to update an existing native film in place when the user requests a revision.',
    inputSchema:{type:'object',additionalProperties:false,required:['publicationId'],properties:{publicationId:{type:'string'},replaceNodeId:{type:'string',maxLength:180}}} },
] as DynamicToolSpec[];

export const filmTools = TOOLS;
export const privateFilmTools = new Set(TOOLS.flatMap(tool => tool.type === 'function' && tool.name !== PUBLISH_FILM ? [tool.name] : []));
export const filmDirections = `
For a new original video, animation or motion piece requested as a finished video, use the UKIO film workbench. Start with read_film_workbench, plan_film_sequence, and build original modular assets and choreography using edit_film_scene. Target 1280×720 and direct the visuals, sound and pacing around the request. Start with the hardest shot as a prototype where appropriate. Use build_film_model for Blender geometry required by the film; it stays private. Use brief panoramic or close views only where they reveal something and keep the lower 15% clear for captions. Rehearse the whole private scene using preview_film_shots with scene:{workbench:true}. Address specific findings from the independent frame review before rendering. Render with the same approved workbench and review the actual encoded frames and measured timeline, then canvas_read and canvas_publish_film exactly once. Keep regular videos linear with no viewer questions, forced pauses, or branch controls. Include interaction only when the user asks for it. A still or illustration can earn a hold when it gives the viewer time to inspect something. Choose sound together with the film’s purpose. For explicit silent motion or when the visual sequence is self-explanatory, use lesson.audio="silent" and seconds per shot, include the essential on-screen content in every visual description, and give viewers time to read. Keep critical text clear of the native player controls, including the top-right transcript button. Keep site/video source, rough takes, model props and rehearsal frames off the board; the published cut is native. Use the legacy scene export only when the user specifically asks to export an existing live Canvas timeline. Do not simulate those tools with generic Canvas objects. Do not claim you heard or watched samples continuously.
`;

type RenderWorker = typeof filmRenderWorker;
export interface FilmVisualReview { passed: boolean; findings: { beat: number; observation: string; repair: string }[]; limitations: string }
export type FilmReviewer = (input: { task: string; context: object; images: Buffer[] }, signal: AbortSignal) => Promise<FilmVisualReview>;
type Workbench = Parameters<typeof assembleFilmWorkbench>[0];
type Plan = ReturnType<typeof filmShotPlan>;
const text = (value: unknown): Item => ({ type:'inputText', text:JSON.stringify(value) });
const frames = (images: Buffer[]): Item[] => images.map(image => ({ type:'inputImage',imageUrl:'data:image/jpeg;base64,'+image.toString('base64') }));
const emptyState = () => ({ engine:'browser', modules:new Map() });
export class CanvasFilmStudio {
  private workbench: Workbench = emptyState() as Workbench;
  private plan?: Plan;
  private reviewed?: string;
  private latestReview?: FilmVisualReview;
  private models = new Map<string, {sha256:string; bytes:Buffer; source:Buffer}>();
  private artwork = new Map<string, {mimeType:string; bytes:Buffer}>();
  private publication?: { id: string; bundle: object };
  private placed?: string;
  private busy = false;

  constructor(private readonly worker: RenderWorker) {}

  async call(name: string, input: unknown, review: FilmReviewer, progress: (message: string) => void, signal: AbortSignal): Promise<Item[]> {
    if (this.busy) throw Error('Wait for the current film operation to finish.');
    this.busy = true;
    try { return await this.execute(name, input, review, progress, signal); }
    finally { this.busy = false; }
  }

  retainArtwork(artifacts: NorthstarArtifact[]) {
    for (const artifact of artifacts) {
      if (this.artwork.has(artifact.id) || this.artwork.size >= 12 || artifact.bytes > 2_000_000 ||
          !/^data:image\/(?:png|jpeg|webp);base64,/.test(artifact.dataUrl)) continue;
      this.artwork.set(artifact.id, {mimeType:artifact.mimeType,bytes:Buffer.from(artifact.dataUrl.split(',')[1],'base64')});
    }
  }

  requirePublication(id: string) {
    if (this.busy || this.placed === id || !id || this.publication?.id !== id) throw Error('Use the exact current publication receipt once.');
    return this.publication.bundle;
  }

  recordPlacement(id: string) {
    if (this.publication?.id === id) {
      this.placed = id;
      this.publication = undefined;
    }
  }

  private invalidate() {
    this.reviewed = undefined;
    this.latestReview = undefined;
    this.publication = undefined;
  }

  private async execute(name: string, input: unknown, review: FilmReviewer, progress: (message: string) => void, signal: AbortSignal): Promise<Item[]> {
    signal.throwIfAborted();
    const args = object(input);
    if (name === FORMAT) {
      if (args.reset === true) {
        this.invalidate();
        this.plan = undefined;
        this.models.clear();
        this.workbench = emptyState() as Workbench;
      }
      return [text(args.includeSources ? {
        engine: this.workbench.engine, plan: this.plan, previousReview: this.latestReview,
        modules: [...this.workbench.modules].map(([id, source]: [string, object])=>({id, ...source})),
        ...(this.workbench.model ? { model: this.workbench.model } : {}),
        artworks:this.workbench.artworks,
      } : {
        ...filmWorkbenchGuide,
        canvas: 'Use build_film_model for Blender models. For original generated stills, use generate_image and bind artwork with {requestId:assetId,index:0} in edit_film_scene and numbered ukio-film-artwork image slots. Use original scene modules, physical materials and lighting, vector graphics, type and independently animated props as the shot requires. Call render_animated_film after the whole-sequence review, then canvas_publish_film. For a plain film omit interaction. An explicitly interactive film can use views [{id,label,rect:[left,top,width,height]}], or branches [{afterBeat,prompt,choices:[{label,beat}],rejoinBeat}]. Beat numbers begin at 1.',
      })];
    }
    if (name === PLAN) {
      this.plan = filmShotPlan(input);
      this.invalidate();
      return [text(this.plan)];
    }
    if (name === EDIT) {
      if (!this.plan) throw Error('Plan the sequence before authoring the scene.');
      if (Array.isArray(args.artworks)) args.artworks.forEach(receipt=>this.artworkBytes(receipt));
      if (args.model !== undefined && args.model !== null) this.modelBytes(args.model);
      this.workbench = updateFilmWorkbench(this.workbench, input);
      this.invalidate();
      return [text({ engine: this.workbench.engine, modules: [...this.workbench.modules.keys()] })];
    }
    if (name === BUILD_MODEL) {
      if (!this.plan) throw Error('Plan the sequence before building a film prop.');
      if (this.models.size >= 6) throw Error('This workbench has reached its six retained Blender builds.');
      progress('Building private Blender geometry for the film.');
      const model = await this.worker.model(args.scene, signal);
      signal.throwIfAborted();
      const requestId = randomUUID();
      const sha256 = createHash('sha256').update(model.bytes).digest('hex');
      this.models.set(requestId, { sha256, bytes: model.bytes, source:model.source });
      return [text({ title: model.title, model: { requestId, sha256 } })];
    }
    if (name !== PREVIEW && name !== RENDER) throw Error('Unknown film tool.');
    if (object(args.scene).workbench !== true || !this.plan) throw Error('Use the current planned private scene with scene:{workbench:true}.');
    const assembled = assembleFilmWorkbench(this.workbench);
    const inspection = shotTestInput({scene:assembled}, this.plan);
    const identity = sceneIdentity(assembled);
    const model = assembled.model ? this.modelBytes(assembled.model) : undefined;
    const artworkFiles: Record<string,Buffer> = {};
    let html = assembled.html, archiveHtml = assembled.html;
    for (const [index, receipt] of (assembled.artworks ?? []).entries()) {
      const art = this.artworkBytes(receipt);
      const file = `artwork-${index+1}.${art.mimeType.split('/')[1]}`;
      artworkFiles[file] = art.bytes;
      const slot = `src="ukio-film-artwork-${index+1}"`;
      html = html.replaceAll(slot,`src="data:${art.mimeType};base64,${art.bytes.toString('base64')}"`);
      archiveHtml = archiveHtml.replaceAll(slot,`src="${file}"`);
    }
    const scene = { ...assembled, html, archiveHtml, artworkFiles, ...(model && { modelBytes:model.bytes, modelSource:model.source }) };
    if (name === PREVIEW) {
      const prototype = args.prototype === true, quick = !prototype && args.review === false;
      const oneBeat = quick || prototype;
      const beat = Number(args.beat);
      if (oneBeat && (!Number.isInteger(beat) || beat < 0 || beat >= inspection.beatCount)) throw Error('Choose one planned beat for the prototype.');
      const samples = oneBeat ? [...new Set([0, .16, .33, .5, .67, .84, 1, ...inspection.shotPlan[beat].inspectAt ?? []])]
        .sort((a,b)=>a-b).map(progress => ({beat, progress})) : inspection.samples;
      if (!oneBeat) this.invalidate();
      progress(oneBeat ? 'Rehearsing the selected shot.' : 'Capturing early and late frames of every planned shot.');
      const images = await this.worker.sample(scene, samples, inspection.beatCount, oneBeat, signal);
      if (quick) return [text({samples}), ...frames(images)];
      progress('Reviewing the rendered shots against the film plan.');
      const verdict = await review({ task: prototype ? FILM_PROTOTYPE_CRITIC_TASK : FILM_SHOT_CRITIC_TASK,
        context: { direction: inspection.direction, reference: inspection.reference, shotPlan: inspection.shotPlan, samples },
        images }, signal);
      signal.throwIfAborted();
      this.latestReview = verdict;
      if (verdict.passed && !oneBeat) this.reviewed = identity;
      return [text({ samples, visualReview: verdict, approvedForRender: this.reviewed === identity }), ...frames(images)];
    }
    if (this.reviewed !== identity) throw Error('Rehearse and pass the whole-sequence review for the exact current scene before rendering.');
    this.publication = undefined;
    const silent = object(args.lesson).audio === 'silent';
    const lesson = silent ? validateSilentFilmLesson(args.lesson) : validateAnimatedExplainerInput(args.lesson);
    if (lesson.beats.length !== inspection.beatCount) throw Error('The approved rehearsal and final cut must have the same beat count.');
    const interaction = args.interaction === undefined ? undefined : parseFilmInteraction(args.interaction, lesson.beats.length);
    progress(silent ? 'Rendering the approved silent film.' : 'Rendering the approved shots with measured narration and captions.');
    const workbench = JSON.stringify({ plan:this.plan, engine:this.workbench.engine, modules:[...this.workbench.modules], model:this.workbench.model }, null, 2);
    const encoded = await this.worker.render(lesson, { ...scene, workbench }, inspection.samples, signal);
    const { output, images, seconds, peak } = encoded;
    const captions = output.artifacts.find(([name])=>name==='captions.vtt')?.[2].toString('utf8');
    if (silent !== (output.silent === true) || Boolean(captions) === silent) throw Error('The exported tracks do not match the approved sound treatment.');
    progress('Checking the encoded video and its teaching sequence.');
    const verdict = await review({ task: FILM_SHOT_CRITIC_TASK +
      ' These are decoded frames from the final MP4. Review the actual reveal timing and reading holds. Keep the upper-right transcript control and lower playback controls clear of important content.' +
      (silent ? ' This film is intentionally silent. All essential context and changes must be legible without sound.' : ' Read the caption cues and timing table for pacing and phrase breaks. Keep important action clear of the captions. Audio presence measured by the host is separate from listening.'),
      context: { shotPlan: inspection.shotPlan, direction: lesson.visualApproach, samples: inspection.samples.map((sample, index) => ({...sample, seconds:seconds[index]})),
        chapters: output.beats, captions, silent, audioPeakDb: peak }, images }, signal);
    signal.throwIfAborted();
    this.latestReview = verdict;
    if (!verdict.passed) return [text({visualReview:verdict, encoded:true, publishable:false}), ...frames(images)];
    const toData = ([,type,bytes]: [string,string,Buffer]) => `data:${type};base64,${bytes.toString('base64')}`;
    const chapters = output.beats.map(({start,speechEnd,end}, index) => ({
      start,speechEnd,end,from:start,to:speechEnd,title:lesson.beats[index].heading,narration:silent?"":lesson.beats[index].narration,description:lesson.beats[index].visual,
    }));
    const playback = parseExplainerPlayback({ duration:output.duration, chapters, poster:'data:image/jpeg;base64,'+images[0].toString('base64'), ...(silent ? { silent:true } : { captions }),
      ...(interaction ? { interaction:{...interaction,sourceRevision:identity,frame:[1280,720],fps:24} } : {}) });
    const id = randomUUID();
    const artifacts = output.artifacts.filter(([name])=>name!=='poster.png').map(file=>({name:file[0],mimeType:file[1],dataUrl:toData(file)}));
    this.publication = { id, bundle:{ id, title:lesson.title, playback, width:1280, height:720, artifacts, narration:output.narration, sourceSha256:identity,
      review:{visual:verdict, samples:inspection.samples.map((sample,index)=>({...sample,seconds:seconds[index]})), audioPeakDb:peak} } };
    return [text({publicationId:id, title:lesson.title, duration:output.duration, narration:output.narration, visualReview:verdict,
      samples:inspection.samples.map((sample,index)=>({...sample,seconds:seconds[index]}))}), ...frames(images)];
  }

  private modelBytes(value: unknown) {
    const model = object(value), receipt = this.models.get(string(model.requestId));
    if (!receipt || receipt.sha256 !== model.sha256) throw Error('Use the exact Blender model receipt retained by this workbench.');
    return receipt;
  }

  private artworkBytes(value: unknown) {
    const input = object(value), receipt = this.artwork.get(string(input.requestId));
    if (!receipt || input.index!==0) throw Error('Use a retained Canvas artwork asset ID with index 0.');
    return receipt;
  }
}
