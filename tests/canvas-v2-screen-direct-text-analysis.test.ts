import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyzeScreenTextMutations, analyzeScreenAppearanceMutations } from '../lib/canvas-v2/screen-direct-text-analysis';

function gatherJavaScript(): string {
  try {
    const encoded = readFileSync(new URL('../../../outputs/northstar-prototype-archive/2026-10-11-gather-creative-variants/original-before-alternative.encoded', import.meta.url), 'utf8');
    return JSON.parse(Buffer.from(encoded.trim(), 'base64').toString('utf8')).javascript;
  } catch {
    // Keep the regression runnable in a clean checkout where the captured
    // archive is unavailable; the real archive is used whenever present.
    return `(function(){const root=document.getElementById('gather-original');const $=s=>root.querySelector(s);function render(){$('#catalog').innerHTML='';$('#result-count').textContent='';$('#app-title').textContent='Gather'}render()})()`;
  }
}

test('Gather static heading is safe despite unrelated catalog redraws', () => {
  const result = analyzeScreenTextMutations(gatherJavaScript(), {
    selector: '#discover-view .section-row h2',
    ancestorSelectors: ['#discover-view', '#gather-original', 'body'],
  });
  assert.equal(result.safe, true);
  assert.equal(result.affected, false);
  assert.equal(result.unknown, false);
  assert.ok(result.sites.some(site => site.selector === '#catalog'));
});

test('Gather app title remains agent-backed because it is rewritten on tab changes', () => {
  const result = analyzeScreenTextMutations(gatherJavaScript(), {
    selector: '#app-title',
    ancestorSelectors: ['#gather-original', 'body'],
  });
  assert.equal(result.safe, false);
  assert.equal(result.affected, true);
  assert.equal(result.unknown, false);
  assert.ok(result.sites.some(site => site.selector === '#app-title'));
});

test('a catalog descendant remains agent-backed when the catalog container is replaced', () => {
  const result = analyzeScreenTextMutations(gatherJavaScript(), {
    selector: '#catalog .event-open',
    ancestorSelectors: ['#catalog', '#discover-view', '#gather-original', 'body'],
  });
  assert.equal(result.safe, false);
  assert.equal(result.affected, true);
  assert.ok(result.sites.some(site => site.selector === '#catalog' && site.reason.includes('innerHTML')));
});

test('dynamic and unbounded body mutations stay conservative', () => {
  const result = analyzeScreenTextMutations(`
    const root = document.getElementById('gather-original');
    const selector = window.location.hash.slice(1);
    root.querySelector(selector).textContent = 'runtime';
    document.body.replaceChildren(document.createElement('main'));
  `, {
    selector: '#discover-view .section-row h2',
    ancestorSelectors: ['#discover-view', '#gather-original', 'body'],
  });
  assert.equal(result.safe, false);
  assert.equal(result.affected, true);
  assert.equal(result.unknown, true);
  assert.ok(result.sites.some(site => site.unknown));
  assert.ok(result.sites.some(site => site.unbounded));
});

test('a literal sibling ID is proven disjoint, while a class selector remains unknown', () => {
  const sibling = analyzeScreenTextMutations(`document.querySelector('#saved-list').innerHTML = 'x';`, {
    selector: '#discover-view .section-row h2',
    ancestorSelectors: ['#discover-view', '#gather-original'],
  });
  assert.equal(sibling.safe, true);

  const classQuery = analyzeScreenTextMutations(`document.querySelector('.section-row h2').textContent = 'x';`, {
    selector: '#discover-view .section-row h2',
    ancestorSelectors: ['#discover-view', '#gather-original'],
  });
  assert.equal(classQuery.safe, false);
  assert.equal(classQuery.unknown, true);
});

const staticTarget = {
  selector: '#discover-view .section-row h2',
  ancestorSelectors: ['#discover-view', '#gather-original'],
};

test('an impure query-looking alias remains unknown', () => {
  const result = analyzeScreenTextMutations(`
    const root = document.getElementById('gather-original');
    const $ = s => { document.querySelector(s); return document.body; };
    $('#saved-list').innerHTML = 'x';
  `, staticTarget);
  assert.equal(result.safe, false);
  assert.equal(result.unknown, true);
});

