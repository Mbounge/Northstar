/** Rebuild the pinned, offline iframe library. Install three@0.180.0 and
 * esbuild@0.25.10 in an isolated tooling directory, then pass that directory.
 * No package/network fetch occurs in this script or in the prototype runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const tooling=path.resolve(process.argv[2]||'.');
const webgpu=process.argv[3]==='webgpu';
const prefix=webgpu?'three-webgpu-runtime':'three-runtime';
const require=createRequire(path.join(tooling,'package.json'));
const threeRoot=path.resolve(path.dirname(require.resolve('three')),'..');
const version=JSON.parse(await fs.readFile(path.join(threeRoot,'package.json'),'utf8')).version;
const esbuild=require('esbuild');
if(version!=='0.180.0'||esbuild.version!=='0.25.10')throw Error('Use pinned three@0.180.0 and esbuild@0.25.10.');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'northstar-three-build-'));
try {
  let loader=await fs.readFile(path.join(threeRoot,'examples/jsm/loaders/GLTFLoader.js'),'utf8');
  loader=loader.replace("from '../utils/BufferGeometryUtils.js'",`from ${JSON.stringify(path.join(threeRoot,'examples/jsm/utils/BufferGeometryUtils.js'))}`);
  const begin=loader.indexOf('\t\tif ( typeof createImageBitmap'),end=loader.indexOf('\n\t\tthis.textureLoader.setCrossOrigin',begin);
  if(begin<0||end<0)throw Error('Pinned texture-loader source no longer matches.');
  loader=loader.slice(0,begin)+'\t\t// Northstar local-only texture decoding: img-src data:; never fetch or blob URLs.\n\t\tthis.textureLoader = new TextureLoader( this.options.manager );\n'+loader.slice(end);
  const blob="isObjectURL = true;\n\t\t\t\tconst blob = new Blob( [ bufferView ], { type: sourceDef.mimeType } );\n\t\t\t\tsourceURI = URL.createObjectURL( blob );";
  if(!loader.includes(blob))throw Error('Pinned embedded-image source no longer matches.');
  loader=loader.replace(blob,"const bytes = new Uint8Array(bufferView), chunks = [];\n\t\t\t\tfor(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));\n\t\t\t\tsourceURI = 'data:'+sourceDef.mimeType+';base64,'+btoa(chunks.join(''));");
  await fs.writeFile(path.join(temp,'GLTFLoader.local.js'),loader);
  await fs.writeFile(path.join(temp,'entry.mjs'),`import * as THREE from '${webgpu?'three/webgpu':'three'}';\nimport {GLTFLoader} from './GLTFLoader.local.js';\nwindow.northstarThreeCore=THREE;window.northstarGLTFLoader=GLTFLoader;${webgpu?'window.northstarThreeWebGPURenderer=THREE.WebGPURenderer;':''}\n`);
  const built=await esbuild.build({entryPoints:[path.join(temp,'entry.mjs')],nodePaths:[path.join(tooling,'node_modules')],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2020',legalComments:'inline',write:false});
  const source=built.outputFiles[0].text;
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../lib/canvas-v2/vendor');
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,prefix+'-source.ts'),'// Generated pinned Three.js 0.180.0 + local-only GLTFLoader. See '+prefix+'-manifest.json.\nexport const '+(webgpu?'NORTHSTAR_THREE_WEBGPU_SOURCE':'NORTHSTAR_THREE_SOURCE')+' = '+JSON.stringify(source)+';\n');
  await fs.copyFile(path.join(threeRoot,'LICENSE'),path.join(output,'THREE-LICENSE.txt'));
  const manifest={threeVersion:version,esbuildVersion:esbuild.version,sha256:crypto.createHash('sha256').update(source).digest('hex'),bytes:Buffer.byteLength(source),license:'MIT',source:'https://github.com/mrdoob/three.js/tree/r180',localAdaptations:['Embedded GLB textures decode through TextureLoader/data URLs to preserve img-src data: and connect-src none.','No author-supplied remote code, external buffers, codecs, or texture URLs allowed.'],entryGlobals:['northstarThreeCore','northstarGLTFLoader',...(webgpu?['northstarThreeWebGPURenderer']:[])]};
  await fs.writeFile(path.join(output,prefix+'-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(manifest));
} finally {await fs.rm(temp,{recursive:true,force:true});}
