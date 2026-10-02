const brandedBackgrounds: Record<string, string> = {
  graet: "linear-gradient(125deg,#1b3765 0%,#346cad 55%,#1b2448 100%)",
  tsenta: "linear-gradient(125deg,#442396 0%,#7152ce 54%,#263e86 100%)",
  linkedin: "linear-gradient(125deg,#10477b 0%,#1c70b5 55%,#183b69 100%)",
  offertoday: "linear-gradient(125deg,#164c44 0%,#347a4d 55%,#576d27 100%)",
  jobget: "linear-gradient(125deg,#300663 0%,#5b22a0 55%,#252261 100%)",
  glassdoor: "linear-gradient(125deg,#112d2a 0%,#1e5b47 55%,#17293b 100%)",
  eliteprospects: "linear-gradient(125deg,#322d42 0%,#76424d 55%,#343856 100%)",
  ncsa: "linear-gradient(125deg,#173d69 0%,#357fb3 55%,#1b3c65 100%)",
  nhl: "linear-gradient(125deg,#23272f 0%,#42464d 55%,#1b2434 100%)",
  wikipedia: "linear-gradient(125deg,#31343d 0%,#626673 55%,#2b3444 100%)",
  awin: "linear-gradient(125deg,#58302f 0%,#a35a47 55%,#543858 100%)",
  aw: "linear-gradient(125deg,#68402a 0%,#a96734 55%,#4e3b53 100%)",
  calm: "linear-gradient(125deg,#1b4773 0%,#507abb 55%,#2f4479 100%)",
  duolingo: "linear-gradient(125deg,#255628 0%,#4a9b45 55%,#235840 100%)",
  spotify: "linear-gradient(125deg,#143b31 0%,#246d4b 55%,#163c40 100%)",
  whop: "linear-gradient(125deg,#382266 0%,#6750a5 55%,#26345c 100%)",
  routinery: "linear-gradient(125deg,#535438 0%,#798b50 55%,#325f5c 100%)",
};

const fallbackBackgrounds = [
  "linear-gradient(125deg,#1d2240,#34305d 65%,#233861)",
  "linear-gradient(125deg,#222040,#4b2d6e 65%,#303872)",
  "linear-gradient(125deg,#142a3b,#185052 65%,#123444)",
  "linear-gradient(125deg,#29223f,#53405a 65%,#253c62)",
];

export function adminAppBackground(name: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (brandedBackgrounds[key]) return brandedBackgrounds[key];
  const hash = Array.from(key).reduce((value, character) => value * 31 + character.charCodeAt(0), 0) >>> 0;
  return fallbackBackgrounds[hash % fallbackBackgrounds.length];
}
