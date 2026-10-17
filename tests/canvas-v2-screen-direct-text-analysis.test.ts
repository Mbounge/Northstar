import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyzeScreenTextMutations } from '../lib/canvas-v2/screen-direct-text-analysis';

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
