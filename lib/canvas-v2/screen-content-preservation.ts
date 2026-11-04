/** Conservative source-content protection for accessibility remediation.
 * This measures retained strings/relationships, not educational meaning or paint. */
export interface ScreenContentInventory {
  version:1;
  tokens:string[];
  blocks:string[];
  links:Array<{destination:string;label:string}>;
  images:string[];
  tableRows:string[][];
}
export interface ScreenContentPreservation {
  status:'preserved'|'changed';
  basis:'source-content-comparison';
  missingTokens:number;
  missingBlocks:number;
  missingLinks:number;
  missingImages:number;
  missingTableRows:number;
  changedExamples?:string[];
  baselineCounts:{tokens:number;blocks:number;links:number;images:number;tableRows:number};
  note:string;
}
const normalize=(text:string)=>text.normalize('NFC').replace(/\s+/gu,' ').trim();
export function screenContentInventory(html:string,parser:DOMParser):ScreenContentInventory {
  if(html.length>128000)throw Error('Course content exceeds the guarded screen size.');
  const document=parser.parseFromString(html,'text/html');
  document.querySelectorAll('script,style,template,noscript').forEach(element=>element.remove());
  const read=(node:Node):string=>{
    if(node.nodeType===3)return node.textContent??'';
    if(node.nodeType!==1)return '';
    const tag=(node as Element).localName;if(tag==='br')return ' ';
    const content=[...node.childNodes].map(read).join('');
    return /^(p|li|dd|dt|div|section|article|header|footer|main|nav|h[1-6]|caption|th|td|tr|table|ul|ol|figure|figcaption|label)$/.test(tag)?' '+content+' ':content;
  };
  const text=(element:Element)=>normalize(read(element));
  return {version:1,tokens:text(document.body).split(' ').filter(Boolean),
    blocks:[...document.body.querySelectorAll('p,li,dd,h1,h2,h3,h4,h5,h6,caption,th,td,label')].filter(element=>!element.querySelector('p,li,dd,dl,table,ul,ol,h1,h2,h3,h4,h5,h6,section,article,div')).map(text).filter(Boolean),
    links:[...document.body.querySelectorAll('a[href]')].map(element=>({destination:(element.getAttribute('href')??'').trim(),label:text(element)})),
    images:[...document.body.querySelectorAll('img[src]')].map(element=>(element.getAttribute('src')??'').trim()),
    // Image/layout tables are protected by text and asset checks; do not treat
    // their layout cells as assessment relationships. Data-table rows stay paired.
    tableRows:[...document.body.querySelectorAll('table')].filter(table=>!table.querySelector('img')).flatMap(table=>[...table.rows].map(row=>[...row.cells].map(text).filter(Boolean))).filter(row=>row.length>1)};
}
function missing<T>(before:readonly T[],after:readonly T[],key:(value:T)=>string){
  const counts=new Map<string,number>();for(const value of after){const id=key(value);counts.set(id,(counts.get(id)??0)+1);}
  return before.filter(value=>{const id=key(value),count=counts.get(id)??0;if(!count)return true;counts.set(id,count-1);return false;}).length;
}
export function compareScreenContent(before:ScreenContentInventory,after:ScreenContentInventory):ScreenContentPreservation {
  const missingTokens=missing(before.tokens,after.tokens,value=>value);
  // Block matching tolerates new wrappers/headings but retains each original
  // passage intact. Changes/splits needing interpretation stay human decisions.
  const afterText=after.tokens.join(' ');
  const missingPassages=before.blocks.filter(block=>!afterText.includes(block)),missingBlocks=missingPassages.length;
  const missingLinks=missing(before.links,after.links,link=>JSON.stringify(link));
  const missingImages=missing(before.images,after.images,value=>value);
  const missingTableRows=missing(before.tableRows,after.tableRows,row=>JSON.stringify(row));
  return {status:missingTokens||missingBlocks||missingLinks||missingImages||missingTableRows?'changed':'preserved',basis:'source-content-comparison',missingTokens,missingBlocks,missingLinks,missingImages,missingTableRows,changedExamples:missingPassages.slice(0,3).map(text=>text.slice(0,300)),
    baselineCounts:{tokens:before.tokens.length,blocks:before.blocks.length,links:before.links.length,images:before.images.length,tableRows:before.tableRows.length},
    note:'Checks original source words, intact leaf passages, link destinations/labels, image handles and data-table row relationships. Added content is permitted. Script-generated content is outside this source inventory. This does not prove teaching meaning, correct image descriptions, CSS visibility or working destinations; rendered and human review remain required.'};
}
export function requireScreenContentPreserved(before:ScreenContentInventory,after:ScreenContentInventory){
  const result=compareScreenContent(before,after);
  if(result.status!=='preserved')throw Error(`Accessibility repair would change protected course content (${result.missingTokens} words, ${result.missingBlocks} passages, ${result.missingLinks} links, ${result.missingImages} images, ${result.missingTableRows} table rows missing or changed). Preserve the original content and relationships; request explicit content changes separately. Nothing was committed.${result.changedExamples?.length?' Check original passage: '+JSON.stringify(result.changedExamples):''}`);
  return result;
}
