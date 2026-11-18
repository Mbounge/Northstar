import {createHash} from 'node:crypto';
import {filmRenderInput,validateFilmScene} from './animated-film-renderer.mjs';
import {assert} from './studio-errors.mjs';

const MAX_INSPECTIONS_PER_BEAT=8, MAX_SEQUENCE_FRAMES=30;

export const FILM_SHOT_PLAN={type:'function',name:'plan_film_sequence',
 description:'Before building a custom scene, establish how every teaching beat will be staged and what assets need making. Use the professor’s words and the book as the brief. Use this again if the sequence needs a new production plan.',
 inputSchema:{type:'object',additionalProperties:false,required:['shotPlan','direction','reference'],properties:{
  direction:{type:'string',minLength:20,maxLength:1200,description:'Direct the script and the audiovisual sequence together. Start with a scene, observation, or question a learner can grasp. Name the worked reasoning and how the ending sets up practice when present. Choose the form from that job.'},
  reference:{type:'string',minLength:15,maxLength:1200,description:'Name a specific reference and a transferable directing decision you actually observed. Use original assets and staging.'},
  shotPlan:{type:'array',minItems:3,maxItems:8,description:'One entry per teaching beat in order.',
   items:{type:'object',additionalProperties:false,required:['learningJob','action','assets','staging'],properties:{
    learningJob:{type:'string',minLength:12,maxLength:450,description:'What a student should understand from this beat.'},
    action:{type:'string',minLength:12,maxLength:450,description:'What changes visibly, or what needs a deliberate still hold.'},
    assets:{type:'string',minLength:12,maxLength:450,description:'Direct the production design and effects: original setting, subjects, props or source evidence, intentional palette, coherent scale and assets that can move or change independently.'},
    staging:{type:'string',minLength:12,maxLength:450,description:'Describe shot scale, angle or point of view, lighting and focal detail, subject motion and the moment that motivates the next cut. For dialogue, plan the listener’s response or the shared evidence where it changes the meaning. Account for screen direction and eyelines when depicting speakers.'},
    inspectAt:{type:'array',minItems:2,maxItems:MAX_INSPECTIONS_PER_BEAT,items:{type:'number',minimum:0,maximum:1},description:'Optional ordered fractions of the spoken beat. Show preparation, each critical contact or reveal, and the result. Choose them from the actual choreography. Limit the whole sequence to 30 frames including endpoints.'},
    sound:{type:'string',minLength:12,maxLength:450,description:'Plan how this beat sounds: narrator or speaker, performance and intelligibility, meaningful pauses and any motivated room tone, effects or score. Match sound to the reveal and carry it across a cut when useful.'}
   }}
  }
 }}};

export const FILM_SHOT_TEST={type:'function',name:'preview_film_shots',
 description:'Rehearse the actual scene. Test the hardest action first with a single-beat prototype and get an independent visual opinion before committing to the full production. The whole sequence still needs a separate review.',
 inputSchema:{type:'object',additionalProperties:false,required:['scene'],properties:{
  scene:filmRenderInput.properties.scene,
  review:{type:'boolean',description:'Default true for the full sequence. False gives a quick seven-frame motion strip of one planned beat.'},
  beat:{type:'integer',minimum:0,maximum:7},
  prototype:{type:'boolean',description:'Review only the selected beat as a feasibility prototype. Use before completing the set or remaining scenes. Never grants full-film approval.'}
 }}};

