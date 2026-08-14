import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";

function image(label: string, color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="720"><rect width="360" height="720" rx="28" fill="${color}"/><rect x="24" y="60" width="312" height="600" rx="22" fill="white"/><text x="44" y="120" font-family="Arial" font-size="22" font-weight="700" fill="#191922">${label}</text><rect x="44" y="160" width="272" height="210" rx="18" fill="#eeeaff"/><rect x="44" y="410" width="272" height="18" rx="9" fill="#dedee8"/><rect x="44" y="446" width="220" height="18" rx="9" fill="#dedee8"/><rect x="44" y="560" width="272" height="52" rx="26" fill="${color}"/></svg>`)}`;
}

function fixtureApp(name: string, color: string, screenNames: string[]): AppDataApp {
  const appId = `app:${name.toLowerCase()}`;
  const flow: AppDataFlow = {
    id: `flow:${name.toLowerCase()}:onboarding`,
    name: "Mobile onboarding",
    description: `Captured ${name} account creation`,
    appName: name,
    platform: "mobile",
    sessionType: "onboarding",
    scope: "journey",
    taxonomyPath: ["Mobile onboarding"],
    descendantFlowCount: 1,
    screens: screenNames.map((screenName, index) => ({ id: `${name.toLowerCase()}-screen-${index + 1}`, name: screenName, imageUrl: image(screenName, index % 2 ? color : `${color}dd`), appName: name, flowName: "Mobile onboarding", platform: "mobile", sessionType: "onboarding", index })),
  };
  return { id: appId, name, iconUrl: image(name.slice(0, 1), color), totalScreens: flow.screens.length, flows: [flow] };
}

const awin = fixtureApp("Awin", "#6b4dff", [
  "Landing", "Sign in", "Choose persona",
  ...Array.from({ length: 44 }, (_, index) => ["Creator promise", "Partner profile", "Company details", "Goals", "Verification", "Payment", "Preferences", "Activation"][index % 8] + ` · ${index + 1}`),
]);
const awinFlow = awin.flows[0]!;
awinFlow.name = "Landing & Persona Selection → Creator & Influencer Onboarding";
awinFlow.screens.forEach((screen) => { screen.flowName = awinFlow.name; });
awinFlow.scope = "path";
awinFlow.taxonomyPath = ["Landing & Persona Selection", "Creator & Influencer Onboarding"];
awinFlow.journeySegments = [
  { id: "awin-shared-entry", name: "Landing & Persona Selection", kind: "shared-entry", startIndex: 0, screenCount: 3 },
  { id: "awin-creator-branch", name: "Creator & Influencer Onboarding", kind: "branch", startIndex: 3, screenCount: 44 },
];

export const CANVAS_V2_E2E_APPS = [
  awin,
  fixtureApp("Whop", "#ff4f18", Array.from({ length: 17 }, (_, index) => ["Welcome", "Email", "Username", "Account", "Profile", "Interests", "Community", "Ready"][index % 8] + ` · ${index + 1}`)),
];
