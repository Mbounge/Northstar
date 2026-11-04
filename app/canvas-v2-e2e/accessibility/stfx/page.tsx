import {notFound} from 'next/navigation';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {StfxCourseDemo} from './demo';
export const dynamic='force-dynamic';
export default async function StfxPublicCourseProof(){
  if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
  const directory=join(process.cwd(),'outputs/stfx-public-course-20261104');
  const [raw,book,chart]=await Promise.all([readFile(join(directory,'original.html')),readFile(join(directory,'text.jpg')),readFile(join(directory,'marking.jpg'))]);
  return <StfxCourseDemo source={new TextDecoder('windows-1252').decode(raw)} images={[book,chart].map(image=>'data:image/jpeg;base64,'+image.toString('base64'))}/>;
}
