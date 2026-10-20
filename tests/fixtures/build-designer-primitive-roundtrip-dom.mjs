/** Bundle actual compiler plus the unmodified Workspace table-control callbacks. */
import {readFile,writeFile,mkdir}from'node:fs/promises';
import ts from'typescript';
import{build}from'esbuild';
const path='components/canvas-v2/canvas-v2-workspace.tsx',source=await readFile(path,'utf8'),tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),declarations=new Map();
const walk=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['selectedTable','editTable'].includes(node.name.text))declarations.set(node.name.text,node.getText(tree));ts.forEachChild(node,walk)};walk(tree);
if(declarations.size!==2)throw Error('Actual Workspace table callbacks unavailable');
const factory=ts.transpileModule(`const WORKSPACE_TABLE_ACTIONS=(engine,selectedElement,canvasV2NativeTableRows,submitMutation,setSelectedElements,setSelectionTarget)=>{const ${declarations.get('selectedTable')};const ${declarations.get('editTable')};return{selectedTable,editTable}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const out='outputs/crop-authority-verification-20261020/dom';await mkdir(out,{recursive:true});
const result=await build({entryPoints:['tests/fixtures/designer-primitive-roundtrip-dom.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'chrome120',tsconfig:'tsconfig.json',banner:{js:factory}});
await writeFile(out+'/primitives.html','<!doctype html><html><head><meta charset="utf-8"><title>Primitive family roundtrip</title></head><body><script type="module">'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></body></html>');
