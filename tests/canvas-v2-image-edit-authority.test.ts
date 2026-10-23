import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCanvasV2EvidenceContinuity } from '../lib/canvas-v2/artifact-safety';
import { creativeArtifact } from '../lib/canvas-v2/creative/runtime.server';
import type { CanvasV2EvidenceAsset } from '../lib/canvas-v2/types';
import type { CanvasV2WorkingContext } from '../lib/canvas-v2/working-context';

// Provenance/authorization fixture; these bytes are not a real edited image.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
const generated = creativeArtifact(png, 'original.png', 'Uploaded photo', 'generated', []).asset!;
const original: CanvasV2EvidenceAsset = { ...generated, id: 'uploaded-photo', source: { ...generated.source!, providerId: 'user-upload' } };
const edited = creativeArtifact(png, 'edited.png', 'Edited photo', 'computed', [original.id]).asset!;
const image = (asset: CanvasV2EvidenceAsset = original, nodeId = 'photo') => ({ html: `<img data-canvas-v2-node-id="${nodeId}" data-canvas-v2-evidence-id="${asset.id}" data-canvas-v2-origin="user" data-canvas-v2-last-author="user" src="${asset.url}">`, css: '' });
const context = (): CanvasV2WorkingContext => ({ schema: 'canvas-v2.working-context.v1', scope: 'selection', selectionPolicy: 'modify', selectedNodeIds: ['photo'], editableNodeIds: ['photo'], protectedNodeIds: [], visibleNodeIds: ['photo'], nearbyNodeIds: [], visibleBounds: { x: 0, y: 0, width: 1200, height: 900 }, viewportScale: 1, relationships: [], objects: [{ nodeId: 'photo', kind: 'image', origin: 'user', lastAuthor: 'user', userEdited: true, editVersion: 1, locked: false, hidden: false, canonicalEvidence: false, bounds: { x: 0, y: 0, width: 400, height: 600 }, evidenceId: original.id }] });
const check = (workingContext?: CanvasV2WorkingContext, next = image(edited), replacement = edited) => validateCanvasV2EvidenceContinuity(image(), next, [original, replacement], { workingContext });

test('an explicitly editable uploaded image accepts its retained derivative at the same node', () => {
 assert.deepEqual(check(context()), []);
});

for (const boundary of ['unselected', 'reference', 'other-node', 'locked', 'hidden', 'canonical', 'non-image'] as const) test(`image derivation does not bypass ${boundary} protection`, () => {
 const current = context();
 if (boundary === 'unselected') current.scope = 'viewport';
 if (boundary === 'reference') current.selectionPolicy = 'reference';
 if (boundary === 'other-node') current.editableNodeIds = ['other'];
 if (boundary === 'locked') current.objects[0].locked = true;
 if (boundary === 'hidden') current.objects[0].hidden = true;
 if (boundary === 'canonical') current.objects[0].canonicalEvidence = true;
 if (boundary === 'non-image') current.objects[0].kind = 'text';
 assert.ok(check(current).length);
});

test('selected image authorization still requires direct derivation and stable node identity', () => {
 assert.ok(check(context(), image(edited, 'new-photo')).length);
 const unrelated = { ...edited, tags: ['computed', 'derived-from:unrelated-photo'] };
 assert.ok(check(context(), image(unrelated), unrelated).length);
 assert.ok(check(context(), { html: '', css: '' }).length);
});

test('selecting one copy does not authorize replacing another human copy of the same asset', () => {
 const before = { html: image().html + image(original, 'second-photo').html, css: '' };
 const next = { html: image(edited).html + image(edited, 'second-photo').html, css: '' };
 assert.ok(validateCanvasV2EvidenceContinuity(before, next, [original, edited], { workingContext: context() }).length);
});

for (const providerId of ['user-canvas', 'northstar-image-generation']) test(`explicit selection permits a retained derivative of a human-edited ${providerId} image`, () => {
 const source = { ...original, source: { ...original.source!, providerId } };
 assert.deepEqual(validateCanvasV2EvidenceContinuity(image(source), image(edited), [source, edited], { workingContext: context() }), []);
});

test('selection does not grant derivation replacement of unrelated research-provider evidence', () => {
 const research = { ...original, source: { ...original.source!, providerId: 'account-evidence', sourceType: 'capture' as const } };
 assert.ok(validateCanvasV2EvidenceContinuity(image(research), image(edited), [research, edited], { workingContext: context() }).length);
});
