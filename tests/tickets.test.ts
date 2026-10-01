import { test } from "node:test";
import assert from "node:assert/strict";
import { maxTicketsOf } from "../shared/event.ts";
import { ACCEPTED_STATUSES } from "../shared/registration.ts";

test("ticket limit: empty or invalid = unlimited, whole numbers ≥ 1 count", () => {
  assert.equal(maxTicketsOf({ maxTickets: "" }), null);
  assert.equal(maxTicketsOf({ maxTickets: "0" }), null);
  assert.equal(maxTicketsOf({ maxTickets: "-5" }), null);
  assert.equal(maxTicketsOf({ maxTickets: "12,5" }), null);
  assert.equal(maxTicketsOf({ maxTickets: " 80 " }), 80);
  assert.equal(maxTicketsOf({ maxTickets: "150" }), 150);
});

test("ticket limit counts free + paying (requested and paid) registrations", () => {
  assert.deepEqual([...ACCEPTED_STATUSES].sort(), ["bezahlt", "kostenlos", "zahlung_angefordert"]);
});
