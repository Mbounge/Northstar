import assert from "node:assert/strict";
import test from "node:test";
import { permittedPreviewApps } from "../lib/preview/staged-apps";

test("preview app assignments isolate tenants and combine with the shared pool", () => {
  const rows = [
    { package_name: "org.wikipedia", tenant_id: null, enabled: true },
    { package_name: "de.danoeh.antennapod", tenant_id: "tenant-a", enabled: true },
    { package_name: "de.danoeh.antennapod", tenant_id: "tenant-b", enabled: false },
    { package_name: "malicious.unstaged", tenant_id: null, enabled: true },
  ];
  assert.deepEqual(permittedPreviewApps(rows, "tenant-a").map((app) => app.packageName), ["org.wikipedia", "de.danoeh.antennapod"]);
  assert.deepEqual(permittedPreviewApps(rows, "tenant-b").map((app) => app.packageName), ["org.wikipedia"]);
  assert.deepEqual(permittedPreviewApps(rows, "tenant-c").map((app) => app.packageName), ["org.wikipedia"]);
});
