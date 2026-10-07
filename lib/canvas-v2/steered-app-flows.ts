import type { AppDataApp, AppDataFlow } from '@/lib/app-data/canvas-v2-catalog';

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve only names in the authorized account catalog, never a guessed app ID. */
export function appsNamedInSteer(message: string, apps: readonly AppDataApp[]): AppDataApp[] {
  return apps.filter((app) => {
    if (app.name.trim().length < 3) return false;
    const name = escapePattern(app.name.trim()).replace(/\s+/g, '\\s+');
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${name})(?=$|[^\\p{L}\\p{N}])`, 'iu').exec(message);
    if (!match) return false;
    const nameStart = match.index + match[1].length;
    const before = message.slice(Math.max(0, nameStart - 48), nameStart);
    return !/(?:don['’]t|do not|without|exclude|remove|skip|leave out|not interested in)\s+(?:(?:add|include|use|show|compare)\s+)?$/i.test(before);
  });
}

/** The full session capture is the canonical rail; nested taxonomy paths are not extra copies. */
export function flowLanesForSteer(message: string, flows: readonly AppDataFlow[]): AppDataFlow[] {
  const onboarding = /\bonboarding\b/i.test(message);
  const browsing = /\bbrowsing\b/i.test(message);
  const scoped = flows.filter((flow) => !onboarding || browsing || flow.sessionType === 'onboarding')
    .filter((flow) => !browsing || onboarding || flow.sessionType === 'browsing');
  const sessions = scoped.filter((flow) => flow.scope === 'session' && flow.screens.length);
  if (sessions.length) return sessions;
  const journeys = scoped.filter((flow) => flow.completeJourney && flow.screens.length);
  if (journeys.length) return journeys;
  return scoped.filter((flow) => flow.screens.length);
}
