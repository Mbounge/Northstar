export interface ScreenReviewResponsePart { type: string; text?: string; image_url?: string }
const encoder = new TextEncoder();
const partBytes = (part: ScreenReviewResponsePart) => encoder.encode(JSON.stringify(part)).length;

/** Keep current full compositions and declared comparison compositions before
 * supplemental crops/assets. Dropped pairs become neutral metadata: leaving a
 * reference/detail descriptor in front of the next image would mislabel it. */
export function budgetScreenReviewResponse(parts: readonly ScreenReviewResponsePart[], limit = 8_000_000): ScreenReviewResponsePart[] {
  if (!Number.isSafeInteger(limit) || limit < 2) throw new Error('Invalid screen review response budget.');
  const groups: Array<{ parts: ScreenReviewResponsePart[]; note?: ScreenReviewResponsePart; priority: number; bytes: number; selected: boolean }> = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i], image = parts[i + 1];
    let metadata: Record<string, unknown> = {};
    if (part.type === 'input_text' && part.text) { try { const value = JSON.parse(part.text); if (value && typeof value === 'object' && !Array.isArray(value)) metadata = value; } catch { /* Plain text is required context. */ } }
    const supplemental = metadata.referenceAssetId !== undefined || metadata.detailName !== undefined;
    if (supplemental && image?.type === 'input_image' && typeof image.image_url === 'string' && !metadata.captureRole && !metadata.refinementBaseline) {
      const note = { type: 'input_text', text: JSON.stringify({ omittedReviewEvidence: { referenceAssetId: metadata.referenceAssetId, detailName: metadata.detailName, nodeId: metadata.nodeId }, note: 'Supplemental pixels omitted to retain every current full comparison composition within the response budget. This is not visual evidence or approval. Use inspect_asset on the retained reference handle, or canvas_review for the component crop, before judging omitted pixels.' }) };
      groups.push({ parts: [part, image], note, priority: metadata.primaryProductEvidence === true ? 0 : metadata.componentReferenceComparison === true ? 1 : metadata.referenceAssetId !== undefined ? 2 : 3, bytes: partBytes(part) + partBytes(image) + 2, selected: false });
      i++;
    } else groups.push({ parts: [part], priority: -1, bytes: partBytes(part) + 1, selected: true });
  }
  // Sum JSON array bytes exactly, including delimiters and UTF-8 text.
  // A tiny image pair may cost less than its omission notice. Keep that pair
  // rather than manufacture an oversized response at an exact boundary.
  for (const group of groups) if (group.note && group.bytes <= partBytes(group.note) + 1) group.selected = true;
  let used = (groups.length ? 1 : 2) + groups.reduce((sum, group) => sum + (group.selected ? group.bytes : partBytes(group.note!) + 1), 0);
  if (used > limit) throw new Error('Current full screen and declared comparison compositions exceed the response budget. Their appearance remains unverified; review this exact group separately.');
  for (const group of groups.filter(group => group.note && !group.selected).sort((a, b) => a.priority - b.priority)) {
    const added = group.bytes - (partBytes(group.note!) + 1);
    if (used + added <= limit) { used += added; group.selected = true; }
  }
  return groups.flatMap(group => group.selected ? group.parts : [group.note!]);
}
