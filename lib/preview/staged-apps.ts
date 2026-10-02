// These are the Android packages currently provisioned in the separate preview lab.
// Replace this list with the capture pool registry when provisioning is automated.
export const stagedPreviewApps = [
  { name: "Wikipedia", packageName: "org.wikipedia", iconUrl: "/preview-app-icons/wikipedia.png" },
  { name: "AntennaPod", packageName: "de.danoeh.antennapod", iconUrl: "/preview-app-icons/antennapod.png" },
] as const;

export function permittedPreviewApps(assignments: readonly { package_name: string; tenant_id: string | null; enabled: boolean }[], tenantId: string) {
  const packages = new Set(assignments.filter((row) => row.enabled && (row.tenant_id === null || row.tenant_id === tenantId)).map((row) => row.package_name));
  return stagedPreviewApps.filter((app) => packages.has(app.packageName));
}
