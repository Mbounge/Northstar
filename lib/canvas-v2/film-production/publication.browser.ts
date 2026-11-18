import { parseExplainerPlayback } from '../explainer';
import { object, string } from '../managed-agent/protocol';
import type { NorthstarArtifact } from '../creative/types';
import type { CanvasV2EvidenceAsset } from '../types';

const formats = [
  { name:'lesson.mp4', mimeType:'video/mp4', limit:5_000_000 },
  { name:'captions.vtt', mimeType:'text/vtt', limit:36_000 },
  { name:'source.zip', mimeType:'application/zip', limit:8_000_000 },
] as const;
const textData = (value: string, mimeType: string) => 'data:'+mimeType+';base64,'+
  btoa(Array.from(new TextEncoder().encode(value),byte=>String.fromCharCode(byte)).join(''));

export async function publishCanvasFilm(raw: unknown, id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const publication = object(raw), title = string(publication.title);
  if (!/^[\da-f-]{36}$/.test(id) || publication.id !== id || !title || title.length > 62 ||
      publication.width !== 1280 || publication.height !== 720 || !Array.isArray(publication.artifacts)) throw Error('The film receipt did not match.');
  const playback = parseExplainerPlayback(publication.playback);
  if (!playback.silent && !playback.captions) throw Error('The film is missing its reviewed captions.');
  const nodeId = 'creation-'+id;
  const createdAt = new Date().toISOString();
  const artifact = (name:string,mimeType:string,dataUrl:string): NorthstarArtifact => ({
    id:`${nodeId}:${name}`,name,label:name,mimeType,dataUrl,createdAt,origin:'generated',inputAssetIds:[],
    bytes: Math.floor(dataUrl.slice(dataUrl.indexOf(',')+1).replace(/=+$/,'').length * 3/4),
  });
  const files = formats.filter(file=>!playback.silent || file.name!=='captions.vtt').map(({name,mimeType,limit})=>{
    const file = object((publication.artifacts as unknown[]).find(candidate=>object(candidate).name===name));
    const data = string(file.dataUrl), prefix = `data:${mimeType};base64,`;
    if (file.mimeType!==mimeType || !data.startsWith(prefix) || data.length > prefix.length+4*Math.ceil(limit/3) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data.slice(prefix.length))) throw Error('The publication is missing '+name+'.');
    const result = artifact(name,mimeType,data);
    if (result.bytes > limit) throw Error('The publication file exceeds the retained size limit.');
    return result;
  });
  files.push(
    artifact('transcript.txt','text/plain',textData(playback.chapters.map(beat=>`${beat.title}${beat.narration ? "\n"+beat.narration : ""}\nVisual description: ${beat.description}`).join('\n\n'),'text/plain')),
    artifact('film-review.json','application/json',textData(JSON.stringify({sourceSha256:publication.sourceSha256,narration:publication.narration,review:publication.review},null,2),'application/json')),
  );
  const video = files[0];
  const asset: CanvasV2EvidenceAsset = {
    id:video.id,label:title,url:video.dataUrl,originalUrl:video.dataUrl,authority:'inferred',mediaType:'video',mimeType:video.mimeType,
    description:playback.silent ? 'Reviewed silent film with a descriptive transcript.' : 'Reviewed film rendered from editable scenes with measured narration and captions.',
  };
  return { nodeId, title, playback, files, asset };
}
