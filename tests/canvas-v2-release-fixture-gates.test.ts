import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const pages = ['chat-history-reuse', 'direct-edit-contract', 'layers-window', 'warm-revisit', 'snapshot-transport', 'presentation-cache', 'human-multiplayer', 'codex', 'codex-subagent'];
for (const page of pages) test(`${page} fixture cannot render in production even if E2E is accidentally enabled`, async () => {
  const source = readFileSync(new URL(`../app/canvas-v2-e2e/${page}/page.tsx`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const flag of [undefined, '1']) {
    const notFound = new Error('EXPECTED_NOT_FOUND');
    const exports: { default?: (props: unknown) => unknown } = {};
    vm.runInNewContext(code, { exports, process: { env: { NODE_ENV: 'production', NORTHSTAR_E2E: flag } }, require: (name: string) => {
      if (name === 'next/navigation') return { notFound: () => { throw notFound; } };
      if (name === 'react/jsx-runtime') return { jsx: () => { throw new Error('Production reached fixture rendering.'); }, jsxs: () => { throw new Error('Production reached fixture rendering.'); } };
      // Fixture dependencies have no authority to decide the page gate. A page
      // must reject before it reads account data, renders, or invokes them.
      return {};
    } });
    await assert.rejects(Promise.resolve().then(() => exports.default!({ searchParams: Promise.resolve({}) })), error => error === notFound, `NORTHSTAR_E2E=${flag}`);
  }
});
