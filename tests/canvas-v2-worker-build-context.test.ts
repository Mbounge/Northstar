import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function allowedSourceFiles(): Set<string> {
  const patterns = readFileSync(join(root, '.dockerignore'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  assert.equal(patterns[0], '**', 'worker source context must default to excluding files');
  assert(patterns.slice(1).every(line => line.startsWith('!')), 'review changes to the narrow Docker source allowlist explicitly');
  const files = new Set<string>();
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.add(relative(root, path));
    }
  };
  for (const line of patterns.slice(1)) {
    const path = line.slice(1);
    if (path.endsWith('/**')) walk(join(root, path.slice(0, -3)));
    else if (!path.endsWith('/')) {
      assert(!['?', '*', '['].some(character => path.includes(character)), 'review any new source wildcard before expanding the worker context');
      files.add(path);
    }
  }
  return files;
}

test('worker Docker source context stays narrow and includes every declared COPY source', () => {
  const files = allowedSourceFiles();
  const sensitive = [...files].filter(path => path.split('/').some(part => /^\.env(?:\.|$)|^\.git$|^node_modules$|^outputs$|^profiles?$|^\.vercel$|goodlife-campaign/i.test(part)));
  assert.deepEqual(sensitive, [], 'credentials, account snapshots and generated campaign artifacts cannot enter the source context');
  const sources = readFileSync(join(root, 'worker/Dockerfile'), 'utf8').split(/\r?\n/)
    .filter(line => line.startsWith('COPY ') && !line.startsWith('COPY --from='))
    .flatMap(line => line.trim().split(/\s+/).slice(1, -1));
  for (const source of sources) {
    assert([...files].some(path => path === source || path.startsWith(`${source}/`)), `${source} is excluded by .dockerignore`);
  }
});

test('worker builds from its declared source context and worker dependencies without app node_modules', {
  skip: !existsSync(join(root, 'worker/node_modules/esbuild')) && 'Run npm ci --prefix worker to verify the independent worker package.',
}, () => {
  const context = mkdtempSync(join(tmpdir(), 'northstar-worker-build-test-'));
  try {
    for (const path of allowedSourceFiles()) {
      mkdirSync(dirname(join(context, path)), { recursive: true });
      copyFileSync(join(root, path), join(context, path));
    }
    // Docker installs only worker/package-lock.json. Do not expose the app's
    // dependencies: that previously hid an undeclared Next/Acorn dependency.
    symlinkSync(join(root, 'worker/node_modules'), join(context, 'worker/node_modules'), 'dir');
    const result = spawnSync(process.execPath, ['worker/build.mjs'], { cwd: context, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert(existsSync(join(context, 'worker/dist/worker.mjs')));
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
});
