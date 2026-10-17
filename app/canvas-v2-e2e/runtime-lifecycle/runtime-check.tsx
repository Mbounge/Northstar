'use client';

import { useState } from 'react';
import { CanvasV2InteractiveScreenObject } from '@/components/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';

const encoded = encodeCanvasV2Screen({
  version: 1, title: 'Layout lifecycle regression', device: 'none', width: 480, height: 360, referenceAssetIds: [],
  html: '<main><section id="stage"><canvas id="art" aria-label="Live painted asset"></canvas></section><output id="size"></output><button id="count">Count 0</button><span id="boots">Boot 1</span></main>',
  css: 'html,body,main{width:100%;height:100%;margin:0}body{background:#172030;color:#fff;font:18px system-ui}#stage{width:0;height:0}canvas{display:block;width:100%;height:100%}button,output,span{margin:8px}',
  javascript: `(()=>{const c=document.querySelector('#art'),ctx=c.getContext('2d'),d=northstarProduct.data;d.count??=0;const b=document.querySelector('#count');const sync=()=>b.textContent='Count '+d.count;b.onclick=()=>{d.count++;sync()};sync();function resize(){c.width=c.clientWidth;c.height=c.clientHeight;ctx.fillStyle='#ae96ff';ctx.fillRect(12,12,c.width-24,c.height-24);document.querySelector('#size').textContent=c.width+' × '+c.height}window.addEventListener('resize',resize);resize();requestAnimationFrame(()=>{const stage=document.querySelector('#stage');stage.style.width='100%';stage.style.height='260px'})})();`,
});

export default function RuntimeLifecycleCheck() {
  const [visible, setVisible] = useState(true);
  return <main style={{ minHeight: '100vh', padding: 24, background: '#0d0e16', color: '#fff' }}>
    <h1>First usable layout and state retention</h1>
    <button onClick={() => setVisible(value => !value)}>{visible ? 'Hide asset' : 'Show asset'}</button>
    <div style={{ display: visible ? 'block' : 'none', width: 480, height: 360, marginTop: 64 }}>
      <CanvasV2InteractiveScreenObject nodeId="layout-lifecycle" encoded={encoded} />
    </div>
  </main>;
}
