import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAIL_TEMPLATES, SAMPLE_VARS, normalizeMailTemplates, renderMail } from "../shared/mail-template.ts";

test("normalize fills defaults and drops invalid values", () => {
  const t = normalizeMailTemplates({ design: { background: "nope", accentColor: "red", qrSize: 9999, blocks: [{ id: "qr", enabled: false }, { id: "bogus" }] }, templates: { kostenlos: { subject: "Hi\r\nBcc: x", body: 5 } } });
  assert.equal(t.design.background, "dunkel");
  assert.equal(t.design.accentColor, DEFAULT_MAIL_TEMPLATES.design.accentColor);
  assert.equal(t.design.qrSize, DEFAULT_MAIL_TEMPLATES.design.qrSize);
  // Admin's order kept, unknown removed, missing appended.
  assert.equal(t.design.blocks[0].id, "qr");
  assert.equal(t.design.blocks[0].enabled, false);
  assert.equal(t.design.blocks.length, DEFAULT_MAIL_TEMPLATES.design.blocks.length);
  // No header injection via subject.
  assert.equal(t.templates.kostenlos.subject, "Hi Bcc: x");
  assert.equal(t.templates.kostenlos.body, DEFAULT_MAIL_TEMPLATES.templates.kostenlos.body);
});

test("render fills placeholders, formats and escapes", () => {
  const t = normalizeMailTemplates({ templates: { kostenlos: { subject: "Ticket {nummer}", title: "Hey {vorname}", body: "**fett** und *kursiv*\n\n<script>x</script>" } } });
  const m = renderMail(t, "kostenlos", SAMPLE_VARS, { qrSrc: "cid:ticket-qr" });
  assert.equal(m.subject, "Ticket #0042");
  assert.match(m.html, /Hey Alex/);
  assert.match(m.html, /<strong>fett<\/strong> und <em>kursiv<\/em>/);
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /&lt;script&gt;/);
  assert.match(m.html, /src="cid:ticket-qr"/);
  assert.match(m.text, /fett und kursiv/);
});

test("QR only in ticket mails, payment button only in payment mail, order follows blocks", () => {
  const t = normalizeMailTemplates({});
  const opts = { qrSrc: "cid:ticket-qr", paymentUrl: "https://pay.example/x" };
  assert.doesNotMatch(renderMail(t, "abgelehnt", SAMPLE_VARS, opts).html, /cid:ticket-qr|pay\.example/);
  const pay = renderMail(t, "zahlung_angefordert", SAMPLE_VARS, opts);
  assert.match(pay.html, /href="https:\/\/pay\.example\/x"/);
  assert.doesNotMatch(pay.html, /cid:ticket-qr/);
  // QR block moved to the top → appears before the text.
  const qrFirst = normalizeMailTemplates({ design: { blocks: [{ id: "qr", enabled: true }] } });
  const html = renderMail(qrFirst, "bezahlt", SAMPLE_VARS, opts).html;
  assert.ok(html.indexOf("cid:ticket-qr") < html.indexOf("Hallo Alex"));
});

test("payment link is never lost when the button block is disabled", () => {
  const t = normalizeMailTemplates({ design: { blocks: [{ id: "zahlung", enabled: false }] } });
  const m = renderMail(t, "zahlung_angefordert", SAMPLE_VARS, { paymentUrl: "https://pay.example/x" });
  assert.match(m.html, /pay\.example\/x/);
  assert.match(m.text, /pay\.example\/x/);
});
