import assert from "node:assert/strict";
import test from "node:test";
import {
  createNorthstarLedgerHash,
  NorthstarLedgerValueError,
  stableStringifyNorthstarLedgerValue,
} from "@/lib/canvas-ledger/northstar-ledger-value";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

test("ledger hashes are portable SHA-256 content addresses over canonical JSON", () => {
  const left = { z: 2, a: { y: true, x: [1, 2] } };
  const right = { a: { x: [1, 2], y: true }, z: 2 };

  assert.equal(stableStringifyNorthstarLedgerValue(left), stableStringifyNorthstarLedgerValue(right));
  assert.equal(createNorthstarLedgerHash(left), createNorthstarLedgerHash(right));
  assert.match(createNorthstarLedgerHash(left), /^nsl1-[0-9a-f]{64}$/);
});

test("invalid numeric values are rejected instead of colliding with JSON null", () => {
  const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const invalid of invalidValues) {
    assert.throws(
      () => createNorthstarLedgerHash({ value: invalid } as unknown as NorthstarLedgerValue),
      NorthstarLedgerValueError,
    );
  }
  assert.notEqual(createNorthstarLedgerHash({ value: 0 }), createNorthstarLedgerHash({ value: null }));
});

test("undefined, sparse arrays and unsupported object values are rejected", () => {
  const sparse = new Array(2);
  sparse[1] = "present";
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const hidden = {};
  Object.defineProperty(hidden, "secret", { value: "not-json-visible", enumerable: false });

  const invalid: unknown[] = [
    { missing: undefined },
    sparse,
    { callback: () => undefined },
    { createdAt: new Date() },
    hidden,
    circular,
  ];

  for (const value of invalid) {
    assert.throws(
      () => stableStringifyNorthstarLedgerValue(value as NorthstarLedgerValue),
      NorthstarLedgerValueError,
    );
  }
});
