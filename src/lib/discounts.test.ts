import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount } from "@/lib/discounts";
import type { DiscountCodeData } from "@/config/discounts";

const base = { serviceSlug: "domestic-cleaning", amountGross: 10000 };

test("percent discount reduces the price", () => {
  const dc: DiscountCodeData = { code: "TEN", type: "percent", value: 10 };
  const r = applyDiscount(dc, base);
  assert.ok(r.ok);
  assert.equal(r.ok && r.discountAmount, 1000);
  assert.equal(r.ok && r.finalGross, 9000);
});

test("fixed discount is capped at the amount and never negative", () => {
  const dc: DiscountCodeData = { code: "BIG", type: "fixed", value: 15000 };
  const r = applyDiscount(dc, { serviceSlug: "domestic-cleaning", amountGross: 5000 });
  assert.ok(r.ok);
  assert.equal(r.ok && r.discountAmount, 5000);
  assert.equal(r.ok && r.finalGross, 0);
});

test("expired code is rejected", () => {
  const dc: DiscountCodeData = { code: "OLD", type: "percent", value: 20, validUntil: "2020-01-01T00:00:00Z" };
  const r = applyDiscount(dc, base);
  assert.equal(r.ok, false);
});

test("not-yet-active code is rejected", () => {
  const dc: DiscountCodeData = { code: "SOON", type: "percent", value: 20, validFrom: "2999-01-01T00:00:00Z" };
  const r = applyDiscount(dc, base);
  assert.equal(r.ok, false);
});

test("usage cap is enforced", () => {
  const dc: DiscountCodeData = { code: "CAPPED", type: "percent", value: 20, maxUses: 5, uses: 5 };
  const r = applyDiscount(dc, base);
  assert.equal(r.ok, false);
});

test("service restriction is enforced", () => {
  const dc: DiscountCodeData = { code: "EOTONLY", type: "percent", value: 20, serviceSlugs: ["end-of-tenancy-cleaning"] };
  const r = applyDiscount(dc, base);
  assert.equal(r.ok, false);
  const r2 = applyDiscount(dc, { serviceSlug: "end-of-tenancy-cleaning", amountGross: 10000 });
  assert.ok(r2.ok);
});

test("frequency requirement buys recurrence, not one-offs", () => {
  const dc: DiscountCodeData = { code: "FIRST30", type: "percent", value: 30, requiresFrequency: ["weekly", "fortnightly"] };
  assert.equal(applyDiscount(dc, { ...base, frequency: "one_off" }).ok, false);
  assert.equal(applyDiscount(dc, { ...base, frequency: "monthly" }).ok, false);
  assert.ok(applyDiscount(dc, { ...base, frequency: "fortnightly" }).ok);
});
