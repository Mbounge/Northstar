export const graetPreviewSections = [
  { id: "onboarding", label: "Onboarding", screen: "welcome" },
  { id: "home", label: "Home", screen: "career" },
  { id: "explore", label: "Explore", screen: "players" },
  { id: "ai", label: "AI", screen: "ai" },
  { id: "chat", label: "Chat", screen: "chat" },
  { id: "profile", label: "Profile", screen: "profile" },
] as const;

export type GraetPreviewSection = (typeof graetPreviewSections)[number]["id"];

export const GRAET_PREVIEW_NAVIGATE = "northstar:graet-preview-navigate";
export const GRAET_PREVIEW_SECTION = "northstar:graet-preview-section";

export function isGraetPreviewSection(value: unknown): value is GraetPreviewSection {
  return graetPreviewSections.some((section) => section.id === value);
}
