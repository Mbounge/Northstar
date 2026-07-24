export type NorthstarFaultPoint =
  | "action.before_execute"
  | "persistence.before_write"
  | "runtime.lifecycle.before_record";

export type NorthstarFaultMode = "throw" | "drop" | "delay";

export interface NorthstarFaultRule {
  point: NorthstarFaultPoint;
  mode: NorthstarFaultMode;
  remaining?: number;
  delayMs?: number;
  reason?: string;
}

interface NorthstarFaultGlobal {
  __NORTHSTAR_FAULTS__?: NorthstarFaultRule[];
}

function faultRules(): NorthstarFaultRule[] {
  if (typeof window === "undefined") return [];
  return (window as unknown as NorthstarFaultGlobal).__NORTHSTAR_FAULTS__ ?? [];
}

export function installNorthstarFaults(rules: NorthstarFaultRule[]) {
  if (typeof window === "undefined") return;
  (window as unknown as NorthstarFaultGlobal).__NORTHSTAR_FAULTS__ = rules.map((rule) => ({ ...rule }));
}

export function clearNorthstarFaults() {
  if (typeof window === "undefined") return;
  delete (window as unknown as NorthstarFaultGlobal).__NORTHSTAR_FAULTS__;
}

export function consumeNorthstarFault(point: NorthstarFaultPoint): NorthstarFaultRule | null {
  const rules = faultRules();
  const rule = rules.find((candidate) => candidate.point === point && candidate.remaining !== 0);
  if (!rule) return null;
  if (typeof rule.remaining === "number") rule.remaining = Math.max(0, rule.remaining - 1);
  return { ...rule };
}

export async function applyNorthstarFault(point: NorthstarFaultPoint): Promise<"continue" | "drop"> {
  const rule = consumeNorthstarFault(point);
  if (!rule) return "continue";
  if (rule.mode === "drop") return "drop";
  if (rule.mode === "delay") {
    const delayMs = Math.max(0, Math.min(rule.delayMs ?? 0, 10_000));
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    return "continue";
  }
  throw new Error(rule.reason ?? `Injected Northstar fault at ${point}.`);
}
