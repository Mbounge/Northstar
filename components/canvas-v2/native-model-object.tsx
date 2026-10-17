'use client';

import { useContext, useMemo } from 'react';
import { CanvasV2InteractiveScreenObject, CanvasV2ScreenAssets } from './interactive-screen';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { canvasV2NativeModelViewerScreen, parseCanvasV2NativeModel } from '@/lib/canvas-v2/model-object';
import { isCanvasV2ScreenModelBytes } from '@/lib/canvas-v2/screen-asset-pixels';

export function CanvasV2NativeModelObject({ nodeId, encodedModel, showCaption = true }: { nodeId: string; encodedModel: string; showCaption?: boolean }) {
  const evidence = useContext(CanvasV2ScreenAssets);
  const result = useMemo(() => {
    try {
      const model = parseCanvasV2NativeModel(encodedModel);
      const asset = evidence.find(candidate => candidate.id === model.evidenceId);
      if (!asset || asset.mediaType !== 'model' || !isCanvasV2ScreenModelBytes(asset.url)) return { error: 'This retained GLB is unavailable or invalid.' };
      return { encoded: encodeCanvasV2Screen(canvasV2NativeModelViewerScreen(model)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'This retained GLB could not be opened.' };
    }
  }, [encodedModel, evidence]);
  if (result.error) return <div role="img" aria-label="Unavailable 3D model" className="grid h-full w-full place-items-center bg-[#161b24] p-4 text-center text-xs text-[#ffb4b4]">{result.error}</div>;
  return <CanvasV2InteractiveScreenObject nodeId={nodeId} encoded={result.encoded!} showCaption={showCaption} />;
}
