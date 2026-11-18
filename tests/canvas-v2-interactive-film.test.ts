import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installCanvasV2AuthoredTimeline } from '../lib/canvas-v2/authored-timeline';
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

test('direct film capture uses the painted backing surface at the requested synchronous time', () => {
  let timelineTime = -1;
  class Surface {
    width = 1536;
    height = 864;
    toDataURL(type: string, quality: number) {
      assert.equal(type, 'image/jpeg');
      assert.equal(quality, .94);
      assert.equal(timelineTime, 2.25);
      return 'data:image/jpeg;base64,fixture';
    }
  }
  const sandbox: Record<string, unknown> = {
    HTMLCanvasElement: Surface, __name: (fn: Function) => fn,
    matchMedia: () => ({ addEventListener() {} }),
    addEventListener() {},
    document: { addEventListener() {}, querySelector: () => ({
      childElementCount: 0, textContent: '', setAttribute() {}, querySelectorAll: () => [],
    }) },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`(${installCanvasV2AuthoredTimeline.toString()})(true,2)`, sandbox);
  const timeline = sandbox.northstarTimeline as {
    exportPixelRatio: number;
    register(config: {duration: number; render(seconds: number): void; exportCanvas: Surface}): void;
    getState(): {directCanvasExport?: boolean};
    captureFrame(seconds: number, width: number, height: number): string;
  };
  assert.equal(timeline.exportPixelRatio, 2);
  assert.throws(() => timeline.captureFrame(0, 1536, 864), /explicitly registered/);
  timeline.register({duration: 8, render(seconds) { timelineTime = seconds; }, exportCanvas: new Surface()});
  assert.equal(timeline.getState().directCanvasExport, true);
  assert.equal(timeline.captureFrame(2.25, 1536, 864), 'data:image/jpeg;base64,fixture');
  assert.throws(() => timeline.captureFrame(3, 768, 432), /backing size/);
});
