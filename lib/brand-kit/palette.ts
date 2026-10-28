export type PaletteColor = {
  hex: string;
  label: string;
  semantic_role?: string;
  source?: string;
  confidence?: string;
};

// Flutter paints its interface in Dart. Bundled Android XML colors can belong
// to Material libraries and must not be presented as verified app UI tokens.
export function selectBrandPalette<T extends PaletteColor>({
  framework, extracted, observed, icon, fallback,
}: {
  framework?: string;
  extracted: T[];
  observed: T[];
  icon: T[];
  fallback: T[];
}): T[] {
  if (framework !== "flutter") return extracted.length ? extracted : fallback;
  const appColors = extracted.filter(color => color.source !== "colors_xml");
  const candidates = appColors.length ? appColors : observed.length ? observed : fallback;
  const exactIcon = icon.filter(color => color.confidence === "exact");
  const colors = exactIcon.length
    ? [...candidates.filter(color => !["brand", "brand_primary"].includes(color.semantic_role ?? "")), ...exactIcon.map(color => ({ ...color, semantic_role: "brand" }))]
    : candidates;
  return colors.filter((color, index) => colors.findIndex(other => other.hex.toUpperCase() === color.hex.toUpperCase()) === index);
}
