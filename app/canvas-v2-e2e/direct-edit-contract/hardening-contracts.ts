import { applyScreenDesignOperation, type ScreenDesignOperation } from '@/lib/canvas-v2/screen-design-edit';
import { screenAppearanceCanEditDirectly } from '@/lib/canvas-v2/screen-direct-edit';
import { parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { screenFeedbackSelectionCanRefresh, type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import {readCanvasV2BoardObjectGraph,readCanvasV2NativeBoardObjectGraph} from '@/lib/canvas-v2/board-object-graph';
import type {CanvasV2NativeSceneDocument,CanvasV2NativeSceneNode} from '@/lib/canvas-v2/native-scene';

export function runHardeningContracts(): Array<{ name: string; passed: boolean; error?: string }> {
  const parser = new DOMParser();
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const photo: CanvasV2ScreenFeedbackTarget = { nodeId: 'hardening-owner', title: 'Mask ownership', selector: '#photo', tag: 'img', label: 'Photograph', text: '', rect: { x: 0, y: 0, width: 100, height: 100 }, styles: { 'clip-path': 'inset(5%)' } };
  const screen: CanvasV2InteractiveScreen = { version: 1, title: 'Mask ownership', width: 300, height: 300, html: '<main><img id="photo" src="northstar-asset:photo" style="clip-path:inset(5%)"><button id="next">Next treatment</button><p id="keep">Unrelated source</p></main>', css: '', javascript: '', referenceAssetIds: ['photo'] };
  const apply = (current: CanvasV2InteractiveScreen, selector: string, operation: ScreenDesignOperation) => {
    const element = parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement | SVGElement>(selector)!;
    const target: CanvasV2ScreenFeedbackTarget = { nodeId: 'hardening-owner', title: current.title, selector, tag: element.localName, label: element.id, text: element.textContent ?? '', rect: { x: 0, y: 0, width: 100, height: 100 }, styles: Object.fromEntries([...element.style].map(key => [key, element.style.getPropertyValue(key)])) };
    return parseCanvasV2Screen(applyScreenDesignOperation(current, [target], operation, parser).encoded);
  };
  const cases: Array<[string, () => void]> = [
    ['Native Layers matches source graph labels, kinds, visibility, lock and provenance for ordinary authored objects',()=>{
      const html='<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="group" data-canvas-v2-group="true" aria-label="Renamed group" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create,rename" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="7" data-canvas-v2-rotation="13" data-canvas-v2-locked="true" hidden><p data-canvas-v2-node-id="label" aria-label="Caption">Human text</p></div><img data-canvas-v2-node-id="photo" data-canvas-v2-evidence-id="asset" aria-label="Reference"/></main>';
      const make=(id:string,parentId:string|undefined,tagName:string,kind:CanvasV2NativeSceneNode['kind']):CanvasV2NativeSceneNode=>({id,sourceNodeId:id,parentId,tagName,kind,childIds:[],content:[],order:0,namespace:'html',layoutMode:'absolute',selectable:true,hidden:false,locked:false,userEdited:false,canonicalEvidence:false,editVersion:0,geometry:{x:0,y:0,width:100,height:50,rotation:0,zIndex:0},attributes:{},inlineStyle:{}});
      const root=make('canvas',undefined,'main','root'),group=make('group','canvas','div','group'),label=make('label','group','p','text'),photo=make('photo','canvas','img','evidence');
      Object.assign(group,{hidden:true,locked:true,userEdited:true,lastAuthor:'user',editVersion:7});group.geometry.rotation=13;group.attributes={'aria-label':'Renamed group','data-canvas-v2-origin':'user','data-canvas-v2-user-edited':'create,rename'};label.attributes={'aria-label':'Caption'};photo.attributes={'aria-label':'Reference','data-canvas-v2-evidence-id':'asset'};photo.evidence={id:'asset'};
      const native:CanvasV2NativeSceneDocument={schema:'canvas-v2.native-scene.v1',revisionId:'current',width:1200,height:800,css:'',rootIds:['canvas'],nodes:[root,group,label,photo]};
      const legacy=readCanvasV2BoardObjectGraph({html,css:''}),current=readCanvasV2NativeBoardObjectGraph(native);
      const canonical=(items:typeof current)=>JSON.stringify(items.map(item=>Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)))));
      assert(canonical(current)===canonical(legacy),'Native Layers changed ordinary authored source metadata: '+JSON.stringify({current,legacy}));
    }],
    ['Anonymous native wrappers preserve the source graph nearest-owner hierarchy and expose selectable descendants',()=>{
      const html='<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="group" data-canvas-v2-group="true"><div class="anonymous"><p data-canvas-v2-node-id="text">Human text</p></div></div></main>';
      const legacy=readCanvasV2BoardObjectGraph({html,css:''});
      const make=(id:string,parentId?:string,sourceNodeId:string|undefined=id):CanvasV2NativeSceneNode=>({id,sourceNodeId,parentId,tagName:'div',kind:'object',childIds:[],content:[],order:0,namespace:'html',layoutMode:'flow',selectable:!!sourceNodeId,hidden:false,locked:false,userEdited:false,canonicalEvidence:false,editVersion:0,geometry:{x:0,y:0,width:100,height:50,rotation:0,zIndex:0},attributes:{},inlineStyle:{}});
      const wrapper=make('wrapper','group');delete wrapper.sourceNodeId;const nodes=[make('canvas'),make('group','canvas'),wrapper,make('text','wrapper')];const native=readCanvasV2NativeBoardObjectGraph({schema:'canvas-v2.native-scene.v1',revisionId:'current',width:1200,height:800,css:'',rootIds:['canvas'],nodes});
      const ancestry=(items:typeof native)=>items.map(item=>({id:item.nodeId,parent:item.parentNodeId,depth:item.depth}));assert(JSON.stringify(ancestry(native))===JSON.stringify(ancestry(legacy)),'Anonymous wrappers changed the nearest authored parent or depth.');assert(native.find(item=>item.nodeId==='group')?.childNodeIds.includes('text'),'Native selectable descendants disappeared behind an anonymous wrapper.');assert(!native.some(item=>item.nodeId==='wrapper'),'Compiler-only wrapper leaked into Layers.');
    }],
    ['A current-source generated candidate may request fresh feedback inspection without gaining direct-edit permission', () => {
      const generated = { ...screen, html: '<main><div id="generated-host"></div></main>', javascript: 'document.querySelector("#generated-host").innerHTML="<svg><path id=generated-art></path></svg>";' };
      const target = { ...photo, selector: '#generated-art', tag: 'path' };
      assert(screenFeedbackSelectionCanRefresh(generated, generated, target, parser), 'Current source cannot request inspection of its generated candidate.');
      assert(screenFeedbackSelectionCanRefresh(generated, structuredClone(generated), target, parser), 'Equivalent complete source cannot request fresh runtime inspection.');
      assert(!screenAppearanceCanEditDirectly(generated, target, parser), 'Runtime feedback permission incorrectly authorized source editing.');
      let rejected = false;
      try { applyScreenDesignOperation(generated, [target], { kind: 'geometry', attributes: { d: 'M0 0L40 40' } }, parser); } catch { rejected = true; }
      assert(rejected, 'Generated runtime geometry became directly editable.');
    }],
    ['A generated candidate cannot carry stale identity across HTML, JavaScript, CSS or retained-source changes', () => {
      const generated = { ...screen, html: '<main><div id="generated-host"></div></main>' };
      const target = { ...photo, selector: '#generated-art', tag: 'path' };
      for (const next of [{ ...generated, html: generated.html + '<p>New source</p>' }, { ...generated, javascript: 'renderDifferentArtwork()' }, { ...generated, css: 'path{fill:red}' }, { ...generated, referenceAssetIds: ['replacement'] }]) {
        assert(!screenFeedbackSelectionCanRefresh(generated, next, target, parser), 'Changed source accepted a stale generated candidate.');
      }
    }],
    ['Fresh-feedback gating rejects malformed selectors and duplicate source matches', () => {
      for (const selector of ['', '[', 'x'.repeat(1601)]) assert(!screenFeedbackSelectionCanRefresh(screen, screen, { ...photo, selector }, parser), 'Invalid selector accepted: ' + selector.slice(0, 20));
      const duplicate = { ...screen, html: '<main><img id="photo"><img id="photo"></main>' };
      assert(!screenFeedbackSelectionCanRefresh(duplicate, duplicate, photo, parser), 'Duplicate retained identity was accepted as a fresh runtime candidate.');
      assert(!screenFeedbackSelectionCanRefresh(screen, screen, { ...photo, tag: 'not a tag' }, parser), 'Malformed runtime tag was accepted.');
    }],
    ['A stable native identity survives a valid local source edit before fresh feedback inspection', () => {
      const changed = apply(screen, '#photo', { kind: 'mask', shape: 'ellipse' });
      assert(screenFeedbackSelectionCanRefresh(screen, changed, photo, parser), 'A valid native local edit lost its stable feedback identity.');
      assert(!screenFeedbackSelectionCanRefresh(screen, { ...changed, html: changed.html.replace('<img', '<div') }, photo, parser), 'Changed native tag retained stale feedback identity.');
    }],
    ['A script-controlled image mask declines atomically instead of saving a temporary visual override', () => {
      const owned = { ...screen, javascript: 'const photo=document.querySelector("#photo");document.querySelector("#next").addEventListener("click",()=>{photo.style.clipPath="inset(10%)";});' };
      const snapshot = JSON.stringify(owned);
      assert(!screenAppearanceCanEditDirectly(owned, photo, parser), 'Fixture must identify the actual image as code-controlled.');
      let rejected = false;
      try { applyScreenDesignOperation(owned, [photo], { kind: 'mask', shape: 'ellipse' }, parser); } catch { rejected = true; }
      assert(rejected, 'Script-controlled clip-path accepted a manual mask that the app can overwrite.');
      assert(JSON.stringify(owned) === snapshot, 'Rejected masking changed source, lineage or script.');
    }],
    ['The same retained photograph remains directly maskable when its appearance is passive', () => {
      assert(screenAppearanceCanEditDirectly(screen, photo, parser), 'Passive source image unexpectedly requires a code edit.');
      const result = parseCanvasV2Screen(applyScreenDesignOperation(screen, [photo], { kind: 'mask', shape: 'ellipse' }, parser).encoded);
      const before = parser.parseFromString(screen.html, 'text/html'), after = parser.parseFromString(result.html, 'text/html');
      assert(after.querySelector<HTMLImageElement>('#photo')!.style.clipPath.startsWith('ellipse('), 'Passive image mask was not saved.');
      for (const selector of ['#next', '#keep']) assert(before.querySelector(selector)?.outerHTML === after.querySelector(selector)?.outerHTML, 'Passive masking changed an unrelated native control.');
      assert(result.javascript === screen.javascript && JSON.stringify(result.referenceAssetIds) === JSON.stringify(screen.referenceAssetIds), 'Passive masking changed code or image lineage.');
    }],
    ['Updating component source preserves an inserted instance’s manual placement while propagating master paint', () => {
      const original = { ...screen, html: '<main><article id="master" style="background-color:#112233"><p id="label">Native component</p></article><p id="keep">Unrelated source</p></main>', referenceAssetIds: [] };
      let current = apply(original, '#master', { kind: 'component-create', name: 'Native component' });
      current = apply(current, '#master', { kind: 'variant-create', name: 'Base' });
      current = apply(current, '#master', { kind: 'component-insert', id: current.design!.components[0].id });
      // These layout declarations model preexisting authored instance placement;
      // they are not claimed as supported direct-edit UI properties.
      const authored = parser.parseFromString(current.html, 'text/html');
      const authoredInstance = authored.querySelector<HTMLElement>('#master-copy')!;
      for (const [property, value] of Object.entries({ position: 'absolute', left: '36px', top: '18px', 'transform-origin': '10px 20px', 'z-index': '3' })) authoredInstance.style.setProperty(property, value);
      current = { ...current, html: authored.body.innerHTML };
      current = apply(current, '#master-copy', { kind: 'styles', styles: { translate: '45px 20px', rotate: '12deg', scale: '1.2 .8' } });
      const before = parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement>('#master-copy')!;
      const placement = ['translate', 'rotate', 'scale', 'position', 'left', 'top', 'transform-origin', 'z-index'].map(property => [property, before.style.getPropertyValue(property)]);
      current = apply(current, '#master', { kind: 'styles', styles: { 'background-color': '#aa8844', 'border-radius': '14px' } });
      const beforeUpdate = JSON.stringify(current);
      const updated = apply(current, '#master', { kind: 'component-update' });
      const document = parser.parseFromString(updated.html, 'text/html'), instance = document.querySelector<HTMLElement>('#master-copy')!, master = document.querySelector<HTMLElement>('#master')!;
      for (const [property, value] of placement) assert(instance.style.getPropertyValue(property) === value, 'Master update erased instance ' + property + '.');
      assert(instance.style.backgroundColor === master.style.backgroundColor && instance.style.borderRadius === master.style.borderRadius, 'Preserving placement prevented the actual master paint update.');
      assert(JSON.stringify(current) === beforeUpdate, 'Component propagation mutated a previous history source.');
      assert(document.querySelector('#keep')?.outerHTML === '<p id="keep">Unrelated source</p>', 'Component propagation changed an unrelated layer.');
    }],
    ['Applying a saved variant preserves the instance’s own translate, rotation and scale', () => {
      const original = { ...screen, html: '<main><article id="master" style="background-color:#112233"><p id="label">Native component</p></article></main>', referenceAssetIds: [] };
      let current = apply(original, '#master', { kind: 'component-create', name: 'Native component' });
      current = apply(current, '#master', { kind: 'variant-create', name: 'Base' });
      current = apply(current, '#master', { kind: 'component-insert', id: current.design!.components[0].id });
      current = apply(current, '#master-copy', { kind: 'styles', styles: { translate: '45px 20px', rotate: '12deg', scale: '1.2 .8', 'background-color': '#aa8844' } });
      const before = parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement>('#master-copy')!;
      const placement = ['translate', 'rotate', 'scale'].map(property => [property, before.style.getPropertyValue(property)]);
      const changed = apply(current, '#master-copy', { kind: 'variant-apply', name: 'Base' });
      const after = parser.parseFromString(changed.html, 'text/html').querySelector<HTMLElement>('#master-copy')!;
      for (const [property, value] of placement) assert(after.style.getPropertyValue(property) === value, 'Variant application erased instance ' + property + '.');
      assert(after.style.backgroundColor === 'rgb(17, 34, 51)', 'Preserving placement prevented applying the saved variant paint.');
    }],
    ['Updating an SVG component preserves local x, y and transform while propagating native paint', () => {
      const original = { ...screen, html: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="master" x="5" y="6" width="40" height="30" transform="translate(1 2)" fill="#112233"/></svg>', referenceAssetIds: [] };
      let current = apply(original, '#master', { kind: 'component-create', name: 'Native vector' });
      current = apply(current, '#master', { kind: 'component-insert', id: current.design!.components[0].id });
      const source = parser.parseFromString(current.html, 'text/html');
      const instance = source.querySelector('#master-copy')!;
      instance.setAttribute('x', '45'); instance.setAttribute('y', '20'); instance.setAttribute('transform', 'translate(50 20) rotate(12)');
      source.querySelector('#master')!.setAttribute('fill', '#aa8844');
      current = { ...current, html: source.body.innerHTML };
      const updated = apply(current, '#master', { kind: 'component-update' });
      const result = parser.parseFromString(updated.html, 'text/html').querySelector('#master-copy')!;
      assert(result.namespaceURI === 'http://www.w3.org/2000/svg', 'Updating the component lost the SVG namespace.');
      for (const attribute of ['x', 'y', 'transform']) assert(result.getAttribute(attribute) === instance.getAttribute(attribute), 'Component update erased native SVG placement: ' + attribute);
      assert(result.getAttribute('fill') === '#aa8844', 'Preserving vector placement prevented master paint propagation.');
    }],
    ['Removing a master SVG transform propagates to untouched instances', () => {
      const original = { ...screen, html: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="master" width="40" height="30" transform="translate(1 2)"/></svg>', referenceAssetIds: [] };
      let current = apply(original, '#master', { kind: 'component-create', name: 'Native vector' });
      current = apply(current, '#master', { kind: 'component-insert', id: current.design!.components[0].id });
      const source = parser.parseFromString(current.html, 'text/html');
      source.querySelector('#master')!.removeAttribute('transform');
      current = { ...current, html: source.body.innerHTML };
      const updated = apply(current, '#master', { kind: 'component-update' });
      assert(!parser.parseFromString(updated.html, 'text/html').querySelector('#master-copy')!.hasAttribute('transform'), 'An untouched instance retained the removed master transform.');
    }],
    ['Variant placement uses the current variant baseline rather than treating its authored transform as a local override', () => {
      const original = { ...screen, html: '<main><article id="master" style="translate:0px 0px;background-color:#112233"><p id="label">Native component</p></article></main>', referenceAssetIds: [] };
      let current = apply(original, '#master', { kind: 'component-create', name: 'Native component' });
      current = apply(current, '#master', { kind: 'styles', styles: { translate: '10px 0px' } });
      current = apply(current, '#master', { kind: 'variant-create', name: 'Shifted' });
      current = apply(current, '#master', { kind: 'styles', styles: { translate: '20px 0px', 'background-color': '#aa8844' } });
      current = apply(current, '#master', { kind: 'variant-create', name: 'Wide' });
      current = apply(current, '#master', { kind: 'variant-apply', name: 'Shifted' });
      assert(parseFloat(parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement>('#master')!.style.translate) === 10, 'An untouched instance did not follow its requested variant placement.');
      current = apply(current, '#master', { kind: 'variant-apply', name: 'Wide' });
      assert(parseFloat(parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement>('#master')!.style.translate) === 20, 'Current variant placement was incorrectly preserved as a manual override.');
      current = apply(current, '#master', { kind: 'styles', styles: { translate: '30px 0px' } });
      current = apply(current, '#master', { kind: 'variant-apply', name: 'Shifted' });
      const result = parser.parseFromString(current.html, 'text/html').querySelector<HTMLElement>('#master')!;
      assert(parseFloat(result.style.translate) === 30, 'Changing variants erased a genuine local placement override.');
      assert(result.style.backgroundColor === 'rgb(17, 34, 51)', 'A local placement override prevented the requested variant paint.');
    }],
  ];
  return cases.map(([name, check]) => { try { check(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } });
}
