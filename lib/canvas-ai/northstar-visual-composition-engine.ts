// lib/canvas-ai/northstar-visual-composition-engine.ts
// Northstar v0.6.0.1 — model-authored first-frame composition language and safe semantic renderer.
import type { CanvasCodeArtifactDataBundle, NorthstarWebArtifactDocument } from "@/lib/canvas-artifacts/types";

export type NorthstarWorkingObjectRole =
  | "title"
  | "framing"
  | "status"
  | "identity"
  | "open-question"
  | "hypothesis"
  | "research-note"
  | "evidence-bay"
  | "provenance";

export interface NorthstarWorkingCompositionObject {
  id: string;
  role: NorthstarWorkingObjectRole;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  appName?: string;
  emphasis: "hero" | "primary" | "supporting" | "peripheral";
  material: "paper" | "glass" | "ink" | "outline" | "quiet";
  rotation?: number;
}

export interface NorthstarFoundationCompositionPlan {
  schema: "northstar.working-composition.v1";
  title: string;
  visualThesis: string;
  threeSecondRead: string;
  emotionalRegister: string;
  background: string;
  foreground: string;
  accent: string;
  secondaryAccent: string;
  objects: NorthstarWorkingCompositionObject[];
}

export const NORTHSTAR_FOUNDATION_COMPOSITION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "title", "visualThesis", "threeSecondRead", "emotionalRegister", "background", "foreground", "accent", "secondaryAccent", "objects"],
  properties: {
    schema: { type: "string", enum: ["northstar.working-composition.v1"] },
    title: { type: "string" }, visualThesis: { type: "string" }, threeSecondRead: { type: "string" }, emotionalRegister: { type: "string" },
    background: { type: "string" }, foreground: { type: "string" }, accent: { type: "string" }, secondaryAccent: { type: "string" },
    objects: { type: "array", minItems: 5, maxItems: 14, items: { type: "object", additionalProperties: false,
      required: ["id", "role", "x", "y", "width", "height", "emphasis", "material"],
      properties: {
        id: { type: "string" }, role: { type: "string", enum: ["title","framing","status","identity","open-question","hypothesis","research-note","evidence-bay","provenance"] },
        x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, text: { type: "string" }, appName: { type: "string" },
        emphasis: { type: "string", enum: ["hero","primary","supporting","peripheral"] }, material: { type: "string", enum: ["paper","glass","ink","outline","quiet"] }, rotation: { type: "number" },
      },
    } },
  },
} as const;

export function buildNorthstarFoundationCompositionSystemInstruction(): string {
  return `You are Northstar's first-frame visual director. Design the first visible state of one living artboard before research begins.
The board must already feel authored, problem-specific, premium, and visually memorable—not like an application template.
Return a semantic composition plan, not HTML or CSS. Place objects on a 2360px-wide canvas using x/y/width/height.
The title may live anywhere and should participate in the governing idea. Use research notes, hypotheses, open questions, identity objects, and negative space intentionally.
Include exactly one evidence-bay object. It is the safe normal-flow region where grounded evidence will arrive and must be at least 1200px wide and 300px high.
Include title, framing, status, and at least one identity per known app. Avoid a fixed kicker/title/deck/right-column pattern. Avoid generic dashboards, equal cards, and decorative clutter.
Working objects must communicate state: questions feel unresolved, hypotheses feel provisional, identity feels grounded, status feels quiet.
Use tasteful restrained color values as valid CSS colors. Do not use gradients as text values. Ensure every object remains inside x 40..2320 and y 40..900.
The first frame must be beautiful enough to watch and flexible enough to evolve.`;
}

