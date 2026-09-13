import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['worker/main.ts'], outfile: 'worker/dist/worker.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  sourcemap: false, legalComments: 'eof',
});
