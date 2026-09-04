// Set VAT on for this process. fromGross/fromNet read the flag at call time.
process.env.VAT_REGISTERED = "true";

import { test } from "node:test";
import assert from "node:assert/strict";
import { fromGross, fromNet, isVatRegistered, STANDARD_VAT_RATE } from "@/lib/money";

test("VAT flag is read from env at call time", () => {
  assert.equal(isVatRegistered(), true);
  assert.equal(STANDARD_VAT_RATE, 0.2);
});

test("fromGross backs VAT out of a VAT-inclusive consumer price", () => {
  const m = fromGross(12000); // £120 inc VAT
  assert.equal(m.gross, 12000);
  assert.equal(m.net, 10000); // 12000 / 1.2
  assert.equal(m.vatAmount, 2000);
  assert.equal(m.vatRate, 0.2);
});

test("fromNet adds VAT to a net commercial price", () => {
  const m = fromNet(10000);
  assert.equal(m.net, 10000);
  assert.equal(m.vatAmount, 2000);
  assert.equal(m.gross, 12000);
});

test("net + vat always reconciles to gross", () => {
  for (const gross of [999, 4500, 15000, 33333]) {
    const m = fromGross(gross);
    assert.equal(m.net + m.vatAmount, m.gross);
  }
});