const esc = (value: string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const clamp = (n: unknown, min: number, max: number, fallback: number) => typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^(#|rgb|hsl|oklch|[a-z])/i.test(value.trim()) ? value.trim().slice(0,80) : fallback;

export function sanitizeNorthstarFoundationCompositionPlan(raw: Partial<NorthstarFoundationCompositionPlan>, bundle: CanvasCodeArtifactDataBundle, fallbackTitle: string): NorthstarFoundationCompositionPlan {
  const apps = bundle.apps.slice(0, 4);
  const incoming = Array.isArray(raw.objects) ? raw.objects : [];
  const objects: NorthstarWorkingCompositionObject[] = incoming.slice(0,14).map((o, i) => ({
    id: String(o?.id || `working-object-${i+1}`).replace(/[^a-z0-9_-]+/gi,"-").toLowerCase(), role: (o?.role || "research-note") as NorthstarWorkingObjectRole,
    x: clamp(o?.x,40,2100,80+i*40), y: clamp(o?.y,40,820,80+i*40), width: clamp(o?.width,180,1800,420), height: clamp(o?.height,80,620,160),
    text: typeof o?.text === "string" ? o.text.slice(0,420) : undefined, appName: typeof o?.appName === "string" ? o.appName.slice(0,80) : undefined,
    emphasis: (["hero","primary","supporting","peripheral"] as const).includes(o?.emphasis as any) ? o!.emphasis! : "supporting",
    material: (["paper","glass","ink","outline","quiet"] as const).includes(o?.material as any) ? o!.material! : "quiet",
    rotation: clamp(o?.rotation,-4,4,0),
  }));
  const ensure = (role: NorthstarWorkingObjectRole, object: NorthstarWorkingCompositionObject) => { if (!objects.some(o => o.role === role)) objects.push(object); };
  ensure("title", { id:"title", role:"title", x:80,y:90,width:1100,height:180,text:raw.title || fallbackTitle,emphasis:"hero",material:"ink" });
  ensure("framing", { id:"deck", role:"framing", x:90,y:275,width:850,height:120,text:raw.visualThesis || bundle.coverageSummary,emphasis:"primary",material:"quiet" });
  ensure("status", { id:"current-act", role:"status", x:1780,y:80,width:430,height:120,text:"Northstar is grounding the problem and deciding what deserves visual emphasis.",emphasis:"peripheral",material:"outline" });
  ensure("evidence-bay", { id:"evidence", role:"evidence-bay", x:80,y:430,width:2200,height:390,emphasis:"primary",material:"glass" });
  for (const [index, app] of apps.entries()) if (!objects.some(o => o.role === "identity" && (o.appName||"").toLowerCase() === app.name.toLowerCase())) objects.push({ id:`identity-${index+1}`,role:"identity",x:90+index*360,y:400,width:320,height:100,appName:app.name,text:app.summary,emphasis:"supporting",material:"paper" });
  return { schema:"northstar.working-composition.v1", title:String(raw.title || fallbackTitle).slice(0,120), visualThesis:String(raw.visualThesis || bundle.coverageSummary).slice(0,500), threeSecondRead:String(raw.threeSecondRead || raw.visualThesis || fallbackTitle).slice(0,240), emotionalRegister:String(raw.emotionalRegister || "precise editorial curiosity").slice(0,120), background:color(raw.background,"#F7F5FF"), foreground:color(raw.foreground,"#151620"), accent:color(raw.accent,"#6B4DFF"), secondaryAccent:color(raw.secondaryAccent,"#FF5C35"), objects:objects.slice(0,16) };
}

export function renderNorthstarFoundationComposition(plan: NorthstarFoundationCompositionPlan, bundle: CanvasCodeArtifactDataBundle, activeAct: string): NorthstarWebArtifactDocument {
  const appMap = new Map(bundle.apps.map(a => [a.name.toLowerCase(), a]));
  const nodes = plan.objects.map((o) => {
    const id = o.role === "title" ? "title" : o.role === "framing" ? "deck" : o.role === "status" ? "current-act" : o.role === "evidence-bay" ? "evidence" : o.id;
    if (o.role === "evidence-bay") return `<section class="ns-canvas-object ns-evidence-bay" data-ns-node-id="evidence" data-ns-working-role="evidence-bay" style="--x:${o.x}px;--y:${o.y}px;--w:${o.width}px;--h:${o.height}px"></section>`;
    if (o.role === "identity") { const app=appMap.get((o.appName||"").toLowerCase()); return `<article class="ns-canvas-object ns-identity-object" data-ns-node-id="${esc(id)}" data-ns-working-role="identity" style="--x:${o.x}px;--y:${o.y}px;--w:${o.width}px;--h:${o.height}px;--r:${o.rotation||0}deg">${app?.iconUrl?`<img src="${esc(app.iconUrl)}" alt="${esc(app.name)} icon">`:""}<div><strong>${esc(app?.name||o.appName||"Identity")}</strong><span>${esc(o.text||app?.summary||"Grounded identity")}</span></div></article>`; }
    const tag=o.role==="title"?"h1":"div"; const text=o.role==="status"?activeAct:(o.text||"");
    return `<${tag} class="ns-canvas-object ns-working-${o.role} ns-material-${o.material} ns-emphasis-${o.emphasis}" data-ns-node-id="${esc(id)}" data-ns-working-role="${o.role}" style="--x:${o.x}px;--y:${o.y}px;--w:${o.width}px;--h:${o.height}px;--r:${o.rotation||0}deg">${o.role==="status"?`<span>Current design act</span><strong data-ns-node-id="current-act-text">${esc(text)}</strong>`:esc(text)}</${tag}>`;
  }).join("");
  return { schema:"northstar.web-artifact-document.v1", html:`<main class="ns-artifact ns-composition-artifact" data-ns-node-id="artboard" data-ns-design-kernel="v2" data-ns-publication="working" data-ns-three-second-read="${esc(plan.threeSecondRead)}"><header data-ns-node-id="header" data-ns-stage="foundation"></header>${nodes}<section data-ns-node-id="synthesis" data-ns-stage="analysis"></section><section data-ns-node-id="decision" data-ns-stage="recommendation"></section></main>`, css:`.ns-composition-artifact{position:relative;width:2360px;min-width:1180px;min-height:920px;overflow:visible;background:${plan.background};color:${plan.foreground};font-family:Inter,ui-sans-serif,system-ui,sans-serif}.ns-canvas-object{position:absolute;left:var(--x);top:var(--y);width:var(--w);min-height:var(--h);transform:rotate(var(--r,0deg));box-sizing:border-box}.ns-working-title{margin:0;font-size:76px;line-height:.92;letter-spacing:-.065em;font-weight:900;display:flex;align-items:flex-end}.ns-working-framing{font-size:22px;line-height:1.38;max-width:70ch}.ns-working-status{padding:18px 20px;border:1px solid color-mix(in srgb,${plan.accent} 30%,transparent);border-radius:20px;background:color-mix(in srgb,${plan.background} 78%,white);box-shadow:0 18px 50px rgba(30,20,70,.08)}.ns-working-status span{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${plan.accent}}.ns-working-status strong{display:block;margin-top:8px;font-size:15px;line-height:1.4}.ns-identity-object{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:22px;background:white;box-shadow:0 16px 44px rgba(30,20,70,.1)}.ns-identity-object img{width:52px;height:52px;border-radius:15px;object-fit:cover}.ns-identity-object strong{display:block;font-size:18px}.ns-identity-object span{display:block;margin-top:3px;font-size:12px;line-height:1.35;opacity:.65}.ns-working-open-question,.ns-working-hypothesis,.ns-working-research-note{padding:20px 22px;border-radius:18px;font-size:17px;line-height:1.4}.ns-working-open-question{background:#FFF2A8;box-shadow:0 18px 40px rgba(93,69,0,.12)}.ns-working-hypothesis{border:2px solid ${plan.accent};background:color-mix(in srgb,${plan.accent} 7%,white)}.ns-working-research-note{background:white;box-shadow:0 14px 38px rgba(30,20,70,.08)}.ns-evidence-bay{position:absolute!important;display:grid;gap:28px;padding:24px;border-radius:28px;border:1px solid color-mix(in srgb,${plan.accent} 16%,transparent);background:color-mix(in srgb,white 72%,${plan.background});overflow:visible}.ns-evidence-bay:empty:before{content:"Evidence will arrive here";font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${plan.accent};opacity:.55}.working-flow{display:grid;grid-template-columns:170px max-content;gap:24px;align-items:center;padding:20px 0;border-top:1px solid rgba(50,40,90,.12)}.working-flow:first-child{border-top:0}.working-flow__identity{display:flex;align-items:center;gap:12px}.working-flow__identity img{width:46px;height:46px;border-radius:13px}.working-flow__identity strong{display:block;font-size:18px}.working-flow__identity span{display:block;font-size:12px;opacity:.6}.working-flow__sequence{display:flex;align-items:flex-end;gap:18px;width:max-content;overflow:visible}.working-flow figure{margin:0;width:170px;min-width:170px;flex:0 0 170px}.working-flow figure img{width:100%;height:auto;max-height:270px;object-fit:contain;filter:drop-shadow(0 12px 20px rgba(32,24,80,.09))}[data-ns-node-id="synthesis"],[data-ns-node-id="decision"]{position:relative}.ns-artifact [data-ns-node-id]{transition:transform 360ms cubic-bezier(.2,.8,.2,1),opacity 260ms ease,width 360ms ease,height 360ms ease,left 360ms ease,top 360ms ease}`, javascript:"" };
}
