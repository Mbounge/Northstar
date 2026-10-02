// These are the Android packages currently provisioned in the separate preview lab.
// Replace this list with the capture pool registry when provisioning is automated.
export const stagedPreviewApps = [
  { name: "Wikipedia", packageName: "org.wikipedia", iconUrl: "/preview-app-icons/wikipedia.png" },
  { name: "AntennaPod", packageName: "de.danoeh.antennapod", iconUrl: "/preview-app-icons/antennapod.png" },
] as const;

export function permittedPreviewApps(tenantApps: readonly { app_name: string }[]) {
  // The tenant's existing app catalog is the access decision. The staged list
  // only says which of those apps has a provisioned Android preview APK.
  const names = new Set(tenantApps.map((row) => row.app_name.trim().toLocaleLowerCase("en-US")));
  return stagedPreviewApps.filter((app) => names.has(app.name.toLocaleLowerCase("en-US")));
}
