import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasFilmStudio, type FilmReviewer } from '../lib/canvas-v2/film-production/studio.server';
import type { filmRenderWorker } from '../worker/film-studio.server';

test('film publication requires matching reviews, retains the caption timing, and is consumed once', async () => {
  const frame=Buffer.from([0xff,0xd8,0xff,0xd9]);
  const captions='WEBVTT\n\n00:00:00.000 --> 00:00:00.800\nText\n';
  const worker={
    sample:async()=>[frame],
    render:async()=>({
      output:{duration:3,beats:Array.from({length:3},(_,start)=>({start,speechEnd:start+.8,end:start+1})),narration:'Fixture narrator',
        renderer:'Fixture',artifacts:[['lesson.mp4','video/mp4',Buffer.from('movie')],['captions.vtt','text/vtt',Buffer.from(captions)],
          ['poster.png','image/png',frame],['source.zip','application/zip',Buffer.from('source')]]},
      images:[frame],seconds:[0],peak:-12,
    }),
    model:async()=>({bytes:Buffer.from('model'),source:Buffer.from('source'),title:'Model'}),
  } as typeof filmRenderWorker;
  const studio=new CanvasFilmStudio(worker);
  const signal=new AbortController().signal;
  const approve:FilmReviewer=async()=>({passed:true,findings:[],limitations:'Sampled frames'});
  const reject:FilmReviewer=async()=>({passed:false,findings:[{beat:1,observation:'Overlapping text',repair:'Move the label'}],limitations:'Sampled frames'});
  const run=async(tool:string,args:unknown,review=approve)=>{
    const [reply]=await studio.call(tool,args,review,()=>{},signal);
    return JSON.parse((reply as {text:string}).text);
  };
  const shot={learningJob:'Read the source content',action:'An annotation opens on the left',assets:'A page with visible active labels',staging:'Wide shot with a close over the labels'};
  await run('plan_film_sequence',{shotPlan:[shot,shot,shot],direction:'Compare visible labels in the same stage.',reference:'An earlier teaching diagram in the signed brief.'});
  const edit=(javascript:string)=>run('edit_film_scene',{edits:[{id:'stage',html:'<canvas></canvas>',javascript}]});
  await edit('window.render=()=>{}');
  const scene={workbench:true};
  const lesson={title:'Read the labels',question:'How do you find the right label?',audience:'Students',
    takeaway:'Use a label that names the thing',visualApproach:'Annotate the diagram',sourceNotes:'Fixture material',review:'Reviewed internally',
    beats:Array.from({length:3},()=>({heading:'Label',narration:'Text',visual:'Text is visible.'}))};
  await assert.rejects(run('render_animated_film',{scene,lesson}),/whole-sequence/);
  await run('preview_film_shots',{scene,beat:0,prototype:true});
  await assert.rejects(run('render_animated_film',{scene,lesson}),/whole-sequence/);
  await run('preview_film_shots',{scene});
  await edit('window.render=()=>void 0');
  await assert.rejects(run('render_animated_film',{scene,lesson}),/exact current scene/);
  await run('preview_film_shots',{scene});
  const denied=await run('render_animated_film',{scene,lesson},reject);
  assert.equal(denied.publishable,false);
  const approved=await run('render_animated_film',{scene,lesson});
  const result=studio.requirePublication(approved.publicationId) as {playback:{captions:string;interaction?:unknown}};
  assert.equal(result.playback.captions,captions);
  assert.equal(result.playback.interaction,undefined);
  studio.recordPlacement(approved.publicationId);
  assert.throws(()=>studio.requirePublication(approved.publicationId),/once/);
});
