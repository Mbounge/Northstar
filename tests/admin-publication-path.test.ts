import assert from "node:assert/strict";
import test from "node:test";
import { storageArtifactPath } from "../lib/admin/publication-path";

test("publication keeps ordinary evidence names and maps Unicode names reproducibly", () => {
  const plain = "browsing/screenshots/s0001_home.png";
  assert.equal(storageArtifactPath(plain), plain);
  const source = "browsing/enriched/step_105_choir_of_the_málaga_cathedral_enriched.json";
  const key = storageArtifactPath(source);
  assert.match(key, /^browsing\/enriched\/step_105_choir_of_the_malaga_cathedral_enriched--[a-f0-9]{12}\.json$/);
  assert.equal(storageArtifactPath(source), key);
  assert.notEqual(storageArtifactPath(source.replace("málaga", "màlaga")), key);
});
