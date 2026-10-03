export type ProvisionedApp = { package: string; name: string; icon: string; launch_gate?: "google_play" };
export type TenantApp = { app_name: string; icon_url?: string | null };
export type PublishedSession = { app_name: string; android_package?: string | null };

const packageName = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const safeIcon = /^(?:[A-Za-z0-9_.-]+|icons\/[A-Za-z0-9_.-]+)$/;
const previewOrigin = "https://capture.49-12-126-233.sslip.io";

function key(name: string) { return name.trim().toLocaleLowerCase("en-US"); }

export function permittedPreviewApps(tenantApps: readonly TenantApp[], provisioned: readonly ProvisionedApp[], sessions: readonly PublishedSession[] = []) {
  const provisionedByPackage = new Map(provisioned.filter((app) => packageName.test(app.package)).map((app) => [app.package, app]));
  const provisionedByName = new Map<string, ProvisionedApp | null>();
  for (const app of provisioned) {
    const name = key(app.name);
    if (provisionedByName.has(name)) provisionedByName.set(name, null);
    else provisionedByName.set(name, app);
  }
  const published = new Map(sessions.map((session) => [key(session.app_name), session.android_package]));
  const result: { name: string; packageName: string; iconUrl: string; launchGate?: "google_play" }[] = [];
  const seen = new Set<string>();
  for (const tenantApp of tenantApps) {
    const boundPackage = published.get(key(tenantApp.app_name));
    // A published package identity takes precedence. Name matching exists for
    // legacy apps published before the Android package was recorded.
    const app = boundPackage ? provisionedByPackage.get(boundPackage) : provisionedByName.get(key(tenantApp.app_name));
    if (!app || seen.has(app.package)) continue;
    seen.add(app.package);
    const iconUrl = tenantApp.icon_url || (safeIcon.test(app.icon) ? `${previewOrigin}/preview/${app.icon}` : `${previewOrigin}/preview/app-placeholder.svg`);
    result.push({ name: tenantApp.app_name, packageName: app.package, iconUrl,
      ...(app.launch_gate === "google_play" ? { launchGate: "google_play" as const } : {}) });
  }
  return result;
}
