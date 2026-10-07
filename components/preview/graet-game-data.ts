// Captured September 28 results from the current Northstar tenant; simulated entries are marked.
export type CapturedMatch = { home: string; away: string; homeScore?: number; awayScore?: number; time?: string; source?: "captured" | "simulated" };
export type CapturedLeague = { id: string; name: string; subtitle: string; flag: string; listMatches?: boolean; matches: CapturedMatch[] };
export const capturedGameLeagues: CapturedLeague[] = [
  { id: "usphl", name: "USPHL Premier", subtitle: "US Premier Hockey League Premier...", flag: "🇺🇸", matches: [
    { home: "Santa Clarita Lakers", away: "San Diego Sabers", homeScore: 6, awayScore: 3 },
    { home: "Danville Iron", away: "Hutson Pro Academy", homeScore: 6, awayScore: 5 },
    { home: "Forest Lake Hockey Association", away: "Gamblers Hockey J18", homeScore: 0, awayScore: 0 },
    { home: "Cincinnati Jr. Cyclones", away: "Kinni Spirit", time: "9:10 PM" },
  ] },
  { id: "czechia2", name: "Czechia 2", subtitle: "Maxa liga", flag: "🇨🇿", matches: [
    { home: "SK Horacka Slavia Trebic", away: "Pirati Chomutov", homeScore: 4, awayScore: 2 },
    { home: "SC Retia Kolin", away: "HC Prerov", homeScore: 3, awayScore: 2 },
    { home: "AZ Havirov", away: "HC Dukla Jihlava", homeScore: 2, awayScore: 1 },
    { home: "HC Banik Sokolov", away: "HC Frydek-Mistek", homeScore: 2, awayScore: 5 },
    { home: "HC Dynamo Pardubice", away: "Berani Zlin", homeScore: 6, awayScore: 4 },
    { home: "HC Stadion Litomerice", away: "HC Slavia Praha", homeScore: 5, awayScore: 2 },
    { home: "VHK Vsetin", away: "HC Tabor", homeScore: 4, awayScore: 1 },
  ] },
  { id: "ahl", name: "AHL", subtitle: "American Hockey League", flag: "🇺🇸", matches: [
    { home: "Rockford IceHogs", away: "Milwaukee Admirals", homeScore: 3, awayScore: 2 },
  ] },
  { id: "allsvenskan", name: "Allsvenskan", subtitle: "HockeyAllsvenskan", flag: "🇸🇪", listMatches: false, matches: [
    { home: "AIK", away: "Djurgårdens IF", homeScore: 3, awayScore: 2, source: "simulated" },
    { home: "Södertälje SK", away: "MODO Hockey", homeScore: 1, awayScore: 4, source: "simulated" },
    { home: "IF Björklöven", away: "Mora IK", time: "7:00 PM", source: "simulated" },
  ] },
  { id: "czechiau20", name: "Czechia U20 3", subtitle: "Regionální liga juniorů", flag: "🇨🇿", matches: [
    { home: "HC Frydek-Mistek U20", away: "HK Novy Jicin U20", homeScore: 6, awayScore: 3 },
    { home: "HC Benatky nad Jizerou U20", away: "HC Turnov 1931U20", homeScore: 2, awayScore: 4 },
    { home: "SK Kadan U20", away: "Mostecti Lvi U20", homeScore: 1, awayScore: 4 },
  ] },
  { id: "university", name: "Czech University League", subtitle: "Univerzitní liga ledního hokeje", flag: "🇨🇿", matches: [
    { home: "Univerzita Hradec Kralove \"A\" Team", away: "BO Ostrava Uni", homeScore: 4, awayScore: 3 },
    { home: "VŠTE Black Dogs Budweis", away: "MUNI Bears Brno", homeScore: 3, awayScore: 2 },
  ] },
  { id: "extraliga", name: "Czechia Extraliga", subtitle: "Extraliga ledního hokeje", flag: "🇨🇿", matches: [
    { home: "HC Sparta Praha", away: "HC Energie Karlovy Vary", homeScore: 0, awayScore: 1 },
  ] },
];
