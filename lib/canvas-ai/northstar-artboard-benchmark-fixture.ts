// Acceptance input only. The production design engine receives these as an
// ordinary ordered objective queue and has no knowledge of their identities.
export const NORTHSTAR_ARTBOARD_BENCHMARK_OBJECTIVES = [
  "Place a Hello World card below the research.",
  "Place a Hello World 2 card to the right of the research and vertically center-align it with the research.",
  "Construct a visual relationship between the first Awin screenshot and the first Whop screenshot.",
  "Create equal space between the first and second Awin screenshots and insert an annotation in that space.",
  "Add an explanation to the Awin screenshot where the user chooses their role.",
  "Make the Awin and Whop onboarding flows easier to distinguish as separate groups.",
  "Create a new analysis area below the current onboarding flows and reuse the Awin screenshot where the user chooses their role there. Preserve the original evidence and make the reused view clearly part of the new analysis area.",
] as const;
