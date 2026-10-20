export interface ScreenPathSegment {command:'M'|'L'|'C'|'Q'|'A'|'Z';values:number[]}
const arity:Record<string,number>={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
/** Normalize absolute coordinates without flattening Béziers or elliptical arcs. */
export function parseScreenVectorPath(d:string):ScreenPathSegment[]{
 if(typeof d!=='string'||!d.trim()||d.length>12000)throw Error('Use a bounded SVG path.');
 const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];
 if(d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+/g,''))throw Error('Invalid path characters.');
 const segments:ScreenPathSegment[]=[];let i=0,command='',x=0,y=0,sx=0,sy=0,last='',cx=0,cy=0,qx=0,qy=0;
 while(i<tokens.length){if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];if(!command||!(command.toUpperCase()in arity)||!segments.length&&command.toUpperCase()!=='M')throw Error('A path starts with a move command.');const upper=command.toUpperCase(),relative=command!==upper,count=arity[upper];if(upper==='Z'){segments.push({command:'Z',values:[]});x=sx;y=sy;last='Z';command='';continue}if(i+count>tokens.length)throw Error('Incomplete path command.');const v=tokens.slice(i,i+count).map(Number);if(v.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('Use finite path coordinates.');i+=count;const ox=x,oy=y,point=(a:number,b:number)=>[a+(relative?ox:0),b+(relative?oy:0)];let out:ScreenPathSegment;
 if(upper==='M'||upper==='L'){[x,y]=point(v[0],v[1]);out={command:upper,values:[x,y]};if(upper==='M'){sx=x;sy=y;command=relative?'l':'L'}}
 else if(upper==='H'){x=v[0]+(relative?ox:0);out={command:'L',values:[x,y]}}
 else if(upper==='V'){y=v[0]+(relative?oy:0);out={command:'L',values:[x,y]}}
 else if(upper==='C'||upper==='S'){const p1=upper==='C'?point(v[0],v[1]):['C','S'].includes(last)?[2*ox-cx,2*oy-cy]:[ox,oy],p2=upper==='C'?point(v[2],v[3]):point(v[0],v[1]),end=upper==='C'?point(v[4],v[5]):point(v[2],v[3]);[cx,cy]=p2;[x,y]=end;out={command:'C',values:[...p1,...p2,...end]}}
 else if(upper==='Q'||upper==='T'){const control=upper==='Q'?point(v[0],v[1]):['Q','T'].includes(last)?[2*ox-qx,2*oy-qy]:[ox,oy],end=upper==='Q'?point(v[2],v[3]):point(v[0],v[1]);[qx,qy]=control;[x,y]=end;out={command:'Q',values:[...control,...end]}}
 else{if(v[0]<0||v[1]<0||![0,1].includes(v[3])||![0,1].includes(v[4]))throw Error('Use nonnegative arc radii and binary flags.');[x,y]=point(v[5],v[6]);out={command:'A',values:[...v.slice(0,5),x,y]}}
 if(out.values.some(n=>Math.abs(n)>1e6))throw Error('Use finite path coordinates within one million units.');segments.push(out);last=upper;if(segments.length>1000)throw Error('Keep artwork within 1000 path segments.');
 }return segments;
}
export function serializeScreenVectorPath(segments:readonly ScreenPathSegment[]):string{const output=segments.map(s=>s.command+s.values.map(n=>{if(!Number.isFinite(n)||Math.abs(n)>1e6)throw Error('Use finite path coordinates.');return Math.round(n*10000)/10000}).join(' ')).join(' ');parseScreenVectorPath(output);for(const s of segments)if(s.values.length!==arity[s.command]||s.command==='A'&&(![0,1].includes(s.values[3])||![0,1].includes(s.values[4])))throw Error('Invalid path command values.');return output;}
export function screenVectorPathNodes(segments:readonly ScreenPathSegment[]):Array<{segment:number;index:number;x:number;y:number;kind:'anchor'|'handle'}>{return segments.flatMap((s,segment)=>s.command==='Z'?[]:(s.command==='A'?[5]:Array.from({length:s.values.length/2},(_,i)=>i*2)).map(index=>({segment,index,x:s.values[index],y:s.values[index+1],kind:index===s.values.length-2?'anchor' as const:'handle' as const})));}
