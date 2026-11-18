import {assert} from './studio-errors.mjs';
import {filmRenderInput,validateFilmScene} from './animated-film-renderer.mjs';

// Embedded in both rehearsal and the editable production export.
function choreographyRuntime() {
 const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
 const mix = (a, b, t) => a + (b - a) * t;
 const smooth = t => t * t * (3 - 2 * t);
 const ramp = (t, start, end) => smooth(clamp((t - start) / (end - start)));
 const point = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
 function pose(keys, time) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
   const [end, next] = keys[i];
   if (time <= end) {
    const [start, previous] = keys[i - 1];
    const t = ramp(time, start, end);
    return typeof next === 'number' ? mix(previous, next, t) : next.map((value, j) => mix(previous[j], value, t));
   }
  }
  return keys.at(-1)[1];
 }
 function arm(shoulder, grip, upper, lower, side = 1) {
  const dx = grip[0] - shoulder[0], dy = grip[1] - shoulder[1];
  const distance = Math.hypot(dx, dy);
  const d = clamp(distance, Math.abs(upper - lower) + .001, upper + lower - .001);
  const direction = distance > .001 ? [dx / distance, dy / distance] : [1, 0];
  const projection = (upper * upper - lower * lower + d * d) / (2 * d);
  const offset = side * Math.sqrt(Math.max(0, upper * upper - projection * projection));
  const elbow = [shoulder[0] + direction[0] * projection - direction[1] * offset,
   shoulder[1] + direction[1] * projection + direction[0] * offset];
  const hand = [shoulder[0] + direction[0] * d, shoulder[1] + direction[1] * d];
  return {elbow, hand, reachable: Math.abs(distance - d) < .002};
 }
 const sequence = (shots, draw) => frame => {
  shots[frame.beatIndex](frame);
  draw(frame);
 };
 function alignContact(subject, subjectAnchor, target, targetAnchor) {
  const contact = target.localToWorld(targetAnchor.clone());
  const current = subject.localToWorld(subjectAnchor.clone());
  if (subject.parent) {
   subject.parent.worldToLocal(contact);
   subject.parent.worldToLocal(current);
  }
  subject.position.add(contact.sub(current));
 }
 window.UKIOFilm = Object.freeze({clamp, mix, smooth, ramp, point, pose, arm, sequence, alignContact});
}

export const CONTINUE_FILM_SCENE = {type:'function',name:'continue_film_scene',
 description:'Open a saved production from an earlier turn in the same conversation so the same assets and choreography can be revised or finished. Use the turn ID from chat history.',
 inputSchema:{type:'object',properties:{turnId:{type:'string',minLength:1,maxLength:100}},required:['turnId'],additionalProperties:false}};

export const FILM_WORKBENCH_GUIDE = {type:'function',name:'read_film_workbench',
 description:'Read the production workflow and motion helpers, or request the editable modules of the active production. Inspect the active sources before repairing a particular shot, including after this request resumes from a timeout.',
 inputSchema:{type:'object',properties:{includeSources:{type:'boolean',description:'Return this request’s editable scene, plan and latest review rather than the workflow guide.'}},additionalProperties:false}};

const edit = {type:'object',additionalProperties:false,required:['id'],properties:{
 id:{type:'string',pattern:'^[a-z][a-z0-9-]{0,47}$',description:'Stable asset or sequence module ID.'},
 html:{type:'string',maxLength:600000},css:{type:'string',maxLength:80000},
 javascript:{type:'string',maxLength:80000},remove:{type:'boolean'}
}};
export const EDIT_FILM_SCENE = {type:'function',name:'edit_film_scene',
 description:'Build an editable film from separately authored scene modules in order. Upsert individual stage, asset, choreography or camera modules and retain the others. All modules share the same HTML document and script. The final entry assigns window.render.',
 inputSchema:{type:'object',additionalProperties:false,required:['edits'],properties:{
  engine:{type:'string',enum:['browser','three']},
  artworks:{anyOf:[filmRenderInput.properties.scene.anyOf[0].properties.artworks,{type:'null'}]},
  model:{anyOf:[filmRenderInput.properties.scene.anyOf[0].properties.model,{type:'null'}]},
  edits:{type:'array',minItems:1,maxItems:24,items:edit}
 }}};

