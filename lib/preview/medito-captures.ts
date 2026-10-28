export const meditoCaptures = [
  { step: 1, label: "Welcome" },
  { step: 2, label: "Email signup" },
  { step: 3, label: "Email entered" },
  { step: 4, label: "Requesting a code" },
  { step: 5, label: "Email verification" },
  { step: 6, label: "Code entry" },
  { step: 7, label: "Verification email" },
  { step: 8, label: "Code entered" },
  { step: 9, label: "Meditation experience" },
  { step: 10, label: "Reminders" },
  { step: 11, label: "First meditation invitation" },
  { step: 12, label: "Supporting Medito" },
  { step: 13, label: "Loading home" },
  { step: 14, label: "Donation appeal" },
  { step: 15, label: "Home welcome" },
  { step: 16, label: "Home" },
] as const;

export const meditoSections = [
  { step: 1, label: "Welcome" },
  { step: 2, label: "Email & verification" },
  { step: 9, label: "Personalization" },
  { step: 10, label: "Reminders" },
  { step: 11, label: "First meditation" },
  { step: 12, label: "Supporting Medito" },
  { step: 16, label: "Home" },
] as const;

export function meditoScreenFile(step: number) {
  if (!Number.isInteger(step) || step < 1 || step > 16) throw new Error("Unknown Medito capture");
  return `screen_${String(step).padStart(4, "0")}.png`;
}

export function meditoSectionForStep(step: number): number {
  if (step <= 1) return 1;
  if (step <= 8) return 2;
  if (step >= 15 || step === 13) return 16;
  if (step === 14) return 12;
  return step;
}

export function validMeditoDemoEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface MeditoCaptureDefaults { email: string; code: string }

/** Seed editable fields from the same tenant capture that supplies the pixels. */
export function meditoCaptureDefaults(enrichment: unknown): MeditoCaptureDefaults {
  const blocks = (enrichment as { elements?: { text_blocks?: unknown[] } } | null)?.elements?.text_blocks;
  const texts = Array.isArray(blocks) ? blocks.flatMap((block) => {
    const text = (block as { text?: unknown } | null)?.text;
    return typeof text === "string" ? [text.trim()] : [];
  }) : [];
  return { email: texts.find(validMeditoDemoEmail) ?? "", code: texts.find((text) => /^\d{6}$/.test(text)) ?? "" };
}