export const sceneIdentity=scene=>{
 const {html,css,javascript,engine='browser',artwork,artworks,model}=validateFilmScene(scene);
 return createHash('sha256').update(JSON.stringify([html,css,javascript,engine,artwork?.requestId,artwork?.index,...(artworks?[artworks.map(({requestId,index})=>[requestId,index])]:[]),...(model?[model.requestId??null,model.blockId??null,model.sha256]:[])])).digest('hex');
};
export function filmShotPlan(input){
 const {shotPlan,direction,reference}=input||{};
 const valid=(x,min)=>typeof x==='string'&&x.trim().length>=min&&x.length<=1200;
 assert(valid(direction,20)&&valid(reference,15),'Give the production plan a teaching direction and a specific reference.');
 assert(Array.isArray(shotPlan)&&shotPlan.length>=3&&shotPlan.length<=8&&shotPlan.every(shot=>
  shot&&['learningJob','action','assets','staging'].every(key=>valid(shot[key],12)&&shot[key].length<=450)),
  'Plan every teaching beat in order. Each needs a learning job, visible action or purposeful hold, assets and staging.');
 for(const {inspectAt,sound} of shotPlan){
  if(sound!==undefined)assert(valid(sound,12)&&sound.length<=450,
   'Describe the spoken performance and any sound or intentional silence that carries this teaching beat.');
  if(inspectAt===undefined)continue;
  assert(Array.isArray(inspectAt)&&inspectAt.length>=2&&inspectAt.length<=MAX_INSPECTIONS_PER_BEAT&&inspectAt.every((time,index)=>
   Number.isFinite(time)&&time>=0&&time<=1&&(index===0||time>inspectAt[index-1])),
  'Use two to eight ordered rehearsal positions between the start and end of the spoken beat.');
 }
 assert(sequenceSamples(shotPlan).length<=MAX_SEQUENCE_FRAMES,
  `Choose up to ${MAX_SEQUENCE_FRAMES} rehearsal frames across the sequence, including both endpoints.`);
 return {shotPlan:structuredClone(shotPlan),direction,reference};
}
function sequenceSamples(shotPlan){
 const beatCount=shotPlan.length;
 return [{beat:0,progress:0},...shotPlan.flatMap(({inspectAt},beat)=>(inspectAt??[.25,.75])
  .filter(progress=>!(beat===0&&progress===0)&&!(beat===beatCount-1&&progress===1))
  .map(progress=>({beat,progress}))),{beat:beatCount-1,progress:1}];
}
export function shotTestInput(input,plan){
 assert(plan,'Use plan_film_sequence before building and rehearsing the film.');
 const {shotPlan,direction,reference}=plan;
 return {scene:validateFilmScene(input?.scene),beatCount:shotPlan.length,samples:sequenceSamples(shotPlan),shotPlan,direction,reference};
}

// This is a separate visual judgment. The author cannot substitute their
// intended motion, scene source or assertions for these rendered images.
export const FILM_SHOT_CRITIC_TASK=`You are the film's independent visual editor. Compare the actual ordered rehearsal frames against the production plan for every beat. In your findings identify what each beat visibly teaches, what evidence changes across its frames, and whether the framing, asset design, choreography, transitions and continuity serve the whole explanation. Reject generic slides, static book artwork with a sliding shape, pans over still artwork, label changes or effects passed off as the depicted action. Check whether the opening quickly orients the viewer, close views reveal evidence at the right moment, cuts change what the learner understands, and light and colour direct attention with coherent continuity. In a conversation, look for visibly distinct speaker and listener coverage or another deliberate representation that shows what changed because of the reply. Inspect eye direction, readable expression and any shared prop when present. Reject sequences that reproduce a transcript beside repetitive background art when the pictures have no teaching job. For real-world action, look for purpose-built independent subjects or documented moving footage, coherent scale, contacts, light and staging. A graph, equation or abstract story can teach through a meaningful transformation of its own; no arbitrary 3D, asset quota or cinematic style is required. A still is valid when it gives the viewer time to inspect evidence and earns its place in the sequence. Mark passed false when required teaching actions or production quality are unconvincing anywhere, and name the beats and concrete repairs. Do not claim continuous viewing or audio review.`;
export const FILM_PROTOTYPE_CRITIC_TASK=`Review this single prototype shot from its ordered frames. Does the chosen medium make the crucial action or reveal convincing and intelligible at reading size? For articulated figures, inspect grip, pose, silhouette, occlusion and release. For diagrams or abstractions, inspect whether the transformation actually exposes the mechanism. Focus on feasibility before finishing the other shots. State what is visible, which repair would prove the approach, or which faithful staging or medium would make it clearer. Do not judge the unseen film or claim continuous viewing.`;
