import assert from "node:assert/strict";
import test from "node:test";
import { meditoCaptures, meditoScreenFile, meditoSectionForStep, validMeditoDemoEmail } from "../lib/preview/medito-captures";

test("Medito preserves all 16 source captures, including the email detour and loading state", () => {
  assert.equal(meditoCaptures.length, 16);
  assert.equal(meditoCaptures[6].label, "Verification email");
  assert.equal(meditoCaptures[12].label, "Loading home");
  assert.equal(meditoScreenFile(1), "screen_0001.png");
  assert.equal(meditoScreenFile(16), "screen_0016.png");
  for (const step of [0, 17, 1.5, NaN]) assert.throws(() => meditoScreenFile(step));
  assert.equal(meditoSectionForStep(7), 2);
  assert.equal(meditoSectionForStep(14), 12);
  assert.equal(meditoSectionForStep(15), 16);
});

test("local email entry requires a complete email before advancing", () => {
  for (const value of ["", "hello", "hello@", "hello@example", "hello there@example.com"]) assert.equal(validMeditoDemoEmail(value), false);
  assert.equal(validMeditoDemoEmail(" demo@example.com "), true);
});
