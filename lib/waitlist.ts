export const WAITLIST_BODY_LIMIT = 2048;
export const WAITLIST_SUCCESS = "You’re on the list. We’ll email you when early access is available.";

export function parseWaitlist(value: unknown): { email: string; source: string; bot: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.website === "string" && input.website.trim()) return { email: "", source: "direct", bot: true };
  if (typeof input.email !== "string") return null;
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) return null;
  const [local] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return { email, source: input.source === "twitter" || input.source === "video" ? input.source : "direct", bot: false };
}

export async function readWaitlistBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Invalid body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > WAITLIST_BODY_LIMIT) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function waitlistCsv(rows: { email: string; created_at: string; source: string }[]): string {
  const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return ["email,joined_at,source", ...rows.map(row => [row.email, row.created_at, row.source].map(cell).join(","))].join("\r\n");
}
