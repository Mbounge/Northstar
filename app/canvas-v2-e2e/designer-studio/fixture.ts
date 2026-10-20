import type { CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';

/** Public DEV specimen for production designer controls; never model-quality evidence. */
export function createDesignerStudioFixture(photoId = 'contract-photo'): CanvasV2InteractiveScreen {
  return {
    version: 1,
    referenceIntent: 'original',
    title: 'Designer studio fixture',
    width: 960,
    height: 820,
    device: 'none',
    referenceAssetIds: [photoId],
    html: `<main id="studio-root" data-northstar-layer="Designer specimen">
      <header id="studio-header"><p class="shared-label" id="brand-label">FIELDNOTES</p><button id="save">Save draft</button></header>
      <h1 id="studio-heading">Make room for a human idea.</h1>
      <p id="studio-description" class="shared-label">One retained source, many deliberate choices.</p>
      <section id="card-grid" data-northstar-layer="Responsive card grid">
        <article id="card-one" data-northstar-layer="First card"><h2 id="label-one" class="shared-label">Notice</h2><p id="copy-one">Collect something worth keeping.</p></article>
        <article id="card-two" data-northstar-layer="Second card"><h2 id="label-two" class="shared-label">Connect</h2><p id="copy-two">Find a different point of view.</p></article>
        <article id="card-three" data-northstar-layer="Third card"><h2 id="label-three" class="shared-label">Create</h2><p id="copy-three">Give the next idea some room.</p></article>
      </section>
      <section id="artwork-row" data-northstar-layer="Artwork row">
        <svg id="vector-stage" data-northstar-layer="Transformed artwork" viewBox="0 0 300 200" aria-label="Editable native artwork">
          <defs><linearGradient id="studio-gradient"><stop offset="0" stop-color="#dca569"/><stop offset="1" stop-color="#9a678f"/></linearGradient><clipPath id="original-photo-clip"><rect x="215" y="125" width="65" height="50" rx="8"/></clipPath></defs>
          <g id="transformed-parts" data-northstar-layer="Transformed group" transform="translate(24 12) rotate(8 90 80) scale(.9 1.15)">
            <path id="curve-part" data-northstar-layer="Cubic and arc curve" transform="translate(6 -4) rotate(-12 100 90)" d="M18 90 C35 20 85 20 104 90 A36 22 25 0 1 180 90 L180 130 L18 130 Z" fill="url(#studio-gradient)" stroke="#49374e" stroke-width="2"/>
            <circle id="circle-part" data-northstar-layer="Circle part" cx="67" cy="78" r="13" fill="#f7ead2"/>
            <rect id="rectangle-part" data-northstar-layer="Rectangle part" x="110" y="68" width="35" height="24" rx="4" fill="#f7ead2"/>
          </g>
          <image id="vector-photo" data-northstar-layer="Retained SVG image" href="northstar-asset:${photoId}" x="215" y="125" width="65" height="50" preserveAspectRatio="xMidYMid slice" clip-path="url(#original-photo-clip)"/>
          <text id="vector-label" x="150" y="191" text-anchor="middle" fill="#49374e" font-size="14">Native paths, retained image</text>
        </svg>
        <img id="studio-photo" data-northstar-layer="Retained photograph" src="northstar-asset:${photoId}" alt="Retained training photograph"/>
      </section>
      <label id="draft-label">Your draft<input id="draft" value="Keep this human draft"/></label><p id="status">Ready</p>
    </main>`,
    css: `:root{--studio-brand:#654c78;--studio-space:18px}body{margin:0;background:#f5f0e8;color:#3e3347;font-family:Arial,sans-serif}*{box-sizing:border-box}#studio-root{height:820px;overflow:auto;padding:28px}#studio-header{display:flex;align-items:center;justify-content:space-between}.shared-label{color:var(--studio-brand)}#brand-label{font-size:12px;letter-spacing:2px}button{padding:12px 18px;border:0;border-radius:8px;background:#654c78;color:#fff;font:inherit}h1{font-size:42px;line-height:1.1;margin:24px 0 12px}#card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--studio-space);margin:24px 0}article{padding:18px;border:1px solid #d9cfdc;background:#eee6db;border-radius:12px}article h2{font-size:22px;margin:0 0 12px}article p{font-size:14px;line-height:1.5}#artwork-row{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center}#vector-stage{display:block;width:100%;height:240px}#studio-photo{display:block;width:100%;height:220px;object-fit:cover;object-position:50% 50%;border-radius:12px}#draft-label{display:block;margin-top:24px;font-size:13px}input{display:block;width:100%;padding:12px;margin-top:8px;border:1px solid #c8bfcd;border-radius:8px;font:inherit}#status{font-size:13px}@media(max-width:640px){#card-grid{grid-template-columns:1fr}#artwork-row{grid-template-columns:1fr}h1{font-size:30px}}`,
    javascript: `let saves=0;window.designerFixtureBoots=(window.designerFixtureBoots||0)+1;document.querySelector('#save').addEventListener('click',()=>{document.querySelector('#status').textContent='Saved '+(++saves)+' · '+document.querySelector('#draft').value;});`,
  };
}
