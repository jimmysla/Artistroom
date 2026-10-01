import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProduct, priceBreakdown } from "../shared/product.ts";

test("checkout adds VAT on top of the net price", () => {
  assert.deepEqual(priceBreakdown(1500, 0), { net: 1500, vat: 0, gross: 1500 });
  assert.deepEqual(priceBreakdown(2200, 19), { net: 2200, vat: 418, gross: 2618 });
  assert.deepEqual(priceBreakdown(1000, 7), { net: 1000, vat: 70, gross: 1070 });
});

test("product config is sanitised", () => {
  const p = normalizeProduct({ name: "", vatRate: 16, imageUrl: "javascript:alert(1)", imageId: "x" });
  assert.equal(p.name, "Ticket");
  assert.equal(p.vatRate, 0);
  assert.equal(p.imageUrl, "");
  assert.equal(p.imageId, "");
});
