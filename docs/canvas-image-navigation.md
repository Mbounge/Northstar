# Navigation with large screenshot flows

The public native scene now observes image intersection with the canvas viewport,
including a 512 CSS-pixel buffer on each edge. Images outside that buffer skip
painting through a runtime-only visibility attribute. They remain mounted with
their original URLs, measured geometry, evidence references and full resolution.
Panning, zooming, moving objects and resizing the viewport update intersection
without a React update or a JavaScript layout read for every image each frame.

This applies to canonical app screenshots as well as composition images.
Canonical rails still load eagerly, but images request asynchronous decoding
and normal fetch priority. The previous canonical-only synchronous decoding and
exemption from paint optimization are removed. Browsers without
IntersectionObserver retain normal visible rendering. Cleanup removes all
runtime culling attributes. Source documents and private renders are unaffected.

Camera gestures also freeze the decorative background gradients until the
gesture ends and suspend native hover inspection during navigation. Selection
and object-drag handlers remain active.

Scope: this reduces offscreen image painting and decorative work. It does not
reduce the original image inventory, introduce thumbnail URLs, or limit how many
screens a composition may contain. A zoomed-out view with every screen visible
still paints every visible screen. Decoded-image memory is not explicitly bounded.

Validation: source and diff review only. No tests, build, browser run or performance
measurement was performed, following the user's instruction to run the demo
themselves. Existing source-contract assertions were updated to match the change.
