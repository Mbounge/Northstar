import { validMeditoDemoEmail } from "./medito-captures";

export type MeditoScreen = "welcome" | "email" | "verify" | "experience" | "reminders" | "firstMeditation" | "support" | "loading" | "donation" | "home";
export interface MeditoSimulation {
  screen: MeditoScreen; history: MeditoScreen[]; email: string; code: string;
  experience: string | null; reminder: string | null; donationAmount: string; welcomeVisible: boolean;
}
export function initialMeditoSimulation(): MeditoSimulation {
  return { screen: "welcome", history: [], email: "", code: "", experience: null, reminder: null, donationAmount: "10", welcomeVisible: true };
}
export type MeditoAction =
  | { type: "navigate"; screen: MeditoScreen }
  | { type: "back" | "reset" | "submitEmail" | "skipReminder" | "deferMeditation" | "openSupport" | "loaded" | "closeDonation" | "dismissWelcome" }
  | { type: "email" | "code" | "experience" | "reminder" | "donationAmount"; value: string }
  | { type: "submitCode"; expected: string };
function move(state: MeditoSimulation, screen: MeditoScreen): MeditoSimulation {
  return state.screen === screen ? state : { ...state, screen, history: [...state.history, state.screen] };
}
export function meditoSimulationReducer(state: MeditoSimulation, action: MeditoAction): MeditoSimulation {
  switch (action.type) {
    case "reset": return initialMeditoSimulation();
    case "navigate": return move(state, action.screen);
    case "back": { const screen = state.history.at(-1); return screen ? { ...state, screen, history: state.history.slice(0, -1) } : state; }
    case "email": return { ...state, email: action.value };
    case "code": return { ...state, code: action.value.replace(/\D/g, "").slice(0, 6) };
    case "submitEmail": return state.screen === "email" && validMeditoDemoEmail(state.email) ? move({ ...state, email: state.email.trim() }, "verify") : state;
    case "submitCode": return state.screen === "verify" && state.code === action.expected && /^\d{6}$/.test(state.code) ? move(state, "experience") : state;
    case "experience": return state.screen === "experience" ? move({ ...state, experience: action.value }, "reminders") : state;
    case "reminder": return state.screen === "reminders" ? move({ ...state, reminder: action.value }, "firstMeditation") : state;
    case "skipReminder": return state.screen === "reminders" ? move({ ...state, reminder: null }, "firstMeditation") : state;
    case "deferMeditation": return state.screen === "firstMeditation" ? move(state, "support") : state;
    case "openSupport": return state.screen === "support" ? move(state, "loading") : state;
    case "loaded": return state.screen === "loading" ? { ...state, screen: "donation" } : state;
    case "closeDonation": return state.screen === "donation" ? move(state, "home") : state;
    case "dismissWelcome": return state.screen === "home" ? { ...state, welcomeVisible: false } : state;
    case "donationAmount": return { ...state, donationAmount: action.value.replace(/[^\d.]/g, "") };
  }
}
export const meditoSimulationSections: Array<{ screen: MeditoScreen; label: string }> = [
  { screen: "welcome", label: "Welcome" }, { screen: "email", label: "Account entry" },
  { screen: "experience", label: "Personalization" }, { screen: "reminders", label: "Reminders" },
  { screen: "firstMeditation", label: "First meditation" }, { screen: "support", label: "Supporting Medito" }, { screen: "home", label: "Home" },
];
export function meditoActiveSection(screen: MeditoScreen): MeditoScreen {
  return screen === "verify" ? "email" : screen === "loading" || screen === "donation" ? "support" : screen;
}