test('a reassigned DOM variable cannot retain its declaration selector', () => {
  const result = analyzeScreenTextMutations(`
    let node = document.querySelector('#saved-list');
    node = document.body;
    node.innerHTML = 'x';
  `, staticTarget);
  assert.equal(result.safe, false);
  assert.equal(result.unknown, true);
  assert.ok(result.sites.some(site => site.unknown));
});

test('duplicate bindings remain unknown instead of using a global name map', () => {
  const result = analyzeScreenTextMutations(`
    const node = document.querySelector('#saved-list');
    { const node = document.querySelector('#other'); node.innerHTML = 'x'; }
  `, staticTarget);
  assert.equal(result.safe, false);
  assert.equal(result.unknown, true);
});

test('computed property writes are conservatively treated as possible text mutations', () => {
  const result = analyzeScreenTextMutations(`
    const node = document.querySelector('#saved-list');
    const property = 'textContent';
    node[property] = 'x';
  `, staticTarget);
  assert.equal(result.safe, false);
  assert.equal(result.unknown, true);
  assert.ok(result.sites.some(site => site.reason.includes('computed property')));
});

test('literal body, html, and universal queries are unbounded', () => {
  for (const selector of ['body', 'html', '*']) {
    const result = analyzeScreenTextMutations(`document.querySelector('${selector}').textContent = 'x';`, staticTarget);
    assert.equal(result.safe, false, selector);
    assert.equal(result.affected, true, selector);
    assert.equal(result.unknown, true, selector);
    assert.ok(result.sites.some(site => site.unbounded), selector);
  }
});

test('the caller can replace conservative selector heuristics with a DOM-backed relation', () => {
  const result = analyzeScreenTextMutations(`document.querySelector('.title').textContent = 'x';`, {
    selector: 'h2',
    ancestorSelectors: ['#discover-view'],
    resolveSelectorRelation: selector => selector === '.title' ? 'disjoint' : 'unknown',
  });
  assert.equal(result.safe, true);
  assert.equal(result.unknown, false);
});

test('locally shadowed document is never treated as the browser global', () => {
  const result = analyzeScreenTextMutations(`
    const realDocument = document;
    (function(document) {
      document.querySelector('#saved-list').innerHTML = 'x';
    })(realDocument);
  `, staticTarget);
  assert.equal(result.safe, false);
  assert.equal(result.unknown, true);
});

const productData = `const p=window.northstarProduct;const d=p.data||(p.data={});d.tour=d.tour||{};`;

test('static campaign headings remain editable while product records initialize and save computed fields', () => {
  const source = productData + `
    for(const [k,v] of Object.entries({name:'',email:''})) if(d.tour[k]===undefined)d.tour[k]=v;
    document.querySelector('#name').addEventListener('input',e=>{d.tour[e.target.name]=e.target.value});
    for(const k of ['name','email']) d.tour[k]=document.querySelector('#'+k).value.trim();
    Object.assign(d.tour,{name:'',email:''});
    window.scrollTo(0,0);
    document.querySelector('#greeting').textContent=d.tour.name;
  `;
  const heading = analyzeScreenTextMutations(source, {selector:'#email-title',ancestorSelectors:['#email-view']});
  assert.equal(heading.safe,true);
  assert.equal(heading.unknown,false);
  assert.equal(analyzeScreenTextMutations(source,{selector:'#greeting'}).safe,false,'the actual app-rendered greeting remains protected');
});

test('plain managed-data writes do not suppress actual style ownership', () => {
  const source = productData + `d.tour[field]='value';document.querySelector('#email-title').style.color='red';`;
  assert.equal(analyzeScreenTextMutations(source,{selector:'#email-title'}).safe,true);
  assert.equal(analyzeScreenAppearanceMutations(source,{selector:'#email-title'}).safe,false);
  assert.equal(analyzeScreenAppearanceMutations(productData+`d.tour[field]='value';`,{selector:'#email-title'}).safe,true);
});

