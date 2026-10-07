import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Exercises the production tool path; this peer supplies deterministic source,
 * not a live model's design judgement. */
export class ScreenScenario {
  private step = 0;
  private nodeId = '';
  constructor(private peer: FixtureCodex, private revision: boolean) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = Array.isArray(result.contentItems) ? result.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* report below */ }
    if (!result.success || value.committed === false) { this.peer.finish('Screen fixture failed: ' + JSON.stringify(value)); return; }
    switch (this.step++) {
      case 0:
        if (this.revision) {
          this.nodeId = string(object((value.screens as unknown[])?.[0]).nodeId);
          this.peer.tool('canvas_read', { nodeId: this.nodeId });
        } else this.peer.tool('canvas_screen', { title: 'GRAET · next team', width: 390, height: 844, summary: 'Created a working mobile screen', html: `<main><header><b>GRAET</b><span>Your next season</span></header><h1>Picture yourself<br>here.</h1><p>Real teams. A new place to play.</p><section class="team"><span class="badge">3 forward spots · Tryout</span><div class="rink"><span>BLUE<br>OX</span></div><h2>Minnesota Blue Ox</h2><p>Coon Rapids, MN · NCDC</p><button id="save">Save team</button><button id="apply">Apply</button></section><section class="application" hidden><h2>Your introduction</h2><label>Your name<input id="name" value="Alex Taylor"></label><button id="send">Send application</button><button id="close">Back to teams</button><p id="status"></p></section><section class="more"><h2>More for your next season</h2>${Array.from({ length: 8 }, (_, i) => `<article>Opportunity ${i + 1}<p>Junior hockey · 2026–27 season</p></article>`).join('')}</section><nav><button>Teams</button><button>Applied</button><button>Saved</button><button>Me</button></nav></main>`, css: `body{color:#0b1430;background:#f3f5fa}main{padding:24px 24px 86px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}header b{font-style:italic;font-size:23px}header span,p{color:#606a7f;font-size:14px}h1{font-size:34px;line-height:1.1;letter-spacing:-1px;margin:0}h2{font-size:22px;margin:18px 0 8px}p{line-height:1.5}.team,.application{padding:20px;background:white;border-radius:22px;margin-top:26px;border:1px solid #e0e5ef}.badge{font-size:12px;color:#195642;background:#e7f4ef;border-radius:20px;padding:7px 10px}.rink{height:210px;border-radius:14px;background:linear-gradient(135deg,#151c35,#285382);display:grid;place-items:center;margin-top:20px;color:white;font-size:48px;font-weight:900;letter-spacing:3px}button{border:0;border-radius:22px;padding:12px 18px;margin-right:8px;cursor:pointer;font-weight:600;color:#073dfa;background:#edf2ff}#apply,#send{background:#073dfa;color:white}label{display:block;margin:20px 0}input{display:block;border:1px solid #d9deea;border-radius:10px;padding:12px;margin-top:8px;width:100%;font:inherit}.more article{background:white;border:1px solid #e0e5ef;padding:18px;margin:12px 0;border-radius:16px}nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;background:white;border-top:1px solid #e0e5ef;padding:14px 0}nav button{font-size:12px;padding:10px;margin:0}[hidden]{display:none!important}`, javascript: `const team=document.querySelector('.team'),form=document.querySelector('.application');document.querySelector('#save').addEventListener('click',e=>e.target.textContent=e.target.textContent==='Saved'?'Save team':'Saved');document.querySelector('#apply').addEventListener('click',()=>{team.hidden=true;form.hidden=false});document.querySelector('#close').addEventListener('click',()=>{form.hidden=true;team.hidden=false});document.querySelector('#send').addEventListener('click',()=>document.querySelector('#status').textContent='Application prepared for '+document.querySelector('#name').value);`, referenceAssetIds: [] });
        break;
      case 1:
        if (this.revision) {
          const source = object(object((value.screens as unknown[])[0]).source);
          this.peer.tool('canvas_screen', { nodeId: this.nodeId, html: string(source.html).replace('Picture yourself<br>here.', 'Your next<br>opportunity.'), summary: 'Revised only the headline' });
        } else {
          this.nodeId = string(value.nodeId);
          this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'inspect' });
        }
        break;
      case 2: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#apply' }); break;
      case 3: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'fill', selector: '#name', value: 'Jordan Smith' }); break;
      case 4: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#send' }); break;
      case 5:
        if (!string(value.text).includes('Application prepared for Jordan Smith')) { this.peer.finish('Screen fixture failed: mock application interaction did not work.'); return; }
        this.peer.tool('canvas_review', { nodeId: this.nodeId }); break;
      default:
        if (!parts.some(part => part.type === 'inputImage')) { this.peer.finish('Screen fixture failed: live screen pixels missing.'); return; }
        this.peer.finish(this.revision ? 'Revised the headline and verified the working mock application.' : 'Created and visually reviewed the screen, including a working mock application.');
    }
  }
}
