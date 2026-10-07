export type OpeningRecord = {
  team: string;
  image: string;
  y: number;
  country: string;
  flag: string;
  tier: string;
  positions: Array<{ name: string; spots: number }>;
  nextStep: string;
  applied?: number;
  location?: string;
  description?: string;
  postedBy?: string;
  simulatedFields?: string[];
};

// Card facts and logo crops come from the current Northstar tenant captures.
// Only Minnesota has a captured detail page; other detail copy is simulated.
export const capturedOpenings: OpeningRecord[] = [
  { team: "Minnesota Blue Ox", image: "openings-top", y: 232, country: "USA", flag: "🇺🇸", tier: "ELITE", positions: [{ name: "Forward", spots: 3 }, { name: "Defenseman", spots: 2 }], nextStep: "Tryout", applied: 1, location: "River Falls, USA", description: "POSTING IS FOR THE KINNI SPIRIT Usphl Premier, we are the affiliate team for the Minnesota Blue ox NCDC", postedBy: "Trevor Daly" },
  { team: "P.A.L. Junior Islanders 16U", image: "openings-top", y: 383, country: "USA", flag: "🇺🇸", tier: "ELITE", positions: [{ name: "Forward", spots: 3 }], nextStep: "Call" },
  { team: "Mid Fairfield Rangers 16U", image: "openings-top", y: 535, country: "USA", flag: "🇺🇸", tier: "ELITE", positions: [{ name: "Forward", spots: 3 }], nextStep: "Team Visit" },
  { team: "Connecticut Jr. Rangers Premier", image: "openings-more", y: 249, country: "USA", flag: "🇺🇸", tier: "JUNIOR", positions: [{ name: "Defenseman", spots: 1 }], nextStep: "Call" },
  { team: "Walpole Express EHLP", image: "openings-more", y: 400, country: "USA", flag: "🇺🇸", tier: "JUNIOR", positions: [{ name: "Forward", spots: 1 }, { name: "Defenseman", spots: 1 }], nextStep: "Call" },
  { team: "St. George Ravens", image: "openings-more", y: 553, country: "Canada", flag: "🇨🇦", tier: "ELITE", positions: [{ name: "Forward", spots: 3 }, { name: "Defenseman", spots: 2 }], nextStep: "Call" },
  { team: "Washington Little Caps 16U", image: "openings-later", y: 283, country: "United States", flag: "🇺🇸", tier: "ELITE", positions: [{ name: "Defenseman", spots: 1 }], nextStep: "Call", applied: 2 },
  { team: "Vimmerby HC J20", image: "openings-later", y: 435, country: "Sweden", flag: "🇸🇪", tier: "AAA", positions: [{ name: "Forward", spots: 3 }, { name: "Defenseman", spots: 2 }, { name: "Goalie", spots: 1 }], nextStep: "Meeting" },
  { team: "Draft Boston Hockey Academy", image: "openings-later", y: 587, country: "USA", flag: "🇺🇸", tier: "ACADEMY", positions: [{ name: "Forward", spots: 2 }, { name: "Defenseman", spots: 2 }, { name: "Forward", spots: 2 }, { name: "Defenseman", spots: 1 }, { name: "Forward", spots: 2 }, { name: "Defenseman", spots: 2 }, { name: "Forward", spots: 1 }], nextStep: "Meeting", simulatedFields: ["untruncated team name", "tier", "next step"] },
  { team: "Delta College prep", image: "openings-later-ii", y: 363, country: "USA", flag: "🇺🇸", tier: "JUNIOR", positions: [{ name: "Defenseman", spots: 2 }], nextStep: "Call" },
  { team: "Boston Hockey Academy 16U", image: "openings-later-ii", y: 515, country: "USA", flag: "🇺🇸", tier: "AAA", positions: [{ name: "Defenseman", spots: 1 }], nextStep: "Meeting", applied: 1 },
  { team: "Austria U17", image: "openings-later-ii", y: 667, country: "Austria", flag: "🇦🇹", tier: "ELITE", positions: [{ name: "Forward", spots: 1 }], nextStep: "Call", simulatedFields: ["country label", "tier", "positions", "next step"] },
];
