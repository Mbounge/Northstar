import assert from "node:assert/strict";
import test from "node:test";
import { permittedPreviewApps } from "../lib/preview/staged-apps";

test("only provisioned apps already assigned to the tenant can be previewed", () => {
  const staged = [{ name: "Wikipedia", package: "org.wikipedia", icon: "wikipedia.png" }, { name: "AntennaPod", package: "de.danoeh.antennapod", icon: "antennapod.png" }];
  const packages = (names: string[]) => permittedPreviewApps(names.map((app_name) => ({ app_name })), staged).map((app) => app.packageName);
  assert.deepEqual(packages(["Wikipedia", "AntennaPod"]), ["org.wikipedia", "de.danoeh.antennapod"]);
  assert.deepEqual(packages([" wikipedia ", "Unstaged app"]), ["org.wikipedia"]);
  assert.deepEqual(packages(["Unstaged app"]), []);
  assert.deepEqual(packages([]), []);
  assert.deepEqual(permittedPreviewApps([{ app_name: "Rebranded" }], staged,
    [{ app_name: "Rebranded", android_package: "org.wikipedia" }]).map((app) => app.packageName), ["org.wikipedia"]);
  assert.deepEqual(permittedPreviewApps([{ app_name: "Wikipedia" }], staged,
    [{ app_name: "Wikipedia", android_package: "com.unstaged" }]), []);
  assert.deepEqual(permittedPreviewApps([{ app_name: "Wikipedia" }], [
    ...staged, { name: "Wikipedia", package: "org.wikipedia.clone", icon: "clone.png" },
  ]), []);
});
