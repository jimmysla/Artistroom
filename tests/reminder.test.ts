import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_VARS, normalizeMailTemplates, renderMail } from "../shared/mail-template.ts";

test("payment reminder links to the checkout and shows the amount", () => {
  const m = renderMail(normalizeMailTemplates({}), "zahlungserinnerung", SAMPLE_VARS, { paymentUrl: "https://site/zahlung?ref=abc" });
  assert.match(m.subject, /Erinnerung/);
  assert.match(m.html, /href="https:\/\/site\/zahlung\?ref=abc"/);
  assert.match(m.html, /22 € zzgl\. Steuern/);
  assert.match(m.text, /https:\/\/site\/zahlung\?ref=abc/);
});
