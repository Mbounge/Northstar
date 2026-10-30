import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasV2ContextToolbarPosition } from "../lib/canvas-v2/context-toolbar-placement";

test("the contextual toolbar prefers a clear position above the selection", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 930, top: 170, right: 1_150, bottom: 190 },
    toolbar: { width: 640, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [{ left: 500, top: 214, right: 1_330, bottom: 390 }],
    chrome: [{ left: 1_110, top: 12, right: 1_420, bottom: 84 }],
  });

  assert.equal(placement.placement, "above");
  assert.equal(placement.top + 56 <= 170, true);
  assert.equal(placement.center, 1_040);
});

test("the contextual toolbar never trades covering the selection for a cleaner environment", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 520, top: 300, right: 1_300, bottom: 620 },
    toolbar: { width: 620, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [
      { left: 430, top: 18, right: 1_424, bottom: 250 },
      { left: 430, top: 670, right: 1_424, bottom: 808 },
    ],
    chrome: [],
  });

  const toolbarRect = {
    left: placement.center - 310,
    top: placement.top,
    right: placement.center + 310,
    bottom: placement.top + 56,
  };
  const overlapWidth = Math.max(0, Math.min(toolbarRect.right, 1_300) - Math.max(toolbarRect.left, 520));
  const overlapHeight = Math.max(0, Math.min(toolbarRect.bottom, 620) - Math.max(toolbarRect.top, 300));
  assert.equal(overlapWidth * overlapHeight, 0);
});

test("crowded canvas content keeps the toolbar attached instead of sending it to a remote dock", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 540, top: 460, right: 760, bottom: 490 },
    toolbar: { width: 336, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [
      { left: 430, top: 360, right: 1_424, bottom: 450 },
      { left: 430, top: 510, right: 1_424, bottom: 650 },
    ],
    chrome: [],
  });

  const rect = toolbarRect(placement, 336, 56);
  assert.equal(overlap(rect, { left: 540, top: 460, right: 760, bottom: 490 }), 0, "the selected content must stay clear");
  assert.ok(gapBetween(rect, { left: 540, top: 460, right: 760, bottom: 490 }) <= 24, "surrounding artwork must not detach the inspector from its selection");
});

test("a newly moved object does not put its toolbar over the next object", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 470, top: 200, right: 518, bottom: 307 },
    toolbar: { width: 312, height: 42 },
    viewport: { left: 442, top: 18, right: 1_060, bottom: 620 },
    obstacles: [{ left: 520, top: 88, right: 570, bottom: 198 }],
    chrome: [],
  });
  assert.equal(placement.placement, "below");
  assert.equal(placement.top, 327);
});

test("a top-edge selection flips to the immediately connected row below", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 720, top: 24, right: 940, bottom: 50 },
    toolbar: { width: 336, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [],
    chrome: [{ left: 1_100, top: 12, right: 1_420, bottom: 84 }],
  });

  assert.equal(placement.placement, "below");
  assert.equal(placement.center, 830);
  assert.equal(placement.top, 70);
});


function toolbarRect(placement: { center: number; top: number }, width: number, height: number) {
  return { left: placement.center - width / 2, top: placement.top, right: placement.center + width / 2, bottom: placement.top + height };
}
function overlap(a: { left: number; top: number; right: number; bottom: number }, b: typeof a) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}
function gapBetween(a: { left: number; top: number; right: number; bottom: number }, b: typeof a) {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));
}

test('a selected app layer leaves its preview move handle and reset header clickable', () => {
  const selection = { left: 520, right: 870, top: 230, bottom: 275 };
  const header = { left: 500, right: 900, top: 170, bottom: 219 };
  const input = { selection, toolbar: { width: 290, height: 36 }, viewport: { left: 256, right: 1200, top: 96, bottom: 808 }, obstacles: [], chrome: [header], gap: 28 };
  const old = { center: 695, top: 166, placement: 'above' as const };
  const position = resolveCanvasV2ContextToolbarPosition({ ...input, previous: old });
  assert.equal(overlap(toolbarRect(position, 290, 36), header), 0);
  assert.equal(overlap(toolbarRect(position, 290, 36), selection), 0);
  assert.deepEqual(resolveCanvasV2ContextToolbarPosition({ ...input, previous: position }), position);
});

test('clearance around the app header avoids a toolbar flip on a small camera pan', () => {
  const selection = { left: 520, right: 870, top: 290, bottom: 345 };
  const header = { left: 488, right: 912, top: 142, bottom: 247 };
  const input = { selection, toolbar: { width: 290, height: 36 }, viewport: { left: 256, right: 1200, top: 96, bottom: 808 }, obstacles: [], chrome: [header], gap: 28 };
  const previous = resolveCanvasV2ContextToolbarPosition(input);
  assert.equal(previous.placement, 'below');
  for (const delta of [5, 10, 20]) {
    const shift = (rect: typeof header) => ({ left: rect.left + delta, right: rect.right + delta, top: rect.top + delta, bottom: rect.bottom + delta });
    assert.deepEqual(resolveCanvasV2ContextToolbarPosition({ ...input, selection: shift(selection), chrome: [shift(header)], previous }), previous);
  }
});

test("a partially clipped poster keeps its toolbar beside the visible selection", () => {
  const selection = { left: 620, top: -260, right: 920, bottom: 220 };
  const viewport = { left: 16, top: 92, right: 1_424, bottom: 808 };
  const placement = resolveCanvasV2ContextToolbarPosition({ selection, viewport, toolbar: { width: 336, height: 56 }, obstacles: [], chrome: [] });
  const rect = toolbarRect(placement, 336, 56);
  assert.equal(overlap(rect, selection), 0);
  assert.ok(gapBetween(rect, { ...selection, top: viewport.top }) <= 24, "clipping must not leave a toolbar near the invisible original top");
  assert.ok(rect.left >= viewport.left && rect.right <= viewport.right && rect.top >= viewport.top && rect.bottom <= viewport.bottom);
});

