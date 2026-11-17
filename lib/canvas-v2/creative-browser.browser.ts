'use client';

import { codexWorkerFetch } from './worker/transport';
import { canvasV2ScreenBoundAssets, encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from './interactive-screen';
import { readCanvasV2ScreenAssetPixels, readCanvasV2ScreenModelBytes } from './screen-asset-pixels';
import { readCanvasV2ScreenFontCss } from './screen-fonts';
import { accessibilityDigest } from './screen-accessibility.browser';
import { parseFilmInteraction } from './interactive-film';
import { isCanvasExplainerFrame, parseExplainerBeats, parseExplainerPlayback, type CanvasExplainerRender } from './explainer';
import type { CanvasV2EvidenceAsset } from './types';

const transport = codexWorkerFetch(fetch, Date.now, 'accessibility');
async function request(body: object, signal: AbortSignal) {
  const response = await transport('/api/canvas-v2/codex', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
  });
  const result = await response.json();
  if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'The authoring worker could not finish.');
  return result;
}

export async function renderCanvasExplainerFromScreen(nodeId: string, screen: CanvasV2InteractiveScreen, evidence: readonly CanvasV2EvidenceAsset[], rawBeats: unknown, rawInteraction: unknown, signal: AbortSignal) {
  const beats = parseExplainerBeats(rawBeats);
  const interaction = rawInteraction === undefined ? undefined : parseFilmInteraction(rawInteraction, beats.length);
  const sourceSha256 = await accessibilityDigest(encodeCanvasV2Screen(screen));
  const assets: Record<string, string> = {};
  for (const id of canvasV2ScreenBoundAssets(screen)) {
    const asset = evidence.find(item => item.id === id);
    if (!asset || asset.source?.permission === 'unavailable') throw Error('The scene has an unavailable resource.');
    assets[id] = await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes : readCanvasV2ScreenAssetPixels)(asset.url, signal);
  }
  const fontCss = await readCanvasV2ScreenFontCss(screen, signal);
  const result = await request({ mode: 'explainer-render', nodeId, sourceVersion: sourceSha256, sourceSha256, screen, assets, fontCss, beats, interaction }, signal);
  if (result.kind !== 'northstar-narrated-explainer' || result.sourceSha256 !== sourceSha256 ||
    typeof result.video !== 'string' || result.video.length > 6_670_000 || !/^data:video\/mp4;base64,[A-Za-z0-9+/]+={0,2}$/.test(result.video) ||
    result.width !== screen.width - screen.width % 2 || result.height !== screen.height - screen.height % 2) throw Error('The film does not match the retained scene.');
  const playback = parseExplainerPlayback(result);
  if (Boolean(interaction) !== Boolean(playback.interaction) ||
      playback.interaction && (playback.interaction.frame[0] !== result.width || playback.interaction.frame[1] !== result.height ||
        JSON.stringify(playback.interaction.views) !== JSON.stringify(interaction?.views) ||
        JSON.stringify(playback.interaction.branches) !== JSON.stringify(interaction?.branches))) {
    throw Error('The rendered cut does not match the requested film interaction.');
  }
  const frames = result.reviewFrames as CanvasExplainerRender['reviewFrames'] | undefined;
  if (!isCanvasExplainerFrame(result.endFrame) || !Array.isArray(frames) || frames.length !== beats.length ||
      frames.some((frame, index) => {
        const chapter = playback.chapters[index];
        return !frame || frame.beat !== chapter.title || !Number.isFinite(frame.seconds) ||
          frame.seconds < chapter.start || frame.seconds >= chapter.end || !isCanvasExplainerFrame(frame.image);
      })) throw Error('The worker did not return review images for each narrated beat.');
  return { ...result, ...playback } as CanvasExplainerRender;
}

export async function buildCanvasBlenderScene(scene: unknown, signal: AbortSignal) {
  const result = await request({ mode: 'blender-build', scene }, signal);
  if (result.status !== 'completed' || typeof result.output?.title !== 'string' ||
    !Array.isArray(result.artifacts) || result.artifacts.length !== 4 ||
    result.artifacts.some((file: unknown) => {
      const item = file as { name?:string; mimeType?:string; dataBase64?:string };
      return !item || !/^(?:scene\.(?:glb|blend|json)|manifest\.json)$/.test(item.name??'') ||
        !/^(?:model\/gltf-binary|application\/(?:x-blender|json))$/.test(item.mimeType??'') ||
        typeof item.dataBase64 !== 'string' || item.dataBase64.length > 10_667_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.dataBase64);
    })) throw Error('The Blender worker did not return the expected assets.');
  return result as {output:{title:string;version:string;parts:string[];bounds:unknown;metersPerUnit:number};
    artifacts:Array<{name:string;mimeType:string;dataBase64:string}>};
}
