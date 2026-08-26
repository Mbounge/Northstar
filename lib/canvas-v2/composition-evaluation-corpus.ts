import type { CanvasV2CompositionPromptCase } from "@/lib/canvas-v2/composition-evaluation";

const FINAL_ACCEPTANCE = {
  requiresUserFacingSummary: true,
  requiresNoVisibleRecovery: true,
  requiresNarrativeProximity: true,
} as const;

/**
 * Patch 8E.1 evaluates semantic range, not a library of preferred layouts.
 * Cases declare only facts explicitly required by the prompt; visual form is
 * left to Northstar and reviewed from the resulting screenshot.
 */
export const CANVAS_V2_COMPOSITION_EVALUATION_CORPUS: readonly CanvasV2CompositionPromptCase[] = [
  {
    id: "founder-market-entry-landscape",
    title: "Founder market-entry decision landscape",
    category: "decision-landscape",
    prompt: "Create a market-entry decision landscape for a vertical SaaS founder. Separate observed signals from assumptions, show where the entry wedge converges, and make the next, later, and not-yet decisions easy to inspect. Do not fabricate external research.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.1", "8e.4", "smoke", "empty", "strategy"],
    factualExpectations: { ...FINAL_ACCEPTANCE },
    reviewFocus: [
      "Can a founder distinguish evidence, assumptions, and decisions without reading every word?",
      "Does the spatial argument reveal why the proposed wedge creates learning?",
    ],
  },
  {
    id: "signal-to-decision-causal-system",
    title: "Signal-to-decision causal system",
    category: "causal-system",
    prompt: "Build a spatial relationship map showing how a weak market signal becomes evidence, interpretation, a hypothesis, and then a decision. Make the causal relationships native and independently editable. Avoid a generic flowchart treatment.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.1", "8e.4", "smoke", "empty", "relationships"],
    factualExpectations: { ...FINAL_ACCEPTANCE, requiresRelationships: true },
    reviewFocus: [
      "Do the relationships communicate transformation and causality rather than mere ordering?",
      "Is the composition more useful than a row of labeled boxes?",
    ],
  },
  {
    id: "discovery-landscape-at-scale",
    title: "Large two-dimensional discovery landscape",
    category: "uncertainty",
    prompt: "Create a large two-dimensional discovery landscape that connects an unresolved question, evidence field, opportunity, and decision across distant parts of the canvas. Keep the full argument navigable and coherent at multiple zoom levels.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.1", "smoke", "empty", "large-canvas"],
    factualExpectations: { requiresRelationships: true },
    reviewFocus: [
      "Does distance carry meaning while the board still reads as one connected argument?",
      "Can the user understand both the overview and the local detail at useful zoom levels?",
    ],
  },
  {
    id: "awin-whop-evidence-comparison",
    title: "Awin and Whop evidence-led comparison",
    category: "comparison",
    prompt: "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave the working surface visible so I can inspect how the conclusion was reached.",
    startingState: "empty",
    evidenceMode: "account",
    tags: ["8e.1", "8e.3", "8e.4", "evidence", "comparison", "real-workflow", "generalization"],
    factualExpectations: { ...FINAL_ACCEPTANCE, requiresEvidence: true, expectedInteractionRoute: "research-design" },
    reviewFocus: [
      "Are product-specific claims visibly grounded in the relevant screens?",
      "Does the comparison resolve into a decision-useful insight instead of stopping at description?",
    ],
  },
  {
    id: "launch-learning-sequence",
    title: "Launch learning sequence",
    category: "sequence",
    prompt: "Compose a launch learning sequence for a startup with three weeks of runway. Show what must happen now, which signals change the plan, and where a reversible experiment becomes an irreversible commitment. Use the canvas to expose the decision logic, not just a schedule.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.1", "empty", "sequence"],
    factualExpectations: {},
    reviewFocus: [
      "Is time subordinate to learning and decision thresholds rather than presented as a decorative timeline?",
      "Can the viewer tell what new evidence would change the sequence?",
    ],
  },
  {
    id: "customer-confidence-journey",
    title: "Customer confidence journey",
    category: "journey",
    prompt: "Map the journey of a first-time operator evaluating an unfamiliar B2B product, from initial doubt to confident adoption. Show moments where trust can increase or collapse, and make the most important intervention visually unmistakable.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.1", "empty", "journey"],
    factualExpectations: {},
    reviewFocus: [
      "Does the journey reveal changing confidence, not merely a sequence of touchpoints?",
      "Is the pivotal intervention specific and visually earned?",
    ],
  },
  {
    id: "opportunity-prioritization",
    title: "Opportunity prioritization field",
    category: "prioritization",
    prompt: "Create a prioritization view for six product opportunities using customer urgency, learning value, reversibility, and implementation effort. Surface the tension between the apparently safest choice and the choice that teaches the team fastest.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.1", "empty", "prioritization"],
    factualExpectations: {},
    reviewFocus: [
      "Does the visual expose the tradeoff instead of mechanically ranking items?",
      "Can the viewer trace why the learning-oriented choice differs from the safest choice?",
    ],
  },
  {
    id: "sparse-founder-brief",
    title: "Sparse founder brief",
    category: "brief",
    prompt: "Turn this into a sparse founder brief: retention is stable, acquisition is slowing, the team has two engineers for six weeks, and three enterprise prospects are asking for audit logs. Show the governing question, the strongest hypothesis, the main risk, and the next decision. Keep only what strengthens the argument.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.1", "empty", "restraint"],
    factualExpectations: {},
    reviewFocus: [
      "Does the composition remain sparse without becoming generic or under-explained?",
      "Is the next decision clearly connected to the strongest hypothesis and risk?",
    ],
  },
  {
    id: "positioning-territories-without-research",
    title: "Creative positioning territories without research",
    category: "positioning",
    prompt: "Create three genuinely different positioning territories for an AI customer-support product made for small teams. Treat them as creative strategic directions, not market facts. Give each territory a distinctive promise, emotional register, and visual character so the team can discuss which one to develop. Do not research competitors.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.3", "8e.4", "generalization", "evidence-free", "creative", "follow-up"],
    factualExpectations: { ...FINAL_ACCEPTANCE, forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Do the territories feel meaningfully different rather than like three renamed cards?",
      "Does the visual expression make each strategic direction discussable without presenting invented facts?",
    ],
    followUps: [{
      id: "alternative-right",
      title: "Preserved alternative to the right",
      prompt: "Keep the original composition intact and create a visually different fourth positioning territory to its right. It should challenge the assumptions shared by the first three rather than merely adding another variation.",
      factualExpectations: {
        forbidsEvidence: true,
        forbidsResearch: true,
        expectedInteractionRoute: "transform",
        requiresPriorObjectPreservation: true,
        requiresRevisionAdvance: true,
      },
      reviewFocus: [
        "Is the original composition visibly preserved?",
        "Does the new territory create a genuine counter-position in nearby canvas space?",
      ],
    }],
  },
  {
    id: "pricing-packaging-hypotheses",
    title: "Pricing and packaging hypothesis landscape",
    category: "pricing",
    prompt: "Turn these inputs into a pricing and packaging hypothesis landscape: solo customers currently pay $20 per month, team usage is spiky, audit logs are requested by enterprise prospects, and we have not tested willingness to pay. Compare three package directions and show what each would teach us. Treat every package as a proposal, not validated market evidence.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.3", "generalization", "provided-context", "pricing"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Can the team compare package logic and learning value without mistaking proposals for facts?",
      "Does the composition expose the unresolved willingness-to-pay question?",
    ],
  },
  {
    id: "customer-interview-quote-synthesis",
    title: "Customer interview quote synthesis",
    category: "synthesis",
    prompt: "Synthesize these customer interview notes on the canvas: ‘I export every Friday because I do not trust the dashboard’; ‘The alert arrives after I have already checked manually’; ‘I invited finance only when renewal was due’; ‘The weekly email is the one thing I forward.’ Preserve the quotes, reveal the tensions between trust, timing, and collaboration, and finish with two opportunity directions. Use only what I supplied.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.3", "8e.4", "generalization", "provided-context", "customer-research"],
    factualExpectations: { ...FINAL_ACCEPTANCE, forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Are the supplied quotes preserved and distinguishable from interpretation?",
      "Do the opportunity directions arise visibly from tensions in the notes?",
    ],
  },
  {
    id: "founder-decision-workshop",
    title: "Founder decision workshop",
    category: "workshop",
    prompt: "Design a 60-minute founder workshop on the canvas for deciding whether to narrow the product to one customer segment. Create a facilitation surface that supports divergence, challenge, commitment, and a written decision at the end. Make it inviting to use live with a team rather than presenting it as a report.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.3", "8e.4", "generalization", "evidence-free", "facilitation", "mixed-authorship"],
    factualExpectations: { ...FINAL_ACCEPTANCE, forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform", requiresWritableSurfaces: true },
    reviewFocus: [
      "Does the canvas invite participation and progression rather than merely describe an agenda?",
      "Is the final commitment connected to the preceding divergence and challenge activities?",
    ],
  },
  {
    id: "experiment-portfolio",
    title: "Bounded experiment portfolio",
    category: "experiment",
    prompt: "Create an experiment portfolio from these constraints: two engineers, six weeks, uncertain enterprise demand, and a hard requirement not to interrupt the current self-serve funnel. Show several reversible tests, what each test teaches, and the conditions that would justify a larger commitment. Do not add market evidence I did not provide.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.3", "generalization", "provided-context", "experiments"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Does the portfolio make learning, cost, and reversibility spatially comparable?",
      "Are commitment conditions visibly connected to the tests that can satisfy them?",
    ],
  },
  {
    id: "six-week-outcome-roadmap",
    title: "Six-week outcome roadmap",
    category: "roadmap",
    prompt: "Build a six-week outcome roadmap for improving activation. The team can ship only two meaningful changes, instrumentation is incomplete, and the goal is to learn why new accounts fail before their first success. Organize the work around outcomes and learning gates rather than a feature backlog.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.3", "generalization", "provided-context", "roadmap"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Does the roadmap privilege outcomes and learning gates over feature scheduling?",
      "Can the viewer tell why only two changes deserve implementation?",
    ],
  },
  {
    id: "lean-operating-model",
    title: "Lean startup operating model",
    category: "operating-model",
    prompt: "Create a visual operating model for a five-person startup where product, sales, and customer support all influence weekly priorities. Show how signals enter, how decisions get made, who owns the next action, and how the team prevents urgent requests from consuming the roadmap. This is an operating design exercise; no external research is needed.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.3", "generalization", "evidence-free", "operations"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Does the operating model clarify ownership and decision flow without becoming a generic org chart?",
      "Is the mechanism for protecting the roadmap visually explicit?",
    ],
  },
  {
    id: "launch-campaign-narrative",
    title: "Creative launch campaign narrative",
    category: "campaign",
    prompt: "Create a launch campaign concept for a calm finance tool that helps freelancers understand irregular income. Build the campaign around one memorable narrative, then express the opening hook, three creative moments, channel adaptations, and the final call to action. This is creative development, not a request for market research.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.3", "8e.4", "generalization", "evidence-free", "marketing"],
    factualExpectations: { ...FINAL_ACCEPTANCE, forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Does the board communicate one memorable campaign idea rather than a list of deliverables?",
      "Do channel adaptations retain the same narrative while changing expression?",
    ],
  },
  {
    id: "investor-update-story",
    title: "Investor update visual story",
    category: "brief",
    prompt: "Turn these founder notes into a concise investor update on the canvas: monthly recurring revenue grew 18%, churn stayed flat, the largest customer expanded, activation declined, and the team paused two roadmap items to investigate onboarding. Make the tension between growth and activation unmistakable, then show what the team is doing next. Use only these supplied facts.",
    startingState: "empty",
    evidenceMode: "provided",
    tags: ["8e.3", "generalization", "provided-context", "communication"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Is the growth-versus-activation tension clear at a glance?",
      "Are supplied facts visually separated from the team's next actions?",
    ],
  },
  {
    id: "service-recovery-blueprint",
    title: "Service recovery blueprint",
    category: "journey",
    prompt: "Create a service-recovery blueprint for a customer whose payment failed during an urgent purchase. Show the customer's emotional state, visible product moments, behind-the-scenes actions, and the handoffs that determine whether trust is recovered. Keep it practical enough for product and support teams to edit together.",
    startingState: "empty",
    evidenceMode: "none",
    tags: ["8e.3", "generalization", "evidence-free", "service-design"],
    factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" },
    reviewFocus: [
      "Does the blueprint connect customer emotion to operational handoffs?",
      "Can product and support identify concrete intervention points without reading a report?",
    ],
  },
] as const;

export function canvasV2CompositionCasesForTags(tags: readonly string[]): CanvasV2CompositionPromptCase[] {
  if (!tags.length) return [...CANVAS_V2_COMPOSITION_EVALUATION_CORPUS];
  return CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.filter((promptCase) => tags.every((tag) => promptCase.tags.includes(tag)));
}

export function canvasV2CompositionCaseById(id: string): CanvasV2CompositionPromptCase | undefined {
  return CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.find((promptCase) => promptCase.id === id);
}
