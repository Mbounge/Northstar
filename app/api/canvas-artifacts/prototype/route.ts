export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PrototypeScreen {
  step: string;
  title: string;
  body: string;
  accent: "violet" | "orange";
  treatment: "hero" | "form" | "proof" | "success";
}

const PROTOTYPE_ARTIFACT_CSS = String.raw`
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #F0F0F6; color: #171820; }
body { padding: 18px; user-select: none; cursor: grab; }
button, a, input, textarea, select, [data-ns-interactive="true"] { cursor: pointer; }
button { font: inherit; }
.artifact-shell { width: 100%; height: 100%; display: grid; grid-template-rows: 164px minmax(0,1fr) 222px 86px; border: 1px solid #E2E1EA; border-radius: 28px; background: #FBFBFD; box-shadow: 0 30px 90px rgba(39,32,91,.13); overflow: hidden; }
.artifact-header { display: grid; grid-template-columns: minmax(0,1fr) 225px; gap: 32px; align-items: center; padding: 30px 42px 26px; border-bottom: 1px solid #E7E6ED; background: radial-gradient(circle at 12% 8%, rgba(107,92,255,.12), transparent 34%), #FFFFFF; }
.artifact-header h1 { max-width: 900px; margin: 12px 0 8px; font-size: 48px; line-height: .96; letter-spacing: -.055em; }
.artifact-header p { max-width: 880px; margin: 0; color: #626572; font-size: 13px; line-height: 1.55; }
.pill { display: inline-flex; align-items: center; min-height: 23px; padding: 0 9px; border-radius: 999px; font-size: 8px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.confidence-card { padding: 17px; border: 1px solid #E5E3EE; border-radius: 17px; background: rgba(255,255,255,.84); box-shadow: 0 14px 34px rgba(39,32,91,.07); }
.confidence-card span { display: block; color: #8A8C98; font-size: 8px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.confidence-card strong { display: block; margin-top: 4px; color: #238B51; font-size: 25px; letter-spacing: -.04em; }
.confidence-card small { display: block; margin-top: 6px; color: #777A87; font-size: 9px; line-height: 1.45; }
.comparison-section { min-height: 0; padding: 22px 32px 20px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 15px; }
.section-heading > div { display: flex; align-items: center; gap: 11px; }
.section-heading > div > span { display: flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 8px; background: #ECE8FF; color: #5D4EEB; font-size: 9px; font-weight: 900; }
.section-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.035em; }
.section-heading p { margin: 0; color: #7C7E8A; font-size: 9px; line-height: 1.45; }
.focus-button { min-height: 31px; padding: 0 12px; border: 1px solid #DDD9F8; border-radius: 10px; background: #F4F1FF; color: #5D4EEB; cursor: pointer; font-size: 9px; font-weight: 850; transition: .16s ease; }
.focus-button:hover { background: #EDE8FF; transform: translateY(-1px); }
.journey-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
.journey-block { min-width: 0; padding: 15px; border: 1px solid #E5E4EC; border-radius: 19px; background: #FFFFFF; box-shadow: 0 12px 30px rgba(38,31,92,.055); transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease; }
.journey-block.awin { box-shadow: inset 3px 0 #6B5CFF, 0 12px 30px rgba(38,31,92,.055); }
.journey-block.whop { box-shadow: inset 3px 0 #FF6B45, 0 12px 30px rgba(38,31,92,.055); }
body[data-focus="awin"] .journey-block.whop, body[data-focus="whop"] .journey-block.awin { opacity: .34; transform: scale(.988); }
body[data-focus="awin"] .journey-block.awin, body[data-focus="whop"] .journey-block.whop { box-shadow: 0 0 0 3px rgba(107,92,255,.16), 0 16px 36px rgba(38,31,92,.11); }
.journey-label { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
.journey-label > .pill { margin-left: auto; }
.app-mark { display: flex; width: 31px; height: 31px; align-items: center; justify-content: center; border-radius: 9px; color: #FFFFFF; font-size: 12px; font-weight: 900; }
.awin-mark { background: #6B5CFF; }.whop-mark { background: #FF6B45; }
.journey-label h3 { margin: 0; font-size: 12px; }.journey-label p { margin: 2px 0 0; color: #8A8C98; font-size: 8px; }
.screen-row { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
.phone-card { min-width: 0; }.phone-shell { position: relative; width: 100%; aspect-ratio: 9/15.2; padding: 4px; border-radius: 17px; background: #15161C; box-shadow: 0 8px 20px rgba(19,21,29,.14); }
.phone-notch { position: absolute; z-index: 2; left: 50%; top: 6px; width: 33%; height: 8px; transform: translateX(-50%); border-radius: 999px; background: #090A0D; }
.phone-screen { height: 100%; overflow: hidden; border-radius: 14px; }.phone-status { display: flex; justify-content: space-between; padding: 7px 8px 0; color: rgba(50,52,60,.62); font-size: 4px; font-weight: 800; }
.phone-content { display: flex; height: calc(100% - 13px); flex-direction: column; padding: 17% 11% 10%; }.phone-step { font-size: 5px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
.phone-content h4 { margin: 7px 0 5px; font-size: 10px; line-height: 1.08; letter-spacing: -.035em; }.phone-content p { margin: 0; font-size: 5.5px; line-height: 1.42; }
.brand-cloud { display: grid; grid-template-columns: repeat(3,1fr); gap: 4px; margin-top: auto; }.brand-cloud span { height: 13px; border: 1px solid #E4E2EA; border-radius: 4px; background: linear-gradient(135deg,#F3F1F8,#FFFFFF); }
.mini-form { display: grid; gap: 5px; margin-top: auto; }.mini-form > span { height: 16px; border: 1px solid #E2E1E9; border-radius: 5px; background: #FAFAFC; }.mini-form button { height: 18px; border: 0; border-radius: 6px; color: white; font-size: 5px; font-weight: 850; }
.success-orbit { display: flex; width: 43px; height: 43px; align-items: center; justify-content: center; margin: auto; border: 1px solid; border-radius: 999px; }.success-orbit span { display: flex; width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 999px; color: white; font-size: 10px; font-weight: 900; }
.decision-section { min-height: 0; padding: 15px 32px 16px; border-top: 1px solid #E7E6ED; background: #F9F9FC; }
.decision-grid { display: grid; height: 100%; grid-template-columns: .9fr 1.1fr 1.35fr; gap: 13px; }.tradeoff-card,.matrix-card,.recommendation-card { min-height: 0; border: 1px solid #E4E3EB; border-radius: 17px; background: #FFFFFF; box-shadow: 0 10px 25px rgba(38,31,92,.045); }
.tradeoff-card { padding: 17px; }.tradeoff-head { display: flex; align-items: center; justify-content: space-between; color: #8A8C98; font-size: 7px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }.tradeoff-card h3 { margin: 15px 0 15px; font-size: 17px; line-height: 1.06; letter-spacing: -.04em; }.tradeoff-card p { margin: 12px 0 0; color: #6D707D; font-size: 8px; line-height: 1.45; }
.spectrum { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; color: #686B78; font-size: 7px; font-weight: 800; }.spectrum > div { height: 4px; border-radius: 999px; background: linear-gradient(90deg,#6B5CFF,#D7D2E8,#FF6B45); }.spectrum i { display: block; width: 9px; height: 9px; margin-left: 47%; transform: translateY(-2.5px); border: 2px solid white; border-radius: 999px; background: #2B2D35; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
.matrix-card { overflow: hidden; }.matrix-card > div { display: grid; grid-template-columns: 72px 38px 1fr; gap: 7px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #ECEBF1; }.matrix-card > div:last-child { border-bottom: 0; }.matrix-card span { color: #7E808D; font-size: 7px; font-weight: 800; }.matrix-card strong { color: #343641; font-size: 8px; }.matrix-card small { color: #6D707D; font-size: 7px; line-height: 1.3; }
.recommendation-card { padding: 18px; background: radial-gradient(circle at 94% 7%, rgba(107,92,255,.18), transparent 35%), #171822; color: #FFFFFF; }.recommendation-card h3 { margin: 12px 0 8px; font-size: 20px; line-height: 1.02; letter-spacing: -.045em; }.recommendation-card > p { margin: 0; color: rgba(255,255,255,.68); font-size: 8px; line-height: 1.48; }.recommendation-card ol { display: grid; gap: 5px; margin: 11px 0 0; padding: 0; list-style: none; }.recommendation-card li { display: flex; align-items: center; gap: 7px; color: rgba(255,255,255,.88); font-size: 7px; font-weight: 650; }.recommendation-card li span { display: flex; width: 16px; height: 16px; align-items: center; justify-content: center; border-radius: 5px; background: rgba(255,255,255,.12); color: #CFC9FF; font-size: 6px; font-weight: 900; }
.research-strip { display: grid; grid-template-columns: 230px repeat(3,minmax(0,1fr)); gap: 1px; border-top: 1px solid #E3E2EA; background: #E3E2EA; }
.research-title,.research-strip article { min-width: 0; padding: 14px 18px; background: #FFFFFF; }.research-title { display: flex; flex-direction: column; justify-content: center; }.research-title strong { margin-top: 5px; font-size: 11px; }.research-strip article h3 { margin: 0; font-size: 9px; }.research-strip article p { margin: 5px 0 0; color: #727582; font-size: 7px; line-height: 1.4; }
`;

