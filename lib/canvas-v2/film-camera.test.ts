import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { filmCameraViewport, interpolateFilmCamera } from './film-camera';
test('camera fits world bounds at nonzero canvas origin without altering geometry', () => {
  const p = {x:65000,y:64000,width:1920,height:1080,padding:0};
  const v = filmCameraViewport(p,{width:1920,height:1080});
  assert.deepEqual(v,{x:-65000,y:-64000,scale:1});
  assert.throws(()=>filmCameraViewport({...p,width:NaN},{width:1920,height:1080}));
});
test('camera interpolation preserves both endpoints and finite positive zoom',()=>{
  const size={width:1920,height:1080};
  const a=filmCameraViewport({x:65000,y:64000,width:1000,height:700},size);
  const b=filmCameraViewport({x:65000,y:64000,width:11600,height:5800},size);
  for(const [actual,expected] of [[interpolateFilmCamera(a,b,0,size),a],[interpolateFilmCamera(a,b,1,size),b]]) {
    assert.ok(Math.abs(actual.x-expected.x)<1e-8); assert.ok(Math.abs(actual.y-expected.y)<1e-8); assert.ok(Math.abs(actual.scale-expected.scale)<1e-8);
  }
  const mid=interpolateFilmCamera(a,b,.5,size); assert.ok(mid.scale>b.scale&&mid.scale<a.scale); assert.ok(Number.isFinite(mid.x));
});
test('a travelling camera clears intervening artwork without returning to the board overview',()=>{
  const size={width:1512,height:677};
  const a=filmCameraViewport({x:64870,y:64630,width:2500,height:1050,padding:65},size);
  const b=filmCameraViewport({x:72750,y:64300,width:1100,height:850,padding:70},size);
  const mid=interpolateFilmCamera(a,b,.5,size,.2);
  assert.ok(Math.abs(mid.scale-.2)<1e-9);
  for(const t of [0,1]) {
    const actual=interpolateFilmCamera(a,b,t,size,.2), expected=t===0?a:b;
    assert.ok(Math.abs(actual.x-expected.x)<1e-8);
    assert.ok(Math.abs(actual.y-expected.y)<1e-8);
    assert.ok(Math.abs(actual.scale-expected.scale)<1e-8);
  }
});
