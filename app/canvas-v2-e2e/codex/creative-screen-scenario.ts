import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic peer exercises the real tools, not a model's visual judgement. */
export class CreativeScreenScenario {
  private step = 0;
  private nodeId = '';
  private flowId = '';
  private multiTargets: JsonObject[] = [];
  constructor(private peer: FixtureCodex, private feedback: boolean, private flow = false, private reachability = false, private multiple = false) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = Array.isArray(result.contentItems) ? result.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* fail below */ }
    if (this.reachability) { this.checkReachability(result, parts, value); return; }
    if (this.multiple) {
      if (!result.success || value.committed === false) { this.peer.finish('Multiple feedback failed: '+string(parts[0]?.text)); return; }
      if (this.step++ === 0) {
        const targets = (value.screenFeedbackTargets as JsonObject[]) ?? [];
        if (targets.length < 2 || !Array.isArray(value.objectFeedbackTargets) || !value.objectFeedbackTargets.length) { this.peer.finish('Multiple feedback failed: screen and canvas tags missing'); return; }
        this.multiTargets = targets;
      }
      const target = this.multiTargets[this.step-1];
      if (target) this.peer.tool('canvas_screen_element', { nodeId:target.nodeId, selector:target.selector, text:'Refined detail '+this.step, summary:'Refined a tagged detail', selectionPolicy:'modify' });
      else this.peer.finish('Refined every tagged screen detail and retained the tagged canvas reference.');
      return;
    }
    if (!result.success || value.committed === false) { this.peer.finish('Creative screen failed: ' + (string(parts[0]?.text) || JSON.stringify(value))); return; }
    if (this.flow) {
      switch (this.step++) {
        case 0: this.peer.tool('account_read', { operation: 'list-flows', appId: 'app:awin', sessionType: 'onboarding', platform: 'mobile' }); break;
        case 1: this.flowId = string(object((value.flows as unknown[])[0]).id); this.peer.tool('account_read', { operation: 'flow-screens', appId: 'app:awin', flowId: this.flowId }); break;
        case 2: this.peer.tool('canvas_read', {}); break;
        case 3: this.peer.tool('canvas_insert_flow', { flowId: this.flowId, summary: 'Added the complete inspiration rail beside existing screens' }); break;
        default: this.peer.finish('Added the full inspiration flow without moving the existing screen.');
      }
      return;
    }
    if (this.feedback) {
      if (this.step++ === 0) {
        this.nodeId = string(object(value.screenFeedback).nodeId);
        if (!this.nodeId || !Array.isArray(value.productIdentities) || !value.productIdentities.length) { this.peer.finish('Creative screen failed: precise target or saved identity missing'); return; }
        this.peer.tool('canvas_screen_element', { nodeId: this.nodeId, text: 'Your next chapter.', styles: { 'font-size': '32px' }, summary: 'Refined the selected headline', selectionPolicy: 'modify' });
      } else if (this.step === 2) this.peer.tool('canvas_review', { nodeId: this.nodeId });
      else this.peer.finish('Refined only the selected headline; the saved product identity and interaction state were retained.');
      return;
    }
    switch (this.step++) {
      case 0: this.peer.tool('canvas_product_identity', { identity: { id: 'graet-test', name: 'GRAET', platform: 'mobile', visualLanguage: 'Blue accents, quiet neutral surfaces, generous spacing.', typography: 'System sans, bold headlines.', components: 'Rounded cards and fixed mobile navigation.', motion: 'Gentle 320ms transitions; reduced-motion alternative.', tokens: { '--product-accent': '#073dfa', '--product-ink': '#0b1430', '--motion-duration': '320ms' }, referenceAssetIds: [] } }); break;
      case 1: this.peer.tool('canvas_screen', { productIdentityId: 'graet-test', title: 'GRAET · creative review', summary: 'Created a screen for precise feedback and motion review', html: '<main><header><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4v16" /></svg> GRAET</header><h1 id="headline">Your next season.</h1><p>Real teams. A new place to play.</p><div class="motion-stage"><div class="orb" aria-label="Moving highlight"></div></div><section><h2>Minnesota Blue Ox</h2><button id="save">Save team</button><label>Your goal<input id="goal" value="Score 10 goals"></label><p id="status">Ready to play</p></section><footer>Teams · Applied · Saved · Me</footer></main>', css: 'body{background:#f3f5fa;color:var(--product-ink)}main{padding:28px}header{font-size:24px;font-weight:900;font-style:italic}h1{font-size:36px;letter-spacing:-1.2px;margin-top:36px}p{color:#667088}.motion-stage{position:relative;height:120px;border-radius:22px;background:#e5ebff;overflow:hidden}.orb{width:48px;height:48px;background:var(--product-accent);border-radius:50%;position:absolute;left:20px;top:36px;animation:drift 3s infinite alternate ease-in-out}@keyframes drift{from{transform:translateX(0);opacity:.5}to{transform:translateX(220px);opacity:1}}@media(prefers-reduced-motion:reduce){.orb{animation:none}}section{padding:24px;background:white;border-radius:22px;margin-top:26px}button{background:var(--product-accent);color:white;border:0;border-radius:20px;padding:14px 22px;font-weight:700}label{display:block;margin-top:24px}input{display:block;width:100%;margin-top:10px;border:1px solid #d5dbea;border-radius:10px;padding:12px;font:inherit}footer{position:fixed;bottom:0;left:0;right:0;background:white;padding:24px;text-align:center}', javascript: "document.querySelector('#save').addEventListener('click',e=>{e.target.textContent=e.target.textContent==='Saved'?'Save team':'Saved'});document.querySelector('#goal').addEventListener('input',e=>document.querySelector('#status').textContent=e.target.value)", referenceAssetIds: [] }); break;
      case 2: this.nodeId = string(value.nodeId); this.peer.tool('canvas_screen_motion_review', { nodeId: this.nodeId }); break;
      case 3:
        if (parts.filter(part => part.type === 'inputImage').length !== 3 || new Set(parts.filter(part => part.type === 'inputImage').map(part => part.imageUrl)).size !== 3) { this.peer.finish('Creative screen failed: distinct motion frames missing'); return; }
        this.peer.tool('canvas_review', { nodeId: this.nodeId }); break;
      case 4:
        if (!parts.some(part=>part.type==='inputText' && string(part.text).includes('detailName')) || parts.filter(part=>part.type==='inputImage').length<2) { this.peer.finish('Creative screen failed: magnified component pixels missing'); return; }
        this.peer.finish('Created the screen with a saved product identity and reviewed three distinct motion frames.'); break;
    }
  }
  private checkReachability(result: JsonObject, parts: JsonObject[], value: JsonObject) {
    if ([3, 4, 5].includes(this.step)) {
      if (result.success !== false || !string(parts[0]?.text).includes('visible control')) { this.peer.finish('Reachability failed: a hidden or covered control was allowed'); return; }
    } else if (!result.success || value.committed === false) { this.peer.finish('Reachability failed: ' + string(parts[0]?.text)); return; }
    switch (this.step++) {
      case 0: this.peer.tool('canvas_screen', { title: 'Reachability check', width: 390, height: 844, html: '<main><h1>Reachable controls</h1><div class="clip"><button id="clipped">Clipped control</button></div><div class="transparent"><button id="transparent">Transparent control</button></div><button id="covered">Covered control</button><div class="cover">Fixed navigation</div><button id="real">Open highlight</button><div id="highlight"></div></main>', css: 'main{padding:24px}.clip{height:0;overflow:hidden}.clip button{width:200px;height:40px}.transparent{opacity:0}#covered,.cover{position:absolute;left:24px;top:180px;width:200px;height:50px}.cover{z-index:2;background:#ddd}#real{margin-top:180px;padding:16px}#highlight{width:40px;height:40px;background:#1554d7;transform:translateX(0);transition:transform 80ms linear}#highlight.active{transform:translateX(200px)}', javascript: "document.querySelector('#real').addEventListener('click',()=>document.querySelector('#highlight').classList.toggle('active'))", referenceAssetIds: [], summary: 'Create a runtime reachability check' }); break;
      case 1: this.nodeId = string(value.nodeId); this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'inspect' }); break;
      case 2:
        if ((value.controls as JsonObject[]).some(control => ['clipped','transparent','covered'].includes(string(control.id)))) { this.peer.finish('Reachability failed: hidden controls were listed as visible'); return; }
        this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#clipped' }); break;
      case 3: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#transparent' }); break;
      case 4: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#covered' }); break;
      case 5: this.peer.tool('canvas_screen_motion_review', { nodeId: this.nodeId, triggerSelector: '#real' }); break;
      default:
        if (parts.filter(part => part.type === 'inputImage').length !== 3 || new Set(parts.filter(part => part.type === 'inputImage').map(part => part.imageUrl)).size !== 3) { this.peer.finish('Reachability failed: short transition was missed'); return; }
        this.peer.finish('Hidden and covered controls were rejected; the reachable control produced three distinct 80ms motion frames.');
    }
  }
}
