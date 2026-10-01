import { test } from "node:test";
import assert from "node:assert/strict";
import type { Registration } from "../db/schema.js";

Object.defineProperty(globalThis, "Netlify", { configurable: true, value: { env: { get: (k: string) => ({ STRIPE_SECRET_KEY: "sk_test_x", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" } as Record<string, string>)[k] } } });
const { isPaid } = await import("../netlify/lib/payments.ts");

const creds = { stripeKey: "sk_test_x", paypalId: "id", paypalSecret: "secret", paypalSandbox: true };
const row = { id: 7, status: "zahlung_angefordert", amountCents: 1500, paymentProvider: "stripe", paymentCheckout: "cs_test_1", paymentRef: "r", revision: 3 } as Registration;
const stub = (handler: (url: string, init?: RequestInit) => unknown) => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => Response.json(handler(String(url), init))) as typeof fetch;
};

test("Stripe: only a paid session with matching amount, currency and registration counts", async () => {
  const session = { id: "cs_test_1", payment_status: "paid", amount_total: 1500, currency: "eur", client_reference_id: "7" };
  stub(() => session);
  assert.equal(await isPaid(row, creds), true);
  for (const bad of [{ payment_status: "unpaid" }, { amount_total: 100 }, { currency: "usd" }, { client_reference_id: "8" }]) {
    stub(() => ({ ...session, ...bad }));
    assert.equal(await isPaid(row, creds), false, JSON.stringify(bad));
  }
});

test("PayPal: approved orders are captured, then amount and id are verified", async () => {
  const pp = { ...row, paymentProvider: "paypal", paymentCheckout: "ORDER1" } as Registration;
  const done = (value: string, custom = "7") => ({ id: "ORDER1", status: "COMPLETED", purchase_units: [{ custom_id: custom, payments: { captures: [{ status: "COMPLETED", amount: { value, currency_code: "EUR" } }] } }] });
  let captured = false;
  stub((url) => {
    if (url.endsWith("/oauth2/token")) return { access_token: "t" };
    if (url.endsWith("/capture")) return (captured = true), done("15.00");
    return { id: "ORDER1", status: "APPROVED" };
  });
  assert.equal(await isPaid(pp, creds), true);
  assert.equal(captured, true);
  stub((url) => (url.endsWith("/oauth2/token") ? { access_token: "t" } : done("1.00")));
  assert.equal(await isPaid(pp, creds), false);
  stub((url) => (url.endsWith("/oauth2/token") ? { access_token: "t" } : done("15.00", "99")));
  assert.equal(await isPaid(pp, creds), false);
});
