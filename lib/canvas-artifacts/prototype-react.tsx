//lib/canvas-artifacts/prototype-react.tsx

import type { CSSProperties, ReactNode } from "react";

interface ScreenCardProps {
  step: string;
  title: string;
  body: string;
  accent: "violet" | "orange";
  treatment: "hero" | "form" | "proof" | "success";
}

const screenPalette = {
  violet: {
    accent: "#6B5CFF",
    tint: "#F0ECFF",
    ink: "#2E275B",
  },
  orange: {
    accent: "#FF6B45",
    tint: "#FFF0EA",
    ink: "#5C2A20",
  },
} as const;

function ScreenCard({ step, title, body, accent, treatment }: ScreenCardProps) {
  const palette = screenPalette[accent];
  const isHero = treatment === "hero";
  const isSuccess = treatment === "success";

  return (
    <article className="phone-card">
      <div className="phone-shell">
        <div className="phone-notch" />
        <div
          className="phone-screen"
          style={{
            background: isHero
              ? `linear-gradient(155deg, ${palette.accent}, ${palette.ink})`
              : isSuccess
                ? `linear-gradient(180deg, #FFFFFF, ${palette.tint})`
                : "#FFFFFF",
          }}
        >
          <div className="phone-status">
            <span>9:41</span>
            <span>● ● ▰</span>
          </div>

          <div className="phone-content">
            <span
              className="phone-step"
              style={{
                color: isHero ? "rgba(255,255,255,.72)" : palette.accent,
              }}
            >
              {step}
            </span>
            <h4 style={{ color: isHero ? "#FFFFFF" : "#171820" }}>{title}</h4>
            <p style={{ color: isHero ? "rgba(255,255,255,.76)" : "#6B6E7C" }}>{body}</p>

            {treatment === "proof" && (
              <div className="brand-cloud">
                {Array.from({ length: 6 }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            )}

            {treatment === "form" && (
              <div className="mini-form">
                <span />
                <span />
                <button style={{ background: palette.accent }}>Continue</button>
              </div>
            )}

            {treatment === "success" && (
              <div className="success-orbit" style={{ borderColor: palette.accent }}>
                <span style={{ background: palette.accent }}>✓</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "violet" | "orange" | "green" }) {
  const styles: Record<string, CSSProperties> = {
    neutral: { background: "#F2F2F6", color: "#686B78" },
    violet: { background: "#EFEAFF", color: "#5D4EEB" },
    orange: { background: "#FFF0EA", color: "#E65E39" },
    green: { background: "#EAF9F0", color: "#218D50" },
  };

  return (
    <span className="pill" style={styles[tone]}>
      {children}
    </span>
  );
}

const awinScreens: ScreenCardProps[] = [
  { step: "Promise", title: "Create links quickly, from anywhere.", body: "A direct creator benefit framed before account commitment.", accent: "violet", treatment: "hero" },
  { step: "Proof", title: "Connect with 30,000+ top brands", body: "Ecosystem scale reduces uncertainty and builds legitimacy.", accent: "violet", treatment: "proof" },
  { step: "Value", title: "Earn money through partnerships", body: "The economic outcome is explained before the form begins.", accent: "violet", treatment: "form" },
  { step: "Commitment", title: "Your partnership journey starts here", body: "A confident transition into account setup.", accent: "violet", treatment: "success" },
];

const whopScreens: ScreenCardProps[] = [
  { step: "Promise", title: "The make money app", body: "Immediate, memorable positioning with very little explanation.", accent: "orange", treatment: "hero" },
  { step: "Account", title: "Create your account", body: "Whop reaches action quickly with a compact form.", accent: "orange", treatment: "form" },
  { step: "Verification", title: "Verify your email", body: "Momentum slows as verification becomes the dominant task.", accent: "orange", treatment: "form" },
  { step: "Identity", title: "Pick your username", body: "The journey resumes with a simple identity decision.", accent: "orange", treatment: "success" },
];

export function PrototypeComparisonArtifact() {
  return (
    <main className="artifact-shell">
      <header className="artifact-header">
        <div>
          <Pill tone="violet">Executive comparison</Pill>
          <h1>Awin builds confidence. Whop builds momentum.</h1>
          <p>
            The strongest onboarding direction combines Awin&apos;s early trust and value framing with Whop&apos;s faster account progression.
          </p>
        </div>
        <div className="confidence-card">
          <span>Confidence</span>
          <strong>High</strong>
          <small>Two complete mobile onboarding flows reviewed</small>
        </div>
      </header>

      <section className="comparison-section">
        <div className="section-heading">
          <div>
            <span>01</span>
            <h2>Representative journey comparison</h2>
          </div>
          <p>Eight selected screens carry the executive story. Complete flows remain inspectable below.</p>
        </div>

        <div className="journey-block awin">
          <div className="journey-label">
            <div className="app-mark awin-mark">A</div>
            <div>
              <h3>Awin</h3>
              <p>Trust-first progression</p>
            </div>
            <Pill tone="violet">Confidence before commitment</Pill>
          </div>
          <div className="screen-row">
            {awinScreens.map((screen) => <ScreenCard key={screen.step} {...screen} />)}
          </div>
        </div>

        <div className="journey-block whop">
          <div className="journey-label">
            <div className="app-mark whop-mark">W</div>
            <div>
              <h3>Whop</h3>
              <p>Momentum-first progression</p>
            </div>
            <Pill tone="orange">Action before explanation</Pill>
          </div>
          <div className="screen-row">
            {whopScreens.map((screen) => <ScreenCard key={screen.step} {...screen} />)}
          </div>
        </div>
      </section>

      <section className="decision-section">
        <div className="section-heading compact">
          <div>
            <span>02</span>
            <h2>What the evidence means</h2>
          </div>
        </div>

        <div className="decision-grid">
          <article className="tradeoff-card">
            <div className="tradeoff-head">
              <span>Primary trade-off</span>
              <Pill tone="green">Decision ready</Pill>
            </div>
            <h3>Trust depth versus time-to-action</h3>
            <div className="spectrum">
              <span>Awin</span>
              <div><i /></div>
              <span>Whop</span>
            </div>
            <p>Awin earns informed commitment. Whop protects initial velocity.</p>
          </article>

          <article className="matrix-card">
            <div><span>Value clarity</span><strong>Awin</strong><small>Explains the economic promise before setup.</small></div>
            <div><span>Activation speed</span><strong>Whop</strong><small>Moves users into account creation almost immediately.</small></div>
            <div><span>Trust building</span><strong>Awin</strong><small>Uses ecosystem scale and benefits as proof.</small></div>
            <div><span>Friction risk</span><strong>Whop</strong><small>Verification repetition interrupts momentum.</small></div>
          </article>

          <article className="recommendation-card">
            <Pill tone="violet">Northstar recommendation</Pill>
            <h3>Combine Awin&apos;s confidence with Whop&apos;s speed.</h3>
            <p>Lead with a clear economic promise, establish trust with proof, then move into a short account path without repetitive verification.</p>
            <ol>
              <li><span>1</span>Establish value before commitment.</li>
              <li><span>2</span>Preserve a short account-creation path.</li>
              <li><span>3</span>Consolidate verification into one clear stage.</li>
            </ol>
          </article>
        </div>
      </section>

      <details className="research-disclosure">
        <summary>
          <div>
            <Pill tone="neutral">Research trail</Pill>
            <strong>Inspect how the comparison came together</strong>
          </div>
          <span>20 screens studied · 8 shown · 2 complete flows</span>
        </summary>
        <div className="research-body">
          <article>
            <h3>Evidence retained</h3>
            <p>Complete ordered flows, screen-level observations, stage classifications, and provenance remain available to the artifact runtime.</p>
          </article>
          <article>
            <h3>Selection logic</h3>
            <p>The executive view keeps only stage-defining screens that materially support the trust-versus-momentum conclusion.</p>
          </article>
          <article>
            <h3>Open question</h3>
            <p>Captured screens show the experience design, not conversion performance. Behavioral validation would require product analytics.</p>
          </article>
        </div>
      </details>
    </main>
  );
}

export const PROTOTYPE_ARTIFACT_CSS = String.raw`
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #F3F3F8; color: #171820; }
body { padding: 22px; }
button, summary { font: inherit; }
.artifact-shell { width: min(1280px, 100%); margin: 0 auto; border: 1px solid #E2E1EA; border-radius: 26px; background: #FBFBFD; box-shadow: 0 30px 90px rgba(39, 32, 91, .13); overflow: hidden; }
.artifact-header { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 34px; align-items: end; padding: 48px 50px 38px; border-bottom: 1px solid #E7E6ED; background: radial-gradient(circle at 12% 8%, rgba(107,92,255,.11), transparent 34%), #FFFFFF; }
.artifact-header h1 { max-width: 820px; margin: 16px 0 12px; font-size: clamp(34px, 4.1vw, 58px); line-height: .98; letter-spacing: -.055em; }
.artifact-header p { max-width: 820px; margin: 0; color: #626572; font-size: 15px; line-height: 1.65; }
.pill { display: inline-flex; align-items: center; min-height: 25px; padding: 0 10px; border-radius: 999px; font-size: 9px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.confidence-card { padding: 20px; border: 1px solid #E5E3EE; border-radius: 18px; background: rgba(255,255,255,.82); box-shadow: 0 16px 38px rgba(39,32,91,.07); }
.confidence-card span { display: block; color: #8A8C98; font-size: 9px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
.confidence-card strong { display: block; margin-top: 5px; color: #238B51; font-size: 28px; letter-spacing: -.04em; }
.confidence-card small { display: block; margin-top: 8px; color: #777A87; font-size: 10px; line-height: 1.5; }
.comparison-section, .decision-section { padding: 38px 50px; }
.decision-section { padding-top: 8px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 28px; margin-bottom: 22px; }
.section-heading.compact { margin-bottom: 18px; }
.section-heading > div { display: flex; align-items: center; gap: 12px; }
.section-heading > div > span { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 9px; background: #ECE8FF; color: #5D4EEB; font-size: 10px; font-weight: 900; }
.section-heading h2 { margin: 0; font-size: 19px; letter-spacing: -.035em; }
.section-heading > p { max-width: 430px; margin: 0; color: #7C7E8A; font-size: 10px; line-height: 1.5; text-align: right; }
.journey-block { margin-top: 16px; padding: 18px; border: 1px solid #E5E4EC; border-radius: 20px; background: #FFFFFF; box-shadow: 0 12px 32px rgba(38,31,92,.055); }
.journey-block.awin { box-shadow: inset 3px 0 #6B5CFF, 0 12px 32px rgba(38,31,92,.055); }
.journey-block.whop { box-shadow: inset 3px 0 #FF6B45, 0 12px 32px rgba(38,31,92,.055); }
.journey-label { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; }
.journey-label > .pill { margin-left: auto; }
.app-mark { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 10px; color: #FFFFFF; font-size: 13px; font-weight: 900; }
.awin-mark { background: #6B5CFF; }.whop-mark { background: #FF6B45; }
.journey-label h3 { margin: 0; font-size: 13px; }.journey-label p { margin: 2px 0 0; color: #8A8C98; font-size: 9px; }
.screen-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.phone-card { min-width: 0; }.phone-shell { position: relative; width: 100%; aspect-ratio: 9/15.8; padding: 5px; border-radius: 22px; background: #15161C; box-shadow: 0 10px 24px rgba(19,21,29,.15); }
.phone-notch { position: absolute; z-index: 2; left: 50%; top: 8px; width: 34%; height: 11px; transform: translateX(-50%); border-radius: 999px; background: #090A0D; }
.phone-screen { height: 100%; overflow: hidden; border-radius: 18px; }.phone-status { display: flex; justify-content: space-between; padding: 9px 10px 0; color: rgba(50,52,60,.65); font-size: 5px; font-weight: 800; }
.phone-content { display: flex; height: calc(100% - 16px); flex-direction: column; padding: 18% 12% 12%; }.phone-step { font-size: 6px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
.phone-content h4 { margin: 8px 0 6px; font-size: clamp(9px, 1.1vw, 14px); line-height: 1.08; letter-spacing: -.035em; }.phone-content p { margin: 0; font-size: clamp(5.5px, .62vw, 8px); line-height: 1.45; }
.brand-cloud { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: auto; }.brand-cloud span { height: 17px; border: 1px solid #E4E2EA; border-radius: 5px; background: linear-gradient(135deg,#F3F1F8,#FFFFFF); }
.mini-form { display: grid; gap: 6px; margin-top: auto; }.mini-form > span { height: 20px; border: 1px solid #E2E1E9; border-radius: 6px; background: #FAFAFC; }.mini-form button { height: 22px; border: 0; border-radius: 7px; color: white; font-size: 6px; font-weight: 850; }
.success-orbit { display: flex; width: 52px; height: 52px; align-items: center; justify-content: center; margin: auto; border: 1px solid; border-radius: 999px; }.success-orbit span { display: flex; width: 25px; height: 25px; align-items: center; justify-content: center; border-radius: 999px; color: white; font-size: 12px; font-weight: 900; }
.decision-grid { display: grid; grid-template-columns: .9fr 1.1fr 1.35fr; gap: 16px; }.tradeoff-card,.matrix-card,.recommendation-card { border: 1px solid #E4E3EB; border-radius: 20px; background: #FFFFFF; box-shadow: 0 12px 30px rgba(38,31,92,.05); }
.tradeoff-card { padding: 20px; }.tradeoff-head { display: flex; align-items: center; justify-content: space-between; color: #8A8C98; font-size: 8px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }.tradeoff-card h3 { margin: 24px 0 20px; font-size: 21px; line-height: 1.05; letter-spacing: -.04em; }.tradeoff-card p { margin: 18px 0 0; color: #6D707D; font-size: 9px; line-height: 1.5; }
.spectrum { display: grid; grid-template-columns: auto 1fr auto; gap: 9px; align-items: center; color: #686B78; font-size: 8px; font-weight: 800; }.spectrum > div { height: 5px; border-radius: 999px; background: linear-gradient(90deg,#6B5CFF,#D7D2E8,#FF6B45); }.spectrum i { display: block; width: 11px; height: 11px; margin-left: 47%; transform: translateY(-3px); border: 2px solid white; border-radius: 999px; background: #2B2D35; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
.matrix-card { overflow: hidden; }.matrix-card > div { display: grid; grid-template-columns: 84px 42px 1fr; gap: 9px; align-items: center; padding: 13px 15px; border-bottom: 1px solid #ECEBF1; }.matrix-card > div:last-child { border-bottom: 0; }.matrix-card span { color: #7E808D; font-size: 8px; font-weight: 800; }.matrix-card strong { color: #343641; font-size: 9px; }.matrix-card small { color: #6D707D; font-size: 8px; line-height: 1.35; }
.recommendation-card { padding: 22px; background: radial-gradient(circle at 94% 7%, rgba(107,92,255,.18), transparent 35%), #171822; color: #FFFFFF; }.recommendation-card h3 { margin: 16px 0 10px; font-size: 24px; line-height: 1.02; letter-spacing: -.045em; }.recommendation-card > p { margin: 0; color: rgba(255,255,255,.68); font-size: 9px; line-height: 1.55; }.recommendation-card ol { display: grid; gap: 7px; margin: 16px 0 0; padding: 0; list-style: none; }.recommendation-card li { display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,.88); font-size: 8px; font-weight: 650; }.recommendation-card li span { display: flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 6px; background: rgba(255,255,255,.12); color: #CFC9FF; font-size: 7px; font-weight: 900; }
.research-disclosure { margin: 0 50px 46px; border: 1px solid #E1E0E8; border-radius: 18px; background: #FFFFFF; overflow: hidden; }.research-disclosure summary { display: flex; cursor: pointer; align-items: center; justify-content: space-between; gap: 20px; padding: 17px 19px; list-style: none; }.research-disclosure summary::-webkit-details-marker { display:none; }.research-disclosure summary > div { display: flex; align-items: center; gap: 10px; }.research-disclosure summary strong { font-size: 11px; }.research-disclosure summary > span { color: #858794; font-size: 8px; font-weight: 750; }.research-body { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; border-top: 1px solid #E9E8EE; background: #E9E8EE; }.research-body article { padding: 18px; background: #FAFAFC; }.research-body h3 { margin: 0; font-size: 10px; }.research-body p { margin: 7px 0 0; color: #727582; font-size: 8px; line-height: 1.55; }
@media (max-width: 900px) { body{padding:10px}.artifact-header{grid-template-columns:1fr;padding:32px}.confidence-card{max-width:300px}.comparison-section,.decision-section{padding-left:28px;padding-right:28px}.screen-row{grid-template-columns:repeat(2,1fr)}.decision-grid{grid-template-columns:1fr}.research-disclosure{margin-left:28px;margin-right:28px}.research-body{grid-template-columns:1fr}.section-heading{align-items:flex-start;flex-direction:column}.section-heading>p{text-align:left}.journey-label>.pill{display:none} }
`;