test('DOM injection, unknown mutators and ambiguous aliases cannot turn data exemption into a DOM bypass', () => {
  for(const mutation of [
    `d.tour=document.body;`,
    `const element=document.querySelector('#email-title');d.tour=element;`,
    `d.tour=chooseRecord();`,
    `d[recordName]=document.body;`,
    `Object.assign(d,{tour:document.body});`,
    `Reflect.set(d,'tour',document.body);`,
    `mutate(d.tour);`,
    `Object.defineProperty(d,'tour',{get:()=>document.body});`,
    `Object.values(d).forEach(record=>{record.child=document.body});`,
    `Object.entries(d).forEach(pair=>{pair[1].child=document.body});`,
    `const records=[d];mutate(records);`,
    `const holder={record:d};mutate(holder);`,
    `const {tour}=d;mutate(tour);`,
    `function expose(){return d}`,
    `const expose=()=>d;`,
    `external.record=d||{};`,
    `new Bag(d);`,
    `[d.tour]=[document.body];`,
    `window.northstarProduct={data:{tour:document.body}};`,
  ]) {
    const result=analyzeScreenTextMutations(productData+mutation+`d.tour[property]='replacement';`,{selector:'#email-title'});
    assert.equal(result.safe,false,mutation);
    assert.equal(result.unknown,true,mutation);
  }
  for(const source of [
    `const d=window.northstarProduct.data;d= document.body;d[property]='replacement'`,
    `const d=window.northstarProduct.data;{const d=document.body;d[property]='replacement'}`,
    `(function(window){const d=window.northstarProduct.data;d[property]='replacement'})(otherWindow)`,
    `const d=unknownApplication.data;d[property]='replacement'`,
  ]) assert.equal(analyzeScreenTextMutations(source,{selector:'#email-title'}).safe,false,source);
});

test('replacing a nested data owner with another proven JSON record is safe, not with a nested node', () => {
  assert.equal(analyzeScreenTextMutations(productData+`d.tour={name:''};d.tour[property]='new';`,{selector:'#title'}).safe,true);
  assert.equal(analyzeScreenTextMutations(productData+`d.tour={child:document.body};d.tour.child[property]='new';`,{selector:'#title'}).safe,false);
  assert.equal(analyzeScreenTextMutations(productData+`d.tour.child=d.tour.child||{};d.tour.child[property]='new';`,{selector:'#title'}).safe,true);
});

for (const [name, body] of [
  ['catch binding', `try{throw document.querySelector('#email-title')}catch(d){d[property]='replacement'}`],
  ['destructured catch binding', `try{throw {d:document.querySelector('#email-title')}}catch({d}){d[property]='replacement'}`],
  ['destructured function parameter', `(function({d}){d[property]='replacement'})({d:document.querySelector('#email-title')})`],
  ['nested destructured parameter', `(function({inner:{d}}){d[property]='replacement'})({inner:{d:document.querySelector('#email-title')}})`],
  ['with scope', `with({d:document.querySelector('#email-title')}){d[property]='replacement'}`],
] as const) {
  test(`managed-data exemption rejects DOM alias introduced by ${name}`, async () => {
    const { runInNewContext } = await import('node:vm');
    const source = `const d=window.northstarProduct.data;${body}`;
    const target = { textContent: 'original' };
    runInNewContext(source, {
      window: { northstarProduct: { data: {} } },
      document: { querySelector: () => target },
      property: 'textContent',
    });
    assert.equal(target.textContent, 'replacement', 'the scoped receiver really writes the selected node, not the plain data record');
    const result = analyzeScreenTextMutations(source, { selector: '#email-title' });
    assert.equal(result.safe, false);
    assert.equal(result.unknown, true);
  });
}

for (const compiler of ['eval', 'Function'] as const) {
  test(`managed-data exemption fails closed when ${compiler} can replace the record`, async () => {
    const { runInNewContext } = await import('node:vm');
    const dynamic = `window.northstarProduct.data.tour=document.querySelector('#email-title')`;
    const invoke = `${compiler}(${JSON.stringify(dynamic)})${compiler === 'Function' ? '()' : ''}`;
    const source = `const d=window.northstarProduct.data;${invoke};d.tour[property]='replacement'`;
    const target = { textContent: 'original' };
    runInNewContext(source, {
      window: { northstarProduct: { data: {} } },
      document: { querySelector: () => target },
      property: 'textContent',
    });
    assert.equal(target.textContent, 'replacement');
    assert.equal(analyzeScreenTextMutations(source, { selector: '#email-title' }).safe, false);
  });
}
