import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['worker/main.ts'], outfile: 'worker/dist/worker.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  // Shared text analysis uses Next's bundled parser in the application. The
  // standalone worker builds without Next; pin the same parser independently.
  alias: { 'next/dist/compiled/acorn': fileURLToPath(new URL('./node_modules/acorn/dist/acorn.mjs', import.meta.url)) },
  sourcemap: false, legalComments: 'eof',
});
