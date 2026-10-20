import type { CanvasV2ArtifactDocument } from './types';
import { serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from './native-scene';
import { normalizeCanvasV2NativeGeometryDocument } from './native-geometry-document';
import { htmlFromSharedCells, partitionSharedHtml } from './sessions/collaboration-document';

/** Persist only the change the human actually made. A compiled scene contains
 * measured/resolved styles for every object; serializing it wholesale would
 * author those measurements back into untouched teammates' objects. Compare
 * two serializations from the SAME compiler instead, and apply that delta to
 * the exact original bytes. Parent bodies contain child references, so adding,
 * removing, or reordering children never rewrites their contents or styles. */
export function serializeCanvasV2NativeSceneChanges(
  document: CanvasV2ArtifactDocument,
  before: CanvasV2NativeSceneDocument,
  after: CanvasV2NativeSceneDocument,
): CanvasV2ArtifactDocument {
  const original = partitionSharedHtml(document.html);
  const previousDocument = serializeCanvasV2NativeScene(before);
  const nextDocument = serializeCanvasV2NativeScene(after);
  const previous = partitionSharedHtml(previousDocument.html);
  const next = partitionSharedHtml(nextDocument.html);
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    if (previous.get(key) === next.get(key)) continue;
    const value = next.get(key);
    if (value === undefined) original.delete(key); else original.set(key, value);
  }
  // The serializer's inert metadata sentinel may become referenced when the
  // first root is created/reordered in an older, pre-native document.
  for (const [key, value] of next) if (!previous.has(key) || !original.has(key)) original.set(key, value);
  const normalized = normalizeCanvasV2NativeGeometryDocument(document);
  return { ...normalized, html: htmlFromSharedCells(original),
    css: before.css === after.css ? normalized.css : nextDocument.css };
}
