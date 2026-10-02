import assert from "node:assert/strict";
import test from "node:test";
import { permittedPreviewApps } from "../lib/preview/staged-apps";

test("only provisioned apps already assigned to the tenant can be previewed", () => {
  const packages = (names: string[]) => permittedPreviewApps(names.map((app_name) => ({ app_name }))).map((app) => app.packageName);
  assert.deepEqual(packages(["Wikipedia", "AntennaPod"]), ["org.wikipedia", "de.danoeh.antennapod"]);
  assert.deepEqual(packages([" wikipedia ", "Unstaged app"]), ["org.wikipedia"]);
  assert.deepEqual(packages(["Unstaged app"]), []);
  assert.deepEqual(packages([]), []);
});