const AWIN_SCREENS: PrototypeScreen[] = [
  { step: "Promise", title: "Create links quickly, from anywhere.", body: "A direct creator benefit framed before account commitment.", accent: "violet", treatment: "hero" },
  { step: "Proof", title: "Connect with 30,000+ top brands", body: "Ecosystem scale reduces uncertainty and builds legitimacy.", accent: "violet", treatment: "proof" },
  { step: "Value", title: "Earn money through partnerships", body: "The economic outcome is explained before the form begins.", accent: "violet", treatment: "form" },
  { step: "Commitment", title: "Your partnership journey starts here", body: "A confident transition into account setup.", accent: "violet", treatment: "success" },
];

const WHOP_SCREENS: PrototypeScreen[] = [
  { step: "Promise", title: "The make money app", body: "Immediate, memorable positioning with very little explanation.", accent: "orange", treatment: "hero" },
  { step: "Account", title: "Create your account", body: "Whop reaches action quickly with a compact form.", accent: "orange", treatment: "form" },
  { step: "Verification", title: "Verify your email", body: "Momentum slows as verification becomes the dominant task.", accent: "orange", treatment: "form" },
  { step: "Identity", title: "Pick your username", body: "The journey resumes with a simple identity decision.", accent: "orange", treatment: "success" },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPhoneCard(screen: PrototypeScreen): string {
  const palette = screen.accent === "violet"
    ? { accent: "#6B5CFF", tint: "#F0ECFF", ink: "#2E275B" }
    : { accent: "#FF6B45", tint: "#FFF0EA", ink: "#5C2A20" };
  const background = screen.treatment === "hero"
    ? `linear-gradient(155deg, ${palette.accent}, ${palette.ink})`
    : screen.treatment === "success"
      ? `linear-gradient(180deg, #FFFFFF, ${palette.tint})`
      : "#FFFFFF";
  const titleColor = screen.treatment === "hero" ? "#FFFFFF" : "#171820";
  const bodyColor = screen.treatment === "hero" ? "rgba(255,255,255,.76)" : "#6B6E7C";
  const stepColor = screen.treatment === "hero" ? "rgba(255,255,255,.72)" : palette.accent;
  const detail = screen.treatment === "proof"
    ? `<div class="brand-cloud">${Array.from({ length: 6 }, () => "<span></span>").join("")}</div>`
    : screen.treatment === "form"
      ? `<div class="mini-form"><span></span><span></span><button data-ns-interactive="true" style="background:${palette.accent}">Continue</button></div>`
      : screen.treatment === "success"
        ? `<div class="success-orbit" style="border-color:${palette.accent}"><span style="background:${palette.accent}">✓</span></div>`
        : "";

  return `<article class="phone-card"><div class="phone-shell"><div class="phone-notch"></div><div class="phone-screen" style="background:${background}"><div class="phone-status"><span>9:41</span><span>● ● ▰</span></div><div class="phone-content"><span class="phone-step" style="color:${stepColor}">${escapeHtml(screen.step)}</span><h4 style="color:${titleColor}">${escapeHtml(screen.title)}</h4><p style="color:${bodyColor}">${escapeHtml(screen.body)}</p>${detail}</div></div></div></article>`;
}

function renderJourney(appName: "Awin" | "Whop", subtitle: string, pill: string, screens: PrototypeScreen[]): string {
  const lower = appName.toLowerCase();
  const tone = appName === "Awin" ? "violet" : "orange";
  return `<div class="journey-block ${lower}"><div class="journey-label"><div class="app-mark ${lower}-mark">${appName.charAt(0)}</div><div><h3>${appName}</h3><p>${escapeHtml(subtitle)}</p></div><span class="pill" style="background:${tone === "violet" ? "#EFEAFF" : "#FFF0EA"};color:${tone === "violet" ? "#5D4EEB" : "#E65E39"}">${escapeHtml(pill)}</span></div><div class="screen-row">${screens.map(renderPhoneCard).join("")}</div></div>`;
}

function renderBridgeScript(artifactId: string): string {
  return String.raw`
(() => {
  const artifactId = ${JSON.stringify(artifactId)};
  const post = (type, event, extra = {}) => {
    window.parent.postMessage({
      type,
      artifactId,
      clientX: event?.clientX ?? 0,
      clientY: event?.clientY ?? 0,
      ...extra,
    }, "*");
  };

  const isInteractive = (target) => Boolean(target?.closest?.(
    "button,a,input,textarea,select,option,[contenteditable='true'],[data-ns-interactive='true']"
  ));

  document.addEventListener("pointerdown", (event) => {
    post("northstar.artifact.select", event);
    if (event.button !== 0 || isInteractive(event.target)) return;

    // Hand ownership to the parent document immediately. The parent installs a
    // transparent drag shield and receives all following pointer movement in
    // stable browser client coordinates. Do not capture the pointer here: a
    // moving iframe would otherwise continuously change the coordinate origin.
    event.preventDefault();
    post("northstar.artifact.drag-start", event);
  }, true);

  document.addEventListener("wheel", (event) => {
    event.preventDefault();
    post("northstar.artifact.wheel", event, {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
  }, { passive: false, capture: true });

  const focusButton = document.querySelector("[data-focus-control]");
  focusButton?.addEventListener("click", () => {
    const current = document.body.dataset.focus || "balanced";
    document.body.dataset.focus = current === "balanced" ? "awin" : current === "awin" ? "whop" : "balanced";
    focusButton.textContent = document.body.dataset.focus === "balanced"
      ? "Highlight evidence"
      : document.body.dataset.focus === "awin"
        ? "Focus: Awin"
        : "Focus: Whop";
  });
})();`;
}

function renderPrototypeDocument(artifactId: string): string {
  const safeArtifactId = escapeHtml(artifactId);
  const nonce = "northstar-artifact-runtime";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>Northstar code artifact prototype</title><style>${PROTOTYPE_ARTIFACT_CSS}</style></head><body data-artifact-id="${safeArtifactId}" data-focus="balanced"><main class="artifact-shell">
<header class="artifact-header"><div><span class="pill" style="background:#EFEAFF;color:#5D4EEB">Executive comparison</span><h1>Awin builds confidence. Whop builds momentum.</h1><p>The strongest onboarding direction combines Awin's early trust and value framing with Whop's faster account progression.</p></div><div class="confidence-card"><span>Confidence</span><strong>High</strong><small>Two complete mobile onboarding flows reviewed</small></div></header>
<section class="comparison-section"><div class="section-heading"><div><span>01</span><h2>Representative journey comparison</h2></div><div><p>Eight selected screens carry the executive story.</p><button class="focus-button" data-focus-control data-ns-interactive="true">Highlight evidence</button></div></div><div class="journey-grid">${renderJourney("Awin", "Trust-first progression", "Confidence before commitment", AWIN_SCREENS)}${renderJourney("Whop", "Momentum-first progression", "Action before explanation", WHOP_SCREENS)}</div></section>
<section class="decision-section"><div class="decision-grid"><article class="tradeoff-card"><div class="tradeoff-head"><span>Core trade-off</span><span>Observed</span></div><h3>Confidence before commitment vs. momentum before explanation</h3><div class="spectrum"><span>Awin</span><div><i></i></div><span>Whop</span></div><p>Awin invests in context and legitimacy. Whop prioritizes immediate account progression.</p></article><article class="matrix-card"><div><span>Value clarity</span><strong>Awin</strong><small>Explains the partnership outcome before commitment.</small></div><div><span>Initial speed</span><strong>Whop</strong><small>Moves into account creation with minimal ceremony.</small></div><div><span>Trust</span><strong>Awin</strong><small>Uses ecosystem proof and economic framing.</small></div><div><span>Friction</span><strong>Mixed</strong><small>Whop is faster, but verification interrupts momentum.</small></div></article><article class="recommendation-card"><span class="pill" style="background:rgba(255,255,255,.12);color:#DAD4FF">Recommended direction</span><h3>Combine Awin's proof with Whop's velocity.</h3><p>Lead with a clear economic promise, establish trust with evidence, then move into a short account path without repetitive verification.</p><ol><li><span>1</span>State the user outcome immediately</li><li><span>2</span>Show ecosystem proof before hesitation</li><li><span>3</span>Keep account setup short and continuous</li></ol></article></div></section>
<footer class="research-strip"><div class="research-title"><span class="pill" style="width:max-content;background:#F2F2F6;color:#686B78">Research trail</span><strong>How Northstar reached this</strong></div><article><h3>Evidence retained</h3><p>20 ordered screens, stage classifications, observations, and provenance remain attached.</p></article><article><h3>Selection logic</h3><p>Only stage-defining screens that support the conclusion appear in the primary view.</p></article><article><h3>Open question</h3><p>The captured journey shows design behavior, not conversion performance.</p></article></footer>
</main><script nonce="${nonce}">${renderBridgeScript(artifactId)}</script></body></html>`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const artifactId = requestUrl.searchParams.get("artifactId")?.slice(0,160) || "prototype";
  const html = renderPrototypeDocument(artifactId);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "content-security-policy": [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "img-src data: https:",
        "font-src 'none'",
        "script-src 'nonce-northstar-artifact-runtime'",
        "connect-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
