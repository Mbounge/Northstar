/** Build a standalone real-DOM probe from the actual private toolbar callbacks.
 * Execute with node; serve the output and inspect #designer-range-results in
 * Chrome. No product/model/account calls and no source implementation copied. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const file='components/canvas-v2/rich-text-toolbar.tsx',source=await readFile(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();
const walk=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['command','setSize'].includes(node.name.text))declarations.set(node.name.text,node.getText(tree));ts.forEachChild(node,walk)};walk(tree);
if(declarations.size!==2)throw Error('Actual toolbar callbacks unavailable');
const script=`
const results=[];
for(const original of ['ordinary','xxx-large']){
 const editable=document.createElement('div');editable.contentEditable='true';editable.style.cssText='font-size:28px;width:800px';
 editable.innerHTML=original==='ordinary'?'First phrase and second phrase.':'<span style="font-size:xxx-large">First phrase and second phrase.</span>';document.body.append(editable);
 const leaf=editable.firstChild.nodeType===3?editable.firstChild:editable.firstChild.firstChild;
 const before=getComputedStyle(leaf.parentElement).fontSize;
 const selected=document.createRange();selected.setStart(leaf,0);selected.setEnd(leaf,12);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(selected);
 const range={current:selected.cloneRange()},setMenu=()=>{};
 const ${declarations.get('command')};const ${declarations.get('setSize')};
 setSize('24');
 const walker=document.createTreeWalker(editable,4),selectedSizes=new Set(),tailSizes=new Set();let offset=0;
 for(let text=walker.nextNode();text;text=walker.nextNode()){
  const size=getComputedStyle(text.parentElement).fontSize;
  for(let index=0;index<text.textContent.length;index++)(offset+index<12?selectedSizes:tailSizes).add(size);
  offset+=text.textContent.length;
 }
 const detail={original,before,selectedSizes:[...selectedSizes],tailSizes:[...tailSizes],html:editable.innerHTML};
 const passed=selectedSizes.size===1&&selectedSizes.has('24px')&&tailSizes.size===1&&tailSizes.has(before)&&editable.textContent==='First phrase and second phrase.';
 results.push({name:'Only selected range changes from '+original,passed,detail});editable.remove();
}
const pre=document.createElement('pre');pre.id='designer-range-results';pre.textContent=JSON.stringify({passed:results.filter(result=>result.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(result=>result.passed)?'PASS range formatting':'FAIL range formatting';
`;
const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const out='outputs/designer-release-verification-20261020/dom';await mkdir(out,{recursive:true});await writeFile(out+'/range.html','<!doctype html><html><head><meta charset="utf-8"><title>Actual toolbar range probe</title></head><body><script>'+code.replaceAll('</script','<\\/script')+'</script></body></html>');