test("top-right mode controls remain usable while the nearby object toolbar flips below", () => {
  const selection = { left: 1_050, top: 120, right: 1_220, bottom: 170 };
  const chrome = { left: 1_140, top: 18, right: 1_424, bottom: 92 };
  const placement = resolveCanvasV2ContextToolbarPosition({ selection, toolbar: { width: 312, height: 42 }, viewport: { left: 16, top: 18, right: 1_424, bottom: 808 }, obstacles: [], chrome: [chrome] });
  const rect = toolbarRect(placement, 312, 42);
  assert.equal(overlap(rect, selection), 0);
  assert.equal(overlap(rect, chrome), 0, "canvas-wide mode controls must not be covered");
  assert.ok(gapBetween(rect, selection) <= 24);
});

test("a narrow canvas clamps a wide inspector without covering the selected poster", () => {
  const viewport = { left: 16, top: 18, right: 330, bottom: 620 };
  const selection = { left: 100, top: 220, right: 240, bottom: 460 };
  const placement = resolveCanvasV2ContextToolbarPosition({ selection, viewport, toolbar: { width: 640, height: 56 }, obstacles: [], chrome: [] });
  const rect = toolbarRect(placement, viewport.right - viewport.left, 56);
  assert.ok(rect.left >= viewport.left && rect.right <= viewport.right && rect.top >= viewport.top && rect.bottom <= viewport.bottom);
  assert.equal(overlap(rect, selection), 0);
  assert.ok(gapBetween(rect, selection) <= 24);
});

test("panning an object and its visible canvas together moves the toolbar by the same screen offset", () => {
  const input = { selection: { left: 540, top: 300, right: 760, bottom: 540 }, toolbar: { width: 336, height: 56 }, viewport: { left: 16, top: 18, right: 1_424, bottom: 808 }, obstacles: [{ left: 800, top: 250, right: 1_100, bottom: 540 }], chrome: [{ left: 16, top: 18, right: 320, bottom: 92 }] };
  const first = resolveCanvasV2ContextToolbarPosition(input);
  const shift = (rect: typeof input.selection) => ({ left: rect.left + 130, right: rect.right + 130, top: rect.top + 60, bottom: rect.bottom + 60 });
  const moved = resolveCanvasV2ContextToolbarPosition({ ...input, selection: shift(input.selection), viewport: shift(input.viewport), obstacles: input.obstacles.map(shift), chrome: input.chrome.map(shift) });
  assert.equal(moved.placement, first.placement);
  assert.equal(moved.center, first.center + 130);
  assert.equal(moved.top, first.top + 60);
});


test("a screen-space anchor stays unchanged across pans, zooms and nearby artwork changes", () => {
  const input = { selection: {left:500,top:340,right:700,bottom:480}, toolbar:{width:336,height:42}, viewport:{left:16,top:96,right:1424,bottom:808}, obstacles:[],chrome:[] };
  const previous=resolveCanvasV2ContextToolbarPosition(input);
  for (const selection of [{left:550,top:360,right:750,bottom:500},{left:430,top:350,right:790,bottom:600},{left:800,top:400,right:950,bottom:500}]) {
    assert.deepEqual(resolveCanvasV2ContextToolbarPosition({...input,selection,previous,obstacles:[toolbarRect(previous,336,42)]}),previous);
  }
});

test("an obstructed anchor moves once to a clear place and stays there on a small reversal", () => {
  const input = {selection:{left:500,top:340,right:700,bottom:480},toolbar:{width:336,height:42},viewport:{left:16,top:96,right:1424,bottom:808},obstacles:[],chrome:[]};
  const previous=resolveCanvasV2ContextToolbarPosition(input);
  const selection={left:500,top:260,right:700,bottom:450};
  const moved=resolveCanvasV2ContextToolbarPosition({...input,selection,previous});
  assert.notDeepEqual(moved,previous);
  assert.equal(overlap(toolbarRect(moved,336,42),selection),0);
  assert.deepEqual(resolveCanvasV2ContextToolbarPosition({...input,previous:moved,selection:{...selection,top:265,bottom:455}}),moved);
});

test("resizing clamps a stable toolbar minimally and respects newly opened chrome", () => {
  const input = {selection:{left:500,top:340,right:700,bottom:480},toolbar:{width:336,height:42},viewport:{left:16,top:96,right:1424,bottom:808},obstacles:[],chrome:[]};
  const previous={center:1100,top:180,placement:'above' as const};
  const clamped=resolveCanvasV2ContextToolbarPosition({...input,previous,viewport:{...input.viewport,right:1100}});
  assert.equal(clamped.center,932);assert.equal(clamped.top,180);
  const chrome=toolbarRect(clamped,336,42);
  const moved=resolveCanvasV2ContextToolbarPosition({...input,previous:clamped,chrome:[chrome]});
  assert.equal(overlap(toolbarRect(moved,336,42),chrome),0);
});


test("a viewport-filling selection does not make an unavoidably overlapping toolbar chase each frame", () => {
  const input={selection:{left:0,top:0,right:1500,bottom:1000},toolbar:{width:336,height:42},viewport:{left:16,top:96,right:1424,bottom:808},obstacles:[],chrome:[]};
  const previous=resolveCanvasV2ContextToolbarPosition(input);
  for(let offset=1;offset<30;offset++) assert.deepEqual(resolveCanvasV2ContextToolbarPosition({...input,selection:{left:offset,top:offset,right:1500,bottom:1000},previous}),previous);
});
