import { copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: {worker:'worker/main.ts','native-local':'worker/native-local.ts'}, outdir:'worker/dist', outExtension:{'.js':'.mjs'},
  external:['playwright-core'], bundle: true, platform: 'node', format: 'esm', target: 'node22',
  // Shared text analysis uses Next's bundled parser in the application. The
  // standalone worker builds without Next; pin the same parser independently.
  alias: { 'next/dist/compiled/acorn': fileURLToPath(new URL('./node_modules/acorn/dist/acorn.mjs', import.meta.url)) },
  sourcemap: false, legalComments: 'eof',
});

for (const script of ['blender-scene.py', 'kokoro-narration.py', 'film-r179.js', 'film-three.LICENSE.txt']) {
  await copyFile(new URL(script, import.meta.url), new URL(`./dist/${script}`, import.meta.url));
}
