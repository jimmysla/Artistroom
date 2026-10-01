import { test } from "node:test";
import assert from "node:assert/strict";
import { sendStatusMail, checkMailConfig, MailError } from "../netlify/lib/mail.js";
import { DEFAULT_EVENT, validPaymentUrl, eventDate } from "../shared/event.js";
import type { Registration } from "../db/schema.js";

const settings = { ...DEFAULT_EVENT, senderEmail: "team@example.test", paymentUrl: "https://example.test/pay" };
const row: Registration = { id: 17, name: "Mira <Stage>", email: "mira@example.test", category: "kuenstler", instagram: "mira", status: "kostenlos", amountCents: null, createdAt: new Date(), mediaConsentAt: new Date(), checkedInAt: null, ticketToken: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", revision: 1, emailSentAt: null };

test("payment links only allow HTTPS without embedded credentials", () => {
  for (const link of ["javascript:alert(1)", "http://example.test", "not a link", "https://name:password@example.test"]) assert.equal(validPaymentUrl(link), false);
  assert.equal(validPaymentUrl(settings.paymentUrl), true);
  assert.match(eventDate({ ...DEFAULT_EVENT, time: "18:30" }), /18:30 Uhr/);
});

test("mail configuration, QR attachment, safe copy and provider failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalNetlify = globalThis.Netlify;
  let configured = false;
  Object.defineProperty(globalThis, "Netlify", { configurable: true, value: { env: { get: () => configured ? "test-only-placeholder" : undefined } } });
  try {
    assert.throws(() => checkMailConfig(settings, "kostenlos"), MailError);
    configured = true;
    assert.throws(() => checkMailConfig({ ...settings, paymentUrl: "" }, "zahlung_angefordert"), MailError);
    const sent: { body: Record<string, any>; key: string | null }[] = [];
    globalThis.fetch = async (_url, init) => {
      sent.push({ body: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get("Idempotency-Key") });
      return Response.json({ id: "test-message" });
    };
    await sendStatusMail(row, settings);
    assert.deepEqual(sent[0].body.to, [row.email]);
    assert.ok(sent[0].body.html.includes("Mira &lt;Stage&gt;"));
    assert.ok(!sent[0].body.html.includes("<Stage>"));
    assert.ok(sent[0].body.text.includes(`artistroom:${row.ticketToken}`));
    const image = Buffer.from(sent[0].body.attachments.find((a: { filename: string }) => a.filename === "Artistroom-Ticket.png").content, "base64");
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), 640);
    await sendStatusMail(row, settings);
    assert.equal(sent[0].key, sent[1].key, "retries use the same provider idempotency key");
    await sendStatusMail({ ...row, status: "zahlung_angefordert", amountCents: 2500, revision: 2 }, settings);
    assert.ok(sent[2].body.text.includes(settings.paymentUrl));
    assert.ok(sent[2].body.text.includes("25"));
    assert.ok(!sent[2].body.attachments?.some((a: { filename: string }) => a.filename === "Artistroom-Ticket.png"));
    await sendStatusMail({ ...row, status: "abgelehnt", revision: 3 }, settings);
    assert.ok(!sent[3].body.attachments?.some((a: { filename: string }) => a.filename === "Artistroom-Ticket.png"));
    globalThis.fetch = async () => Response.json({}, { status: 422 });
    await assert.rejects(sendStatusMail(row, settings), MailError);
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(sendStatusMail(row, settings), MailError);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "Netlify", { configurable: true, value: originalNetlify });
  }
});
