import { spawn } from 'node:child_process';
import { assert } from './studio-errors.mjs';
const neuralVoices=[{"id":"af_heart"},{"id":"af_bella"},{"id":"af_nova"},{"id":"am_michael"},{"id":"am_liam"},{"id":"bm_daniel"}];
const defaultVoice=neuralVoices[0].id;
const defaultNarrationSpeed=.95;
const viewingTasks={
 continuation:{base:0,perItem:0},
 orientation:{base:1.5,perItem:.2},
 inspection:{base:1.7,perItem:.4},
 comparison:{base:2.4,perItem:.45},
 reflection:{base:4,perItem:.3}
};
function defaultViewing(beat){
 if(!beat.columns)return {task:'continuation',revealAt:0,items:0};
 const segments=beat.columns.reduce((count,column)=>count+(column.segments?.length??0),0);
 return {task:'comparison',revealAt:.75,items:Math.min(10,beat.columns.length+segments)};
}
export function beatHold(beat,speechSeconds){
 // A manual pause remains exact when there is no automatic viewing plan.
 // With a plan, a suggested pause can limit silence without adding time the
 // learner already had during narration.
 if(beat.pause!==undefined&&!beat.viewing)return beat.pause;
 const {task,revealAt=0,items=0}=beat.viewing??defaultViewing(beat);
 const {base,perItem}=viewingTasks[task];
 const readingTime=base+items*perItem;
 const timeAlreadyVisible=speechSeconds*(1-revealAt);
 const naturalHold=Math.max(.35,Math.min(6,readingTime-timeAlreadyVisible));
 return Math.round(Math.min(beat.pause??6,naturalHold)*100)/100;
}
const phrase = maxLength => ({type:'string', minLength:1, maxLength});
const fields = (properties, required = Object.keys(properties)) => ({type:'object', properties, required, additionalProperties:false});
const list = (items, minItems, maxItems) => ({type:'array',items,minItems,maxItems});
const reviewScene={type:'string',enum:['lesson']};
const reviewBeats={type:'string',enum:Array.from({length:8},(_,index)=>'step_0'+(index+1)),
  description:'Use the one-based narration beat ID. The first beat is step_01. Use only IDs for beats in this lesson.'};
const finding=fields({
  scene_id:reviewScene,beat_id:reviewBeats,
  kind:{type:'string',enum:['lost','wrong','minor'],description:'Use lost for a confusing beat, wrong for a factual error and minor for a smaller refinement.'},problem:phrase(700),
  resolution:fields({action:{type:'string',enum:['fixed','kept']},note:phrase(700)})
});
const audienceReview=list(fields({
  scene_ids:list(reviewScene,1,1),
  reviewer_summary:fields({question:phrase(240),takeaway:phrase(360),explained_terms:list(phrase(80),0,12),
    lost_beat_id:reviewBeats,most_engaging_beat_id:reviewBeats},['question','takeaway']),
  findings:list(finding,0,12)
}),1,3);
const color = {type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const fraction={type:'number',minimum:0,maximum:1};
const readingPause={type:'number',minimum:0,maximum:6,description:'Optional ceiling on the quiet hold when viewing is supplied. To honor a specifically requested pause, omit viewing and supply the exact seconds. Otherwise prefer automatic viewing timing.'};
const beatViewing={...fields({
 task:{type:'string',enum:Object.keys(viewingTasks),description:'The work the learner does with this beat. Use continuation for a familiar visual or narration that carries into the next line.'},
 revealAt:{...fraction,description:'Fraction of the spoken beat when the important visual evidence is first fully readable. Use 0 if it is already visible.'},
 items:{type:'number',minimum:0,maximum:10,description:'Count the labels, values or features the learner must actually read together.'}
},['task']),description:'The engine budgets inspection time from this description and measured narration. Describe the learner task and reveal point instead of prescribing a pause.'};
const segment=fields({fraction,label:phrase(15),tone:{type:'string',pattern:'^(primary|secondary|quiet)$'}});
const column=fields({focus:phrase(28),detail:phrase(72),segments:list(segment,1,4)}, ['focus','detail']);
const lessonFields = {
  title:phrase(62),label:phrase(65),question:phrase(104),audience:phrase(420),takeaway:phrase(180),
  sourceNotes:phrase(3000),review:phrase(2000),audienceReview,
  narration:fields({voice:{type:'string',enum:neuralVoices.map(voice=>voice.id)},
    speed:{type:'number',minimum:0.85,maximum:1.12}},[]),
  palette:fields({background:color,ink:color,muted:color,left:color,right:color}),
  columns:list(phrase(27),2,2),
  beats:list(fields({heading:phrase(62),narration:phrase(420),spokenText:phrase(500),footer:phrase(105),visual:phrase(500),viewing:beatViewing,pause:readingPause,headers:list(phrase(27),2,2),columns:list(column,2,2)},['heading','narration','footer','columns']),3,8)
};
export const explainerInput = fields(lessonFields,Object.keys(lessonFields).filter(key=>key!=='narration'));
const animatedLessonFields = {
  title:lessonFields.title, question:lessonFields.question, audience:lessonFields.audience,
  takeaway:lessonFields.takeaway, visualApproach:phrase(1400),audienceReview,
  sourceNotes:lessonFields.sourceNotes, review:lessonFields.review, narration:lessonFields.narration,
  beats:list(fields({heading:phrase(62),narration:phrase(420),visual:phrase(700),viewing:beatViewing,pause:readingPause,
   speaker:{...phrase(36),description:'Identify the character or narrator in the captions. The name is not spoken.'},
   voice:{...lessonFields.narration.properties.voice,description:'Optional local Kokoro voice for this speaker. Otherwise inherit the film voice.'}
  },['heading','narration','visual']),3,8)
};
export const animatedExplainerInput = fields(animatedLessonFields,
  Object.keys(animatedLessonFields).filter(key=>!['narration','audienceReview'].includes(key)));

function schemaIssue(value, schema, path) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return path + ' must be an object';
    for (const key of schema.required) if (!Object.hasOwn(value,key)) return path + '.' + key + ' is required';
    for (const [key,entry] of Object.entries(value)) {
      const child = path + '.' + key;
      if (!Object.hasOwn(schema.properties,key)) return child + ' is unsupported';
      const issue = schemaIssue(entry,schema.properties[key],child);
      if (issue) return issue;
    }
    return null;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems)
      return path + ' needs ' + schema.minItems + ' to ' + schema.maxItems + ' entries';
    for (const [index,entry] of value.entries()) {
      const issue = schemaIssue(entry,schema.items,path+'['+index+']');
      if (issue) return issue;
    }
    return null;
  }
  if (schema.type === 'number') return Number.isFinite(value) && value >= schema.minimum && value <= schema.maximum
    ? null : path + ' needs a number from ' + schema.minimum + ' to ' + schema.maximum;
  if (typeof value !== 'string' || !value.trim()) return path + ' needs text';
  if (/[\u0000-\u001f\u007f\u2014]/.test(value)) return path + ' needs single-line text without control characters or em dashes';
  if (schema.enum && !schema.enum.includes(value)) return path + ' must be one of ' + schema.enum.join(', ');
  if (schema.maxLength && value.length > schema.maxLength) return path + ' exceeds ' + schema.maxLength + ' characters';
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) return path + ' must match ' + schema.pattern;
  return null;
}

