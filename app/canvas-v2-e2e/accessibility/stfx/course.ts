import type {CanvasV2InteractiveScreen} from '@/lib/canvas-v2/interactive-screen';
export const STFX_COURSE_SOURCE='https://people.stfx.ca/mvanbomm/stat101/outline.html';
export const STFX_COURSE_ASSETS=['stfx-stat101-book','stfx-stat101-evaluation'];

/** Local research specimen. Sanitizes captured public source; never executes
 * third-party scripts or represents this historical course as current. */
export function stfxCourseScreens(source:string,parser:DOMParser){
  const original=parser.parseFromString(source,'text/html');
  original.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(element=>element.remove());
  for(const element of original.body.querySelectorAll('*'))for(const attribute of [...element.attributes])if(/^on/i.test(attribute.name))element.removeAttribute(attribute.name);
  for(const image of original.body.querySelectorAll('img')){
    const filename=new URL(image.getAttribute('src')??'',STFX_COURSE_SOURCE).pathname.split('/').at(-1);
    if(filename!=='text.jpg'&&filename!=='marking.jpg')throw Error('Unexpected source image; review its provenance before importing.');
    image.src='northstar-asset:'+(filename==='text.jpg'?STFX_COURSE_ASSETS[0]:STFX_COURSE_ASSETS[1]);
  }
  const before:CanvasV2InteractiveScreen={version:1,title:'STAT 101:11 · historical public outline',device:'none',width:960,height:800,html:original.body.innerHTML,css:'body{margin:8px;background:#fff;color:#000}a{color:#0000ff}a:visited{color:#800080}',javascript:'',referenceAssetIds:[...STFX_COURSE_ASSETS]};
  const repaired=parser.parseFromString(before.html,'text/html');
  for(const font of repaired.body.querySelectorAll('font'))font.replaceWith(...font.childNodes);
  const heading=repaired.body.querySelector('h2');
  if(!heading)throw Error('Course title not found.');
  const title=repaired.createElement('h1');title.innerHTML=heading.innerHTML;heading.replaceWith(title);
  for(const center of repaired.body.querySelectorAll('center')){const header=repaired.createElement('header');header.className='course-heading';header.append(...center.childNodes);center.replaceWith(header);}
  for(const professor of repaired.body.querySelectorAll('h3')){const details=repaired.createElement('p');details.className='instructor';details.innerHTML=professor.innerHTML;professor.replaceWith(details);}
  for(const dd of repaired.body.querySelectorAll('dd')){const paragraph=repaired.createElement('p');paragraph.innerHTML=dd.innerHTML;dd.replaceWith(paragraph);}
  for(const label of repaired.body.querySelectorAll('b')){
    if(label.closest('table'))continue;
    const heading=repaired.createElement('h2');heading.innerHTML=label.innerHTML;label.replaceWith(heading);
  }
  // Replace the image-based layout table, preserving every textual cell, link
  // and original image. The chart description was checked against its pixels.
  const layout=[...repaired.body.querySelectorAll('table')].find(table=>table.querySelector('img'));
  if(!layout)throw Error('Expected textbook and assessment resources were not found.');
  const cells=[...layout.querySelectorAll('td')].filter(cell=>(cell.textContent??'').replace(/\s+/g,' ').trim()&&!cell.querySelector('img'));
  const bookLink=layout.querySelector('a'),chart=layout.querySelector(`img[src="northstar-asset:${STFX_COURSE_ASSETS[1]}"]`);
  if(!bookLink||!chart)throw Error('Original course resources are incomplete.');
  const materials=repaired.createElement('div');materials.className='course-materials';
  const reading=repaired.createElement('section');reading.innerHTML='<h2>Text:</h2>';
  const book=bookLink.cloneNode(true) as HTMLAnchorElement;book.rel='noopener noreferrer';book.querySelector('img')!.alt='Introductory Statistics, Canadian Edition, Gould et al., Pearson, 2017.';
  reading.append(book);
  for(const cell of cells){if(['Text:','Evaluation:'].includes((cell.textContent??'').trim()))continue;const line=repaired.createElement('p');line.innerHTML=cell.innerHTML;reading.append(line);}
  const assessment=repaired.createElement('section');assessment.innerHTML='<h2>Evaluation:</h2>';
  const image=chart.cloneNode(true) as HTMLImageElement;image.alt='Assessment breakdown: Daily Questions 5%, Homework 10%, Tests (3) 40%, Final Exam 45%.';assessment.append(image);
  const transcript=repaired.createElement('p');transcript.className='assessment-transcript';transcript.textContent='Daily Questions: 5% · Homework: 10% · Tests (3): 40% · Final Exam: 45%';assessment.append(transcript);
  materials.append(reading,assessment);layout.replaceWith(materials);
  for(const list of repaired.body.querySelectorAll('ul')){
    const loose=[...list.childNodes].filter(node=>node.nodeType!==1||(node as Element).localName!=='li');
    if(loose.some(node=>(node.textContent??'').trim())){const item=repaired.createElement('li');list.insertBefore(item,loose[0]);for(const node of loose)item.append(node);}
  }
  for(const table of repaired.body.querySelectorAll('table')){
    for(const row of table.rows)for(const cell of [...row.cells])if(!(cell.textContent??'').replace(/\s+/g,' ').trim())cell.remove();
    const caption=repaired.createElement('caption');caption.textContent='Course topics';table.prepend(caption);
    const head=table.createTHead();head.innerHTML='<tr><th scope="col">Chapters 1–5</th><th scope="col">Chapters 6–9</th></tr>';
  }
  const main=repaired.createElement('main');main.id='course-content';main.append(...repaired.body.childNodes);repaired.body.append(main);
  for(const [index,heading] of [...main.querySelectorAll('h2')].entries())heading.id='course-section-'+index;
  const site=repaired.createElement('header');site.className='site-heading';site.innerHTML='<strong>StFX</strong><span>Historical course outline · Fall 2019</span>';
  const skip=repaired.createElement('a');skip.className='skip';skip.href='#course-content';skip.textContent='Skip to course content';
  const nav=repaired.createElement('nav');nav.setAttribute('aria-label','Course sections');
  for(const heading of main.querySelectorAll('h2'))if(/^(Schedule:|Course Description:|Evaluation:|Office Hours)$/.test(heading.textContent??'')){const link=repaired.createElement('a');link.href='#'+heading.id;link.textContent=heading.textContent;nav.append(link);}
  repaired.body.prepend(skip,site,nav);
  const after:CanvasV2InteractiveScreen={...before,language:'en',html:repaired.body.innerHTML,css:`*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:#fafaf8;color:#001b40;font:17px/1.6 Calibri,Arial,sans-serif;overflow-wrap:anywhere}.site-heading{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;background:#001b40;color:#fff;padding:20px max(24px,calc((100% - 820px)/2));font-size:13px}.site-heading strong{font-size:21px}.site-heading span{color:#fff}nav{display:flex;gap:20px;flex-wrap:wrap;max-width:868px;margin:auto;padding:16px 24px;border-bottom:2px solid #d5a845}a{color:#001b40;text-decoration:underline;text-underline-offset:4px}main{max-width:868px;margin:0 auto;padding:28px 24px 64px}h1{font:700 36px/1.2 Garamond,Georgia,serif;margin:0 0 16px}h2{font-size:21px;line-height:1.3;margin:32px 0 12px;scroll-margin-top:20px}.course-heading{text-align:left;border-bottom:1px solid #cdd4dc;padding-bottom:22px}.instructor{margin:0;color:#24415f}p{margin:10px 0 18px}li{margin:8px 0}ul{padding-left:24px}.course-materials{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px}.course-materials img{max-width:100%;height:auto;display:block;margin:12px 0}.course-materials section p{margin:2px 0}.assessment-transcript{font-size:15px;line-height:1.6}table{width:100%;table-layout:fixed;border-collapse:collapse;margin:16px 0 28px;font-size:15px}caption{text-align:left;font-weight:700;margin-bottom:10px}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #cdd4dc}th{background:#edf0f3}:focus-visible{outline:3px solid #8a4a00;outline-offset:4px}.skip{position:absolute;top:-100px;left:12px;background:white;padding:10px}.skip:focus{top:10px}@media(max-width:600px){.course-materials{grid-template-columns:1fr;gap:12px}h1{font-size:30px}main{padding:22px 18px 48px}nav{gap:12px;font-size:15px;padding:14px 18px}table{font-size:14px}th,td{padding:8px}}`};
  return {before,after};
}
