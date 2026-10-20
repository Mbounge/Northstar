'use client';

import { useRef, useState } from 'react';
import { patchCanvasV2ScreenElement, canvasV2ScreenLiveEdit, parseCanvasV2ScreenFeedbackTarget, screenFeedbackSelectionSurvives } from '@/lib/canvas-v2/screen-feedback';
import { screenInlineTextLivePatches } from '@/lib/canvas-v2/screen-inline-text';
import { parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { ScreenAppearanceEditor } from '@/components/canvas-v2/screen-direct-tools';
import { editScreenAppearance, editScreenAttributes, editScreenText, flushScreenDirectEdits, screenAppearanceCanEditDirectly, screenDirectOptionsAtPoint, screenTextCanEditDirectly, type ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';
import { screenEditableLayers } from '@/lib/canvas-v2/screen-vector-edit';
import { replaceScreenAsset, screenAssetLivePatches } from '@/lib/canvas-v2/screen-asset-edit';
import { ThreeFamilyFixture } from './three-family-fixture';
import { runNativeEditKernelContracts } from './kernel-contracts';
import { runDesignerContracts } from './designer-contracts';
import { runHardeningContracts } from './hardening-contracts';
import { StudioHandoffFixture } from './studio-handoff-fixture';
import { CaptureCloneContracts } from '../hardening/capture-clone-contracts';

type Check = { name: string; passed: boolean; error?: string };

/** Real DOM checks of production helpers; no engine, account, model or storage. */
function runChecks(): Check[] {
  const parser = new DOMParser();
  const baseline = '<main><h1 id="title" data-northstar-inline-text="true" style="font-size: 40px"><span style="color: red; font-family: Georgia; font-size: 24px; text-decoration: underline">Human <b style="font-weight: 700">idea</b></span></h1><button id="save">Save</button><p id="other">Keep this exact phrase.</p></main>';
  const screen = (html: string): CanvasV2InteractiveScreen => ({ version: 1, title: 'Contract fixture', width: 390, height: 844, html, css: 'main{padding:20px}', javascript: 'window.contractBoot=(window.contractBoot||0)+1;', referenceAssetIds: [] });
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const rejects = (action: () => unknown) => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Unsafe target accepted a text replacement.'); };
  const withFixture = (html: string, check: (fixture: HTMLElement) => void) => {
    const fixture = document.createElement('div');
    fixture.style.cssText = 'position:fixed;left:0;top:0;width:390px;z-index:2147483000;opacity:0';
    fixture.innerHTML = html; document.body.appendChild(fixture);
    try { check(fixture); } finally { fixture.remove(); }
  };
  const cases: Array<[string, () => void]> = [
    ['AI literal copy replaces safe human inline text and preserves surrounding controls', () => {
      const literal = 'Build <this> & keep it literal.';
      const html = patchCanvasV2ScreenElement(baseline, '#title', { text: literal }, parser);
      const doc = parser.parseFromString(html, 'text/html'), title = doc.querySelector('#title')!;
      assert(title.textContent === literal && title.children.length === 0, 'Copy became markup or was not replaced.');
      assert(title.getAttribute('data-northstar-inline-text') === 'true', 'Human inline owner identity was lost.');
      assert(doc.querySelector('#save')?.outerHTML === '<button id="save">Save</button>', 'Unrelated native control changed.');
      assert(doc.querySelector('#other')?.textContent === 'Keep this exact phrase.', 'Unrelated copy changed.');
    }],
    ['Requested typography reaches all runs while unrelated range properties survive', () => {
      const html = patchCanvasV2ScreenElement(baseline, '#title', { styles: { color: '#123456', 'font-weight': '500' } }, parser);
      const title = parser.parseFromString(html, 'text/html').querySelector<HTMLElement>('#title')!, span = title.querySelector<HTMLElement>('span')!;
      for (const child of title.querySelectorAll<HTMLElement>('*')) assert(child.style.color === 'inherit' && child.style.fontWeight === 'inherit', 'A range overrode requested typography.');
      assert(span.style.fontFamily === 'Georgia' && span.style.fontSize === '24px' && span.style.textDecoration === 'underline', 'An unrelated human range property was reset.');
      assert(title.textContent === 'Human idea', 'Styling changed the human copy.');
    }],
    ['Surface properties do not spread into inline ranges', () => {
      const html = patchCanvasV2ScreenElement(baseline, '#title', { styles: { 'background-color': '#abcdef' } }, parser);
      const title = parser.parseFromString(html, 'text/html').querySelector<HTMLElement>('#title')!;
      assert(!!title.style.backgroundColor, 'Requested surface styling was not saved.');
      assert(!title.querySelector<HTMLElement>('span')!.style.backgroundColor, 'Owner background spread into its text runs.');
    }],
    ['Unmarked formatted containers preserve their children', () => rejects(() => patchCanvasV2ScreenElement('<h1 id="title"><span>Keep</span></h1>', '#title', { text: 'Replace' }, parser))],
    ['Marked interactive descendants remain protected', () => rejects(() => patchCanvasV2ScreenElement('<div id="title" data-northstar-inline-text="true"><button>Keep control</button></div>', '#title', { text: 'Replace' }, parser))],
    ['Marked ranges with identity attributes remain protected', () => rejects(() => patchCanvasV2ScreenElement('<h1 id="title" data-northstar-inline-text="true"><span id="app-label">Keep</span></h1>', '#title', { text: 'Replace' }, parser))],
    ['Form controls cannot become copy through a human-inline marker', () => rejects(() => patchCanvasV2ScreenElement('<textarea id="title" data-northstar-inline-text="true">Keep value</textarea>', '#title', { text: 'Replace' }, parser))],
    ['Literal AI refinement uses the native live patch path', () => {
      const html = patchCanvasV2ScreenElement(baseline, '#title', { text: 'Next human chapter' }, parser);
      const before = screen(baseline), after = screen(html), patch = canvasV2ScreenLiveEdit(before, after, parser);
      assert(patch?.edits?.length === 1 && patch.edits[0].html === 'Next human chapter', 'Inline refinement would reboot the live app.');
      assert(before.javascript === after.javascript && before.css === after.css, 'Refinement changed app code or stylesheet.');
    }],
    ['Typography AI refinement uses native live patches', () => {
      const html = patchCanvasV2ScreenElement(baseline, '#title', { styles: { color: '#123456' } }, parser);
      const patch = canvasV2ScreenLiveEdit(screen(baseline), screen(html), parser);
      assert(!!patch && (patch.edits?.length ?? 1) > 0, 'Typography refinement would reboot the live app.');
    }],
    ['A changed document head cannot masquerade as a live text patch', () => {
      const before = '<head><style>h1{color:red}</style></head><body><h1 id="title" data-northstar-inline-text="true"><span>Before</span></h1></body>';
      const after = before.replace('color:red', 'color:blue').replace('Before', 'After');
      assert(screenInlineTextLivePatches(before, after, parser) === undefined, 'Inline detector ignored changed head content.');
      assert(canvasV2ScreenLiveEdit(screen(before), screen(after), parser) === undefined, 'Fallback detector ignored changed head content.');
    }],
    ['A static heading with BR and contenteditable is discoverable in Edit mode while Preview preserves native editing', () => {
      const html = '<h1 id="contract-heading" contenteditable="true">A human<br>chapter</h1>';
      withFixture(html, () => {
        const target = screenDirectOptionsAtPoint(document, 0, 0, true, '#contract-heading')?.text;
        assert(target?.selector === '#contract-heading' && target.text === 'A humanchapter', 'Edit mode failed to discover native multiline heading copy.');
        assert(!screenDirectOptionsAtPoint(document, 0, 0, false, '#contract-heading')?.text, 'Preview intercepted the app’s native editable text.');
        assert(target && screenTextCanEditDirectly({ ...screen(html), javascript: '' }, target, parser), 'Host rejected safe static heading markup.');
      });
    }],
    ['Point discovery promotes inline phrases but an explicit selector retains its exact scope in the embedded helper', () => {
      const html = '<h2 id="contract-heading" style="margin:0;font-size:24px"><span id="contract-phrase">A phrase</span><br>and a second line</h2>';
      withFixture(html, fixture => {
        const embedded = new Function(`return (${screenDirectOptionsAtPoint.toString()})`)() as typeof screenDirectOptionsAtPoint;
        const rect = fixture.querySelector('#contract-phrase')!.getBoundingClientRect();
        const point = embedded(document, rect.left + rect.width / 2, rect.top + rect.height / 2, true);
        // An identity-bearing phrase cannot be flattened into its parent.
        assert(point?.text?.selector === '#contract-phrase', 'Discovery flattened a phrase with its own identity.');
        fixture.querySelector('#contract-phrase')!.removeAttribute('id');
        assert(embedded(document, rect.left + rect.width / 2, rect.top + rect.height / 2, true)?.text?.selector === '#contract-heading', 'Embedded discovery failed to promote safe inline heading content.');
        assert(embedded(document, 0, 0, true, '#contract-heading > span')?.text?.tag === 'span', 'An explicit phrase selector expanded to the whole heading.');
      });
    }],
    ['Unsafe descendants and native form inputs stay outside direct text discovery', () => {
      withFixture('<h1 id="contract-heading">A <button>nested control</button></h1><p id="contract-paragraph">Ordinary static copy</p><input id="contract-input" value="Keep"><textarea id="contract-textarea">Keep</textarea>', () => {
        assert(!screenDirectOptionsAtPoint(document, 0, 0, true, '#contract-heading')?.text, 'A container with a nested control became editable copy.');
        assert(screenDirectOptionsAtPoint(document, 0, 0, true, '#contract-paragraph')?.text?.text === 'Ordinary static copy', 'Ordinary copy stopped being discoverable.');
        for (const selector of ['#contract-input', '#contract-textarea']) assert(!screenDirectOptionsAtPoint(document, 0, 0, true, selector)?.text, 'Edit mode intercepted a native form value.');
      });
    }],
    ['Host validation still rejects unsupported inline styling and code-owned text after discovery', () => {
      const unsafe = '<h1 id="contract-heading"><span style="position:fixed">Unsupported styling</span></h1>';
      withFixture(unsafe, () => {
        const target = screenDirectOptionsAtPoint(document, 0, 0, true, '#contract-heading')?.text;
        assert(target && !screenTextCanEditDirectly({ ...screen(unsafe), javascript: '' }, target, parser), 'Candidate discovery bypassed native markup validation.');
      });
      const controlled = '<h1 id="contract-heading" contenteditable="true">Code owns this label</h1>';
      withFixture(controlled, () => {
        const target = screenDirectOptionsAtPoint(document, 0, 0, true, '#contract-heading')?.text;
        assert(target && !screenTextCanEditDirectly({ ...screen(controlled), javascript: "document.querySelector('#contract-heading').textContent='Next state';" }, target, parser), 'Candidate discovery bypassed JavaScript text ownership.');
      });
    }],
    ['Undo and redo emit exact native BR contents and marker creation or removal without rebuilding', () => {
      const original = '<main><h1 id="contract-heading" contenteditable="true">Original<br>human line</h1><button id="save">Keep this control</button></main>';
      const edited = '<main><h1 id="contract-heading" contenteditable="true" data-northstar-inline-text="true">Edited native copy</h1><button id="save">Keep this control</button></main>';
      const forward = canvasV2ScreenLiveEdit(screen(original), screen(edited), parser)?.edits;
      const inverse = canvasV2ScreenLiveEdit(screen(edited), screen(original), parser)?.edits;
      const redo = canvasV2ScreenLiveEdit(screen(original), screen(edited), parser)?.edits;
      assert(forward?.length === 1 && forward[0].html === 'Edited native copy' && forward[0].inlineText !== false, 'Forward editing lost the native inline patch path.');
      assert(inverse?.length === 1 && inverse[0].html === 'Original<br>human line' && inverse[0].inlineText === false, 'Undo must restore the exact original BR contents and remove the marker.');
      assert(redo?.length === 1 && redo[0].html === 'Edited native copy' && redo[0].inlineText !== false, 'Redo lost the native inline patch path.');
      assert(!inverse?.[0].html?.includes('Keep this control'), 'Inverse patch expanded to unrelated controls.');
      const markerOnly = screenInlineTextLivePatches(edited, edited.replace(' data-northstar-inline-text="true"', ''), parser);
      assert(markerOnly?.length === 1 && markerOnly[0].inlineText === false && markerOnly[0].html === 'Edited native copy', 'Marker-only undo did not request exact marker removal.');
    }],
    ['Inverse native text patches reject structural, unrelated-source and document-head changes', () => {
      const edited = '<main><h1 id="contract-heading" data-northstar-inline-text="true">Edited</h1><p id="keep">Keep this phrase</p></main>';
      const original = '<main><h1 id="contract-heading">Original<br>line</h1><p id="keep">Keep this phrase</p></main>';
      for (const unsafe of [
        original.replace('Original<br>line', '<a href="/other">A native control</a>'),
        original.replace('<h1', '<h2').replace('</h1>', '</h2>'),
        original.replace('Keep this phrase', 'An unrelated phrase changed'),
        '<head><style>h1{color:red}</style></head>' + original,
      ]) {
        assert(screenInlineTextLivePatches(edited, unsafe, parser) === undefined, 'An inverse text packet absorbed unrelated or unsafe source.');
        assert(canvasV2ScreenLiveEdit(screen(edited), screen(unsafe), parser) === undefined, 'A structural or head change bypassed the rebuild boundary.');
      }
    }],
  ];
  cases.push(
    ['Stable feedback IDs survive native history changes but reject deletion, duplicates, tag and namespace replacement', () => {
      const original='<main><h1 id="contract-feedback-title">Human title</h1><p>Sibling</p></main>',target={selector:'#contract-feedback-title',tag:'h1'} as Parameters<typeof screenFeedbackSelectionSurvives>[2];
      const edited=original.replace('Human title','A revised title').replace('<h1 id="contract-feedback-title"','<h1 style="color:purple" id="contract-feedback-title"');
      assert(screenFeedbackSelectionSurvives(original,edited,target,parser)&&screenFeedbackSelectionSurvives(edited,original,target,parser),'A stable native identity was discarded by text/style history.');
      for(const next of [original.replace('<h1 id="contract-feedback-title">Human title</h1>',''),original.replace('</main>','<h1 id="contract-feedback-title">Duplicate</h1></main>'),original.replace(/h1/g,'h2')])assert(!screenFeedbackSelectionSurvives(original,next,target,parser),'A missing, duplicate or replaced feedback identity survived.');
      const link={selector:'#contract-feedback-link',tag:'a'} as Parameters<typeof screenFeedbackSelectionSurvives>[2];
      assert(!screenFeedbackSelectionSurvives('<svg><a id="contract-feedback-link">Art link</a></svg>','<a id="contract-feedback-link">HTML link</a>',link,parser),'A cross-namespace replacement inherited old feedback selection.');
    }],
    ['Positional feedback selectors retain safe native edits and undo without accepting structural shifts', () => {
      const original='<main><p>Alpha</p><p>Beta</p></main>',target={selector:'body > main:nth-of-type(1) > p:nth-of-type(2)',tag:'p'} as Parameters<typeof screenFeedbackSelectionSurvives>[2];
      const edited='<main><p>Alpha</p><p style="color:purple">A human revised Beta</p></main>';
      assert(screenFeedbackSelectionSurvives(original,edited,target,parser)&&screenFeedbackSelectionSurvives(edited,original,target,parser),'A topology-preserving native text/style change lost its selected owner.');
      for(const next of ['<main><p>Inserted</p><p>Alpha</p><p>Beta</p></main>','<main><p>Beta</p></main>','<main><p>Alpha</p><div>Beta</div></main>'])assert(!screenFeedbackSelectionSurvives(original,next,target,parser),'A positional selector redirected after a structural change.');
    }],
    ['Reordering same-tag text siblings cannot redirect a positional feedback target', () => {
      const original='<main><p>Alpha</p><p>Beta</p></main>',reordered='<main><p>Beta</p><p>Alpha</p></main>',target={selector:'body > main:nth-of-type(1) > p:nth-of-type(2)',tag:'p'} as Parameters<typeof screenFeedbackSelectionSurvives>[2];
      assert(!screenFeedbackSelectionSurvives(original,reordered,target,parser),'A pair of leaf-text diffs was mistaken for proof that the same sibling remained selected.');
    }],
    ['Inline discovery transports actual glyph geometry and native box metrics for padded and centered text', () => {
      const html='<button id="contract-glyph-button" style="width:260px;height:64px;padding:14px 24px;border:3px solid black;font:22px Arial;line-height:normal;text-align:center">Save notebook</button><h1 id="contract-glyph-heading" style="margin:0;padding:12px 18px;font:32px Arial">A padded heading</h1><h2 id="contract-glyph-flex" style="display:flex;align-items:center;justify-content:center;height:96px;padding:14px 22px;border:2px solid black;font:22px Arial;line-height:normal">A centered label</h2>';
      withFixture(html,fixture=>{
        for(const selector of ['#contract-glyph-button','#contract-glyph-heading','#contract-glyph-flex']){
          const element=fixture.querySelector(selector)!,range=document.createRange();range.selectNodeContents(element);const glyph=range.getBoundingClientRect();
          const target=screenDirectOptionsAtPoint(document,0,0,true,selector)!.text!,transported=parseCanvasV2ScreenFeedbackTarget(target,'glyph-owner','Glyph fixture');
          assert(!!target.textRect&&!!transported.textRect,'Native glyph geometry disappeared during discovery/transport.');
          for(const coordinate of ['x','y','width','height'] as const)assert(Math.abs(target.textRect![coordinate]-glyph[coordinate])<.1&&transported.textRect![coordinate]===target.textRect![coordinate],'Transport changed glyph '+coordinate+' for '+selector);
          assert(transported.styles['padding-top']===getComputedStyle(element).paddingTop&&transported.styles['padding-left']===getComputedStyle(element).paddingLeft&&transported.styles['border-top-width']===getComputedStyle(element).borderTopWidth,'Native padding or border metrics disappeared.');
        }
        const button=screenDirectOptionsAtPoint(document,0,0,true,'#contract-glyph-button')!.text!;
        assert(button.textRect!.y>button.rect.y&&button.textRect!.x>button.rect.x,'Button glyph bounds were replaced by its outer border box.');
        const centered=screenDirectOptionsAtPoint(document,0,0,true,'#contract-glyph-flex')!.text!;
        assert(centered.styles.display==='flex'&&centered.styles['justify-content']==='center'&&centered.styles['align-items']==='center','Centered native text lost its alignment context.');
      });
    }],
    ['Whole-composition layers retain stable represented parents when selection crosses HTML and SVG', () => {
      const html='<main id="contract-composition"><h1 id="contract-heading-layer">Independent lettering</h1><span><svg id="contract-art-layer"><defs><linearGradient id="contract-hidden-definition"/></defs><g id="contract-group-layer"><path id="contract-part-layer" d="M0 0L10 10"/></g></svg></span><img id="contract-photo-layer" src="northstar-asset:photo" alt="Independent photograph"></main>';
      const fromHtml=screenEditableLayers(html,'#contract-heading-layer',parser),fromSvg=screenEditableLayers(html,'#contract-part-layer',parser);
      assert(JSON.stringify(fromHtml)===JSON.stringify(fromSvg),'Selecting a vector part changed the scope or order of the composition tree.');
      const layer=(selector:string)=>fromSvg.find(item=>item.selector===selector)!;
      assert(layer('#contract-art-layer').parentSelector==='#contract-composition'&&layer('#contract-art-layer').depth===1,'An unrepresented inline wrapper broke the actual represented parent.');
      assert(layer('#contract-part-layer').parentSelector==='#contract-group-layer'&&layer('#contract-part-layer').depth===3,'Native SVG group hierarchy was flattened.');
      assert(layer('#contract-photo-layer').parentSelector==='#contract-composition'&&!layer('#contract-hidden-definition'),'Independent poster layers or artwork definitions corrupted the layer tree.');
    }],
    ['Single SVG paint and text edits always use the SVG-capable batched runtime route', () => {
      const html='<svg viewBox="0 0 100 100"><path id="contract-path" d="M10 10L20 20"/><text id="contract-svg-text" x="10" y="40">Before</text></svg>';
      const before={...screen(html),javascript:''};
      const painted={...before,html:patchCanvasV2ScreenElement(html,'#contract-path',{styles:{fill:'#9966cc'}},parser)};
      const lettered={...before,html:patchCanvasV2ScreenElement(html,'#contract-svg-text',{text:'After'},parser)};
      for(const [after,selector] of [[painted,'#contract-path'],[lettered,'#contract-svg-text']] as const){
        const patch=canvasV2ScreenLiveEdit(before,after,parser),inverse=canvasV2ScreenLiveEdit(after,before,parser);
        assert(patch?.edits?.length===1&&patch.edits[0].selector===selector,'A single SVG change was sent to the HTML-only runtime route.');
        assert(inverse?.edits?.length===1&&inverse.edits[0].selector===selector,'SVG undo was sent to the HTML-only runtime route.');
      }
    }],
    ['A static heading stays editable despite unrelated app class/style writes and important rules', () => {
      const html='<main id="app"><h1 id="contract-title">Human title</h1><button id="contract-toggle">Toggle</button><p id="contract-status">Saved</p></main>';
      withFixture(html,()=>{
        const target=screenDirectOptionsAtPoint(document,0,0,true,'#contract-title')!.appearance!;
        const original={...screen(html),css:'#contract-toggle{color:red!important}',javascript:"document.querySelector('#contract-toggle').classList.toggle('active');document.querySelector('#contract-status').style.color='red';"};
        assert(screenAppearanceCanEditDirectly(original,target,parser),'Unrelated style ownership blocked a static heading.');
        assert(!screenAppearanceCanEditDirectly({...original,javascript:"document.querySelector('#app').classList.add('compact');"},target,parser),'Ancestor code styling was accepted as a direct edit.');
        assert(!screenAppearanceCanEditDirectly({...original,css:'#contract-title{color:red!important}'},target,parser),'The actual important target rule was ignored.');
      });
    }],
    ['Responsive container edits retain relative constraints, siblings and mounted patch compatibility', () => {
      const html='<main><section id="contract-layout" style="width:80%;display:flex"><h1>Keep typography</h1><button id="contract-control">Keep control</button></section><p id="contract-sibling">Keep sibling</p></main>';
      withFixture(html,()=>{
        const target=screenDirectOptionsAtPoint(document,0,0,true,'#contract-layout')!.appearance!;
        assert(target.styles.width==='80%','Inspection replaced the authored relative width with pixels.');
        const before={...screen(html),javascript:''};
        const after=parseCanvasV2Screen(editScreenAppearance(before,target,{width:'100%','min-width':'200px','max-width':'90vw',height:'auto','padding-left':'24px',gap:'18px',display:'grid','grid-template-columns':'repeat(2, minmax(0, 1fr))','align-items':'center'},parser));
        const doc=parser.parseFromString(after.html,'text/html'),layout=doc.querySelector<HTMLElement>('#contract-layout')!;
        assert(layout.style.width==='100%'&&layout.style.maxWidth==='90vw'&&layout.style.paddingLeft==='24px'&&layout.style.display==='grid','Native layout source did not retain the requested values.');
        assert(doc.querySelector('#contract-control')?.outerHTML==='<button id="contract-control">Keep control</button>'&&doc.querySelector('#contract-sibling')?.textContent==='Keep sibling','A layout edit rewrote unrelated contents.');
        assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'Responsive layout would rebuild the live application during edit or undo.');
      });
    }],
    ['SVG parts expose native scope and preserve definitions while paint, geometry and undo stay local', () => {
      const html='<main><svg id="contract-art" viewBox="0 0 100 100"><defs><linearGradient id="contract-gradient"><stop offset="0" stop-color="#ff6600"/></linearGradient></defs><g id="contract-face"><path id="contract-ear" d="M10 30 L20 10 L30 30Z" fill="url(#contract-gradient)"/><circle id="contract-eye" cx="60" cy="40" r="4"/></g><text id="contract-lettering" x="20" y="80">Hello</text></svg></main>';
      withFixture(html,()=>{
        const embedded=new Function(`return (${screenDirectOptionsAtPoint.toString()})`)() as typeof screenDirectOptionsAtPoint;
        const target=embedded(document,0,0,true,'#contract-ear')!.appearance!;
        assert(target.selector==='#contract-ear'&&target.namespace==='svg'&&target.tag==='path','Native part selection expanded to its wrapper.');
        assert(!embedded(document,0,0,true,'#contract-gradient')?.appearance,'An artwork definition became a user part.');
        const before={...screen(html),javascript:''};
        const painted=parseCanvasV2Screen(editScreenAppearance(before,target,{fill:'#bb66ee',stroke:'#112233','stroke-width':'2',opacity:'0.7',rotate:'12deg',scale:'1.1'},parser));
        const paintPatch=canvasV2ScreenLiveEdit(before,painted,parser);
        assert((paintPatch?.edits?.[0]??paintPatch)?.styles.fill==='rgb(187, 102, 238)','Paint-only change lost its selected native path patch: '+JSON.stringify(paintPatch));
        const after=parseCanvasV2Screen(editScreenAttributes(painted,target,{d:'M10 30 L18 4 L30 30Z'},parser));
        const oldDoc=parser.parseFromString(before.html,'text/html'),nextDoc=parser.parseFromString(after.html,'text/html');
        for(const selector of ['defs','#contract-eye','#contract-lettering'])assert(oldDoc.querySelector(selector)?.outerHTML===nextDoc.querySelector(selector)?.outerHTML,'A vector part edit changed '+selector);
        assert(nextDoc.querySelector<SVGElement>('#contract-ear')?.style.fill==='rgb(187, 102, 238)','Vector paint did not enter the real path source.');
        const forward=canvasV2ScreenLiveEdit(before,after,parser),inverse=canvasV2ScreenLiveEdit(after,before,parser);
        assert(forward?.edits?.[0].attributes?.d==='M10 30 L18 4 L30 30Z','Native path geometry would rebuild the app.');
        assert(inverse?.edits?.[0].attributes?.d==='M10 30 L20 10 L30 30Z'&&inverse.edits[0].styles.fill==='','Undo did not restore the original geometry and inherited gradient.');
        const layers=screenEditableLayers(html,'#contract-ear',parser);
        assert(layers.some(layer=>layer.selector==='#contract-face')&&layers.some(layer=>layer.selector==='#contract-eye')&&!layers.some(layer=>layer.selector==='#contract-gradient'),'Layer list lost parts or exposed definitions.');
      });
    }],
    ['Native SVG text remains literal source and uses live text patches in both history directions', () => {
      const html='<svg viewBox="0 0 200 100"><text id="contract-lettering" x="20" y="50">Hello</text><path id="contract-mark" d="M0 0L20 20"/></svg>';
      withFixture(html,()=>{
        const target=screenDirectOptionsAtPoint(document,0,0,true,'#contract-lettering')!.text!;
        const before={...screen(html),javascript:''};
        assert(screenTextCanEditDirectly(before,target,parser),'Native SVG lettering was blocked as raster art.');
        const after=parseCanvasV2Screen(editScreenText(before,target,'Human <lettering> & art',parser));
        assert(parser.parseFromString(after.html,'text/html').querySelector('#contract-lettering')?.textContent==='Human <lettering> & art','Vector text became executable markup.');
        const forward=canvasV2ScreenLiveEdit(before,after,parser),inverse=canvasV2ScreenLiveEdit(after,before,parser);
        assert((forward?.edits?.[0]??forward)?.text==='Human <lettering> & art'&&(inverse?.edits?.[0]??inverse)?.text==='Hello','Native SVG lettering edits or undo lost their exact native text packets.');
      });
    }],
    ['Poster crop and image replacement preserve independent lettering, logos and retained source bindings', () => {
      const html='<main data-northstar-layer="Campaign"><h1 id="contract-poster-title">Keep moving</h1><img id="contract-photo" src="northstar-asset:photo" alt="Campaign photograph" style="width:300px;height:200px;object-fit:cover"><svg id="contract-logo" viewBox="0 0 100 40"><path d="M0 0 L30 30"/></svg></main>';
      withFixture(html,()=>{
        const target=screenDirectOptionsAtPoint(document,0,0,true,'#contract-photo')!.appearance!;
        const before={...screen(html),javascript:'',referenceAssetIds:['photo']};
        const cropped=parseCanvasV2Screen(editScreenAppearance(before,target,{'object-fit':'cover','object-position':'25% 75%'},parser));
        const asset={id:'replacement',url:'data:image/png;base64,YQ==',label:'Replacement image',mediaType:'image' as const};
        const after=parseCanvasV2Screen(replaceScreenAsset(cropped,{selector:target.selector,property:'src',label:target.label,fit:'cover',rect:{x:0,y:0,width:300,height:200}},asset,[asset,{...asset,id:'photo'}],parser));
        const original=parser.parseFromString(html,'text/html'),doc=parser.parseFromString(after.html,'text/html');
        for(const selector of ['#contract-poster-title','#contract-logo'])assert(original.querySelector(selector)?.outerHTML===doc.querySelector(selector)?.outerHTML,'Image edit flattened an independent poster layer.');
        assert(doc.querySelector<HTMLImageElement>('#contract-photo')?.style.objectPosition==='25% 75%','Replacement discarded the human crop.');
        assert(after.referenceAssetIds.includes('photo')&&after.referenceAssetIds.includes('replacement'),'Retained image lineage was lost.');
        assert(screenAssetLivePatches(cropped,after,parser)?.[0].selector==='#contract-photo','Poster replacement lost the native mounted image patch.');
        assert(screenEditableLayers(after.html,'#contract-photo',parser).some(layer=>layer.selector==='#contract-poster-title'),'Poster lettering disappeared from the source layer list.');
      });
    }],
  );
  return [...cases.map(([name, check]) => { try { check(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }), ...runNativeEditKernelContracts(), ...runDesignerContracts(), ...runHardeningContracts()];
}

export default function DirectEditContract() {
  const [checks, setChecks] = useState<Check[]>();
  const [editorOpen, setEditorOpen] = useState(false), [delayedStatus, setDelayedStatus] = useState('Not checked');
  const [commits, setCommits] = useState<Array<{ text: string; styles: Record<string, string>; expectedVersion: string | undefined; committedVersion: string }>>([]);
  const source = useRef({ version: 'contract-source-0', text: 'Original human copy', writes: 0 });
  const release = useRef<(() => void) | undefined>(undefined);
  const opening = () => {
    source.current = { version: 'contract-source-0', text: 'Original human copy', writes: 0 };
    release.current = undefined; setCommits([]); setDelayedStatus('Editor ready'); setEditorOpen(true);
  };
  const delayedSave = async (styles: Record<string, string>, text?: string, expectedVersion?: string): Promise<ScreenDirectResult> => {
    if (expectedVersion !== source.current.version) return { ok: false, error: 'A stale editor version reached the contract source.' };
    if (!source.current.writes) {
      setDelayedStatus('First save pending; type another draft, unmount, then release.');
      await new Promise<void>(resolve => { release.current = resolve; });
      release.current = undefined;
    }
    if (expectedVersion !== source.current.version) return { ok: false, error: 'The contract source changed while saving.' };
    source.current = { version: `contract-source-${source.current.writes + 1}`, text: text ?? source.current.text, writes: source.current.writes + 1 };
    const committedVersion = source.current.version, committedText = source.current.text;
    setCommits(current => [...current, { text: committedText, styles, expectedVersion, committedVersion }]);
    setDelayedStatus(`Committed ${source.current.writes} draft(s)`);
    return { ok: true, encoded: committedVersion };
  };
  const target = { nodeId: 'contract-only', title: 'Delayed editor fixture', selector: '#title', tag: 'h1', label: 'Original human copy', text: 'Original human copy', rect: { x: 10, y: 10, width: 200, height: 60 }, styles: { color: 'rgb(30, 20, 40)', 'background-color': 'transparent', 'font-family': 'Arial, sans-serif', 'font-size': '40px', 'font-weight': '400', 'font-style': 'normal', 'line-height': 'normal', 'text-align': 'left', translate: 'none' } };
  const passed = checks?.filter(check => check.passed).length ?? 0;
  return <main style={{ minHeight: '100vh', padding: 32, background: '#17141e', color: '#f5effb', fontFamily: 'system-ui' }}>
    <h1>Direct edit DOM contracts</h1>
    <p>Deterministic helper verification. These checks do not evaluate design quality or live model behavior.</p>
    <button type="button" onClick={() => setChecks(runChecks())} style={{ padding: '12px 18px', background: '#d6c7ff', color: '#21182e', border: 0, borderRadius: 8 }}>Run direct edit contracts</button>
    <p role="status">{checks ? `${passed}/${checks.length} contracts passed` : 'Not checked'}</p>
    <pre data-testid="direct-edit-contract-results" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{checks ? JSON.stringify({ passed: passed === checks.length, total: checks.length, checks }, null, 2) : ''}</pre>
    <section style={{ maxWidth: 700, borderTop: '1px solid #61546f', paddingTop: 24 }}>
      <h2>Delayed editor unmount contract</h2>
      <p>Open the editor. Type a first draft and wait for its save to pause. Type a second draft, unmount the editor, release the first save, then flush the handoff. Both commits must appear, and the second must use contract-source-1.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }} data-canvas-v2-direct-editing="true">
        <button type="button" disabled={editorOpen} onClick={opening}>Open delayed-save editor</button>
        <button type="button" onClick={() => setEditorOpen(false)}>Unmount delayed-save editor</button>
        <button type="button" onClick={() => release.current?.()}>Release pending editor save</button>
        <button type="button" onClick={() => { void flushScreenDirectEdits().then(() => setDelayedStatus(`Handoff drained ${source.current.writes} draft(s)`)).catch(error => setDelayedStatus(error instanceof Error ? error.message : String(error))); }}>Flush delayed-save handoff</button>
      </div>
      <p role="status">{delayedStatus}</p>
      <pre data-testid="delayed-edit-contract-results" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify({ editorOpen, commits }, null, 2)}</pre>
    </section>
    {editorOpen && <ScreenAppearanceEditor target={target} position={{ x: 0, y: 96 }} docked textValue="Original human copy" sourceVersion="contract-source-0" onSave={delayedSave} onCancel={() => setEditorOpen(false)} />}
    <ThreeFamilyFixture />
    <StudioHandoffFixture />
    <CaptureCloneContracts />
  </main>;
}
