import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainPanel, movePanel } from '../components/canvas-v2/use-floating-panel';
import { canvasV2PanelAwareInsets } from '../lib/canvas-v2/workspace-coordinate-space';
import { canvasV2PreferredRootPlacement } from '../lib/canvas-v2/native-scene';
test('panel moves and resizes from every side without leaving the screen', () => {
  const r = { x: 200, y: 180, width: 400, height: 400 };
  assert.deepEqual(movePanel(r, 'nw', -100, -100, 1200, 900), { x: 100, y: 80, width: 500, height: 500 });
  assert.deepEqual(movePanel(r, 'se', 100, 100, 1200, 900), { ...r, width: 500, height: 500 });
  for (const h of ['n','ne','e','se','s','sw','w','nw','move'] as const) {
    const next = movePanel(r,h,2000,-2000,1200,900);
    assert.ok(next.x >= 8 && next.y >= 8 && next.x + next.width <= 1192 && next.y + next.height <= 892);
    assert.ok(next.width >= 320 && next.height >= 300);
  }
  const small = constrainPanel(r, 300, 250); assert.equal(small.width, 284); assert.equal(small.height, 234);
});
test('free territory follows panel position, not a fixed left column', () => {
  const size = { width: 1400, height: 900 }, base = { left: 32, right: 32, top: 100, bottom: 92 };
  const left = canvasV2PanelAwareInsets(size,base,{ x:20,y:90,width:390,height:700 }); assert.equal(left.left,434);
  const right = canvasV2PanelAwareInsets(size,base,{ x:970,y:90,width:390,height:700 }); assert.equal(right.left,32); assert.equal(right.right,454);
  const bottom = canvasV2PanelAwareInsets(size,base,{ x:32,y:550,width:1300,height:300 }); assert.equal(bottom.bottom,374);
});
test('independent islands follow current viewport even when an earlier island exists', () => {
  const anchor = { x: 9000, y: 12000 }, authored = { x: 100,y:100,width:700,height:400 };
  const previous = { placed: { ...authored,x:200,y:300 }, authored, newlyPlaced:false };
  assert.deepEqual(canvasV2PreferredRootPlacement({ anchor,authored,authoredOrigin:{x:100,y:100},previous,relation:'none' }),anchor);
  assert.equal(canvasV2PreferredRootPlacement({ anchor,authored,authoredOrigin:{x:100,y:100},previous,relation:'right' }).x,1092);
});
