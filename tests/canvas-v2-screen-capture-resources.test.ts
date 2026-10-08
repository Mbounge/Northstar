import assert from 'node:assert/strict';
import test from 'node:test';
import { packScreenCaptureImages, unpackScreenCaptureImages, bindScreenCaptureImages } from '../lib/canvas-v2/screen-capture-resources';

test('repeated authentic background assets are transferred once without changing crops or image bindings',()=>{
  const image='data:image/png;base64,'+btoa('image'.repeat(100000));
  const html='<img src="'+image+'"><div style="background-image:url('+image+');background-position:0 -92px"></div>';
  const css=Array.from({length:20},(_,i)=>`.part${i}{background-image:url("${image}");background-position:0 -${i}px}`).join('');
  const packed=packScreenCaptureImages(html,css);
  assert.equal(Object.keys(packed.captureImages).length,1);
  assert.ok(packed.html.length+packed.css.length<2500);
  let created=0;
  const resources=unpackScreenCaptureImages(packed.captureImages,blob=>{created++;assert.equal(blob.type,'image/png');return 'blob:private-capture';});
  assert.equal(created,1);
  assert.equal(bindScreenCaptureImages(packed.html,resources.replacements),html.replaceAll(image,'blob:private-capture'));
  assert.equal(bindScreenCaptureImages(packed.css,resources.replacements),css.replaceAll(image,'blob:private-capture'));
});

test('capture images never authorize external URLs, scripts or missing resources',()=>{
  for(const images of [{bad:'data:image/png;base64,AAAA'},{'northstar-capture-image:1':'https://example.test/private'},{'northstar-capture-image:1':'data:text/html;base64,AAAA'}]) {
    let allocated=false;
    assert.throws(()=>unpackScreenCaptureImages(images,()=>{allocated=true;return 'blob:never';}),/Invalid/);
    assert.equal(allocated,false);
  }
  assert.throws(()=>bindScreenCaptureImages('url(northstar-capture-image:99)',new Map()),/missing/);
});
