import assert from 'node:assert/strict';
import test from 'node:test';
import { filmPlaybackBranches, parseInteractiveFilm } from '../lib/canvas-v2/interactive-film';
import type { CanvasExplainerChapter } from '../lib/canvas-v2/explainer';

const source = () => ({
  sourceRevision: 'f'.repeat(64), frame: [800,400], fps: 24,
  views: [{id:'side', label:'Side', rect:[0,0,.5,1]}, {id:'angle', label:'Angle', rect:[.5,0,.5,1]}],
  branches: [{ afterBeat:1, prompt:'Which orientation will bend less?', choices:[{label:'Flat',beat:2},{label:'On edge',beat:3}], rejoinBeat:4 }],
});

test('timing follows actual narration beat boundaries and ends before the next encoded take', () => {
  const film = parseInteractiveFilm(source(), 4);
  const ends = [3.5, 8.25, 10, 12.7];
  const chapters: CanvasExplainerChapter[] = ends.map((end,index) => ({
    from:index, to:index+1, start:ends[index-1] ?? 0, speechEnd:end-.6, end,
    title: 'Beat '+index, narration:'Spoken line', description:'Meaningful visual event',
  }));
  assert.deepEqual(filmPlaybackBranches(film, chapters)[0], {
    ...film.branches[0], holdAt:3.5-1/24, rejoinAt:10,
    choices:[{label:'Flat',beat:2,from:3.5,until:8.25},{label:'On edge',beat:3,from:8.25,until:10}],
  });
});

test('rejects edits that would leave an unbound cut, spill a crop, or replay a different choice', () => {
  const draft = source();
  assert.throws(() => parseInteractiveFilm({...draft,sourceRevision:'different-cut'},4), /record/);
  draft.views[1].rect[0]=.7;
  assert.throws(() => parseInteractiveFilm(draft,4), /crop/);
  const duplicate = source();
  duplicate.branches[0].choices[1].beat=2;
  assert.throws(() => parseInteractiveFilm(duplicate,4), /consecutive beat/);
  assert.throws(() => parseInteractiveFilm(source(),3), /shared ending/);
});