export const filmWorkbenchGuide = {
 workflow:[
  'Plan the teaching sequence, then choose the look and build the setting and props before writing the main action. Use distinct addressable asset modules, even in a tightly integrated film.',
  'Give each prop one coordinate system, an anchor for contacts, and a visible state after use. Use the same model or symbol across shots. Stage interactions at their contact points, then add body motion, a readable pause and follow-through.',
  'Compose wide views and close views from the same set. Decide what the viewer should watch before placing text. Use light, palette and materials for depth. Keep the lower 15% clear of critical detail for player captions.',
  'For a film about an apparatus already in this book, bind its exact published model using edit_film_scene.model with blockId and sha256. Load it once with window.UKIOGLTF.parse() and await loading inside window.render. Keep the linked model while changing individual shot modules.',
  'Bind distinct original settings, close-ups and inserts through edit_film_scene.artworks. Number the src placeholders in the scene markup. Keep a recurring visual in one layer and reveal it where the cut needs it.',
  'Add modules with edit_film_scene. First build original assets in a few grouped modules. Then add choreography and a renderer. Revise only affected modules after looking at the images. Separate pose, prop and camera updates from the final draw. Call the renderer once per frame, after all updates. Do not layer wrappers that render the whole scene again.',
  'For browser motion graphics, draw the entire 1280×720 frame on one Canvas2D element and assign it to window.exportFilmCanvas. Include the background, lettering and all overlays in those pixels. DOM and Three.js scenes can still use browser capture. For an exact still hold, optionally assign window.filmFrameKey = ({beatIndex, progress, time}) => a string or number. Repeat a key only for identical complete pixels, and include the beat in hold keys.',
  'Use preview_film_shots with scene:{workbench:true}, beat and review:false for a quick motion strip of a difficult shot. Use the full rehearsal after all shots are staged. The final renderer accepts scene:{workbench:true} and uses the exact tested assembly.'
 ],
 runtime:'Use window.UKIOFilm. clamp(value, low=0, high=1), mix(a,b,t), smooth(t), ramp(t,start,end), point([x,y],[x,y],t), pose([[t,numberOrArray],...],time) for eased keyframes, arm([x,y], [gripX,gripY], upperLength, lowerLength, bendDirection=1) returns {elbow,hand,reachable} for two segment IK. In Three.js, set the rotations first, then alignContact(subject, subjectAnchor, target, targetAnchor) to translate the subject so the two local Vector3 anchor points meet, including within different transformed groups. Assign window.render = UKIOFilm.sequence([poseFirstShot, poseSecondShot, ...], drawScene) to update the selected shot and draw once. Keep each pose deterministic when seeking out of order. Browser stage 1280×720. Three.js is available via engine:three.'
};

export function updateFilmWorkbench(current, input) {
 assert(input && Array.isArray(input.edits) && input.edits.length >= 1 && input.edits.length <= 24, 'Supply one to 24 film module edits.');
 const engine = input.engine ?? current.engine;
 assert(['browser','three'].includes(engine), 'Choose the browser or Three.js film engine.');
 const modules = new Map(current.modules);
 for (const entry of input.edits) {
  assert(entry && typeof entry.id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(entry.id), 'Give each film module a stable ID.');
  if (entry.remove === true) {
   modules.delete(entry.id);
   continue;
  }
  const values = {};
  for (const [key, max] of [['html',600000],['css',80000],['javascript',80000]]) {
   if (entry[key] === undefined) continue;
   assert(typeof entry[key] === 'string' && entry[key].length <= max, 'Film module ' + key + ' must be bounded text.');
   values[key] = entry[key];
  }
  assert(Object.keys(values).length, 'Provide source or remove the film module.');
  modules.set(entry.id, {...modules.get(entry.id), ...values});
 }
 assert(modules.size <= 24, 'Use up to 24 film modules.');
 const lengths = {html:0,css:0,javascript:0};
 for (const module of modules.values()) {
  for (const key of Object.keys(lengths)) lengths[key] += (module[key]?.length ?? 0) + 1;
 }
 assert(lengths.html <= 600000 && lengths.css <= 80000 && lengths.javascript <= 76000, 'The combined film source exceeds the scene limit.');
 const model=input.model===null ? undefined : input.model ?? current.model;
 if(model)validateFilmScene({engine,model,html:'<canvas></canvas>',css:'',javascript:'window.render=()=>{};'});
 const artworks=input.artworks===null ? undefined : input.artworks ?? current.artworks;
 return {engine,modules,...(model?{model:structuredClone(model)}:{}),...(artworks?{artworks:structuredClone(artworks)}:{})};
}

/** @param {{engine:string, modules:Map<string,{html?:string,css?:string,javascript?:string}>,model?:any,artworks?:any}} workbench */
export function assembleFilmWorkbench({engine,modules,model,artworks}) {
 const html = [...modules.values()].map(module => module.html ?? '').join('\n');
 const css = [...modules.values()].map(module => module.css ?? '').join('\n');
 const javascript = '(' + choreographyRuntime.toString() + ')();\n' +
  [...modules.entries()].map(([name,module]) => '\n// Film module ' + name + '\n' + (module.javascript ?? '')).join('\n');
 return validateFilmScene({engine,html,css,javascript,...(model?{model}:{}),...(artworks?{artworks}:{})});
}