const matches = (value,schema) => !schemaIssue(value,schema,'value');

export function validateAnimatedExplainerInput(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide a film lesson object.');
  for(const key of animatedExplainerInput.required)
    if(!Object.hasOwn(input,key))throw new Error('The film lesson is missing '+key+'.');
  for(const [key,value] of Object.entries(input)){
    const schema=animatedExplainerInput.properties[key];
    if(!schema)throw new Error('Remove the unsupported film lesson field '+key+'.');
    if(key==='beats'&&Array.isArray(value)){
      for(const [i,beat] of value.entries()){
        if(!beat||typeof beat!=='object')throw new Error('Provide a complete film beat at position '+(i+1)+'.');
        for(const field of schema.items.required){
          const rule=schema.items.properties[field];
          if(!matches(beat[field],rule))throw new Error('Film beat '+(i+1)+' needs valid '+field+' text (up to '+rule.maxLength+' characters).');
        }
        if(beat.pause!==undefined&&!matches(beat.pause,readingPause))
          throw new Error('Film beat '+(i+1)+' needs a pause between 0 and 6 seconds.');
      }
    }
    const issue=schemaIssue(value,schema,key==='visualApproach'?'scene direction (visualApproach)':key);
    if(issue)throw new Error('Correct the film lesson: '+issue+'.');
  }
  if(JSON.stringify(input).length>24_000)throw new Error('The film lesson exceeds its 24,000-character limit.');
  return structuredClone(input);
}

/** @param {string} program @param {string[]} args @param {{cwd?:string, env?:Record<string, string|undefined>, signal:AbortSignal, input?:string, maxOutput?:number}} options */
function command(program,args,{cwd,env,signal,input=undefined,maxOutput=12_000}) {
  return new Promise((done,fail) => {
    signal.throwIfAborted();
    const child = spawn(program,args,{cwd,env,detached:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});
    if(child.stdin){child.stdin.on('error',()=>{});child.stdin.end(input);}
    let log = '';
    const collect = chunk => { log = (log + chunk).slice(-maxOutput); };
    child.stdout.on('data',collect);
    child.stderr.on('data',collect);
    const stop = () => { try { process.kill(-child.pid,'SIGKILL'); } catch {} };
    signal.addEventListener('abort',stop,{once:true});
    if (signal.aborted) stop();
    child.once('error',error => {signal.removeEventListener('abort',stop);fail(error);});
    child.once('close',code => {
      signal.removeEventListener('abort',stop);
      if (signal.aborted) fail(signal.reason);
      else if (code !== 0) fail(new Error(log.trim() || 'Explainer process did not complete.'));
      else done(log);
    });
  });
}

export {command as runMediaCommand};
export {defaultVoice,defaultNarrationSpeed};
