import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SURVEY, normalizeSurvey, validateAnswers } from "../shared/survey.ts";
import { SAMPLE_VARS, normalizeMailTemplates, renderMail } from "../shared/mail-template.ts";

Object.defineProperty(globalThis, "Netlify", { configurable: true, value: { env: { get: () => undefined } } });
const { isDue } = await import("../netlify/lib/survey.ts");

test("survey config is normalized (bad ids/types dropped, options only for choices)", () => {
  const s = normalizeSurvey({ enabled: true, sendAt: "2027-06-01T10:00", questions: [{ id: "a", type: "kurz", label: "x", options: ["nope"] }, { id: "a", type: "kurz" }, { id: "Bad id", type: "kurz" }, { id: "b", type: "hack" }, { id: "c", type: "einfach", options: ["1", "", "2"] }] });
  assert.deepEqual(s.questions.map((q) => q.id), ["a", "c"]);
  assert.deepEqual(s.questions[0].options, []);
  assert.deepEqual(s.questions[1].options, ["1", "2"]);
  assert.equal(normalizeSurvey({ sendAt: "morgen" }).sendAt, "");
});

test("answers are validated against the questions", () => {
  const s = DEFAULT_SURVEY;
  const { errors } = validateAnswers(s, {});
  assert.ok(errors.gesamt && errors.wieder);
  const ok = validateAnswers(s, { gesamt: 5, wieder: "ja", highlight: "Location", feedback: "  Mehr DJs  ", fremd: "x" });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.answers, { gesamt: 5, wieder: "ja", highlight: "Location", feedback: "Mehr DJs" });
  const bad = validateAnswers(s, { gesamt: 9, wieder: "vielleicht", highlight: "Erfunden" });
  assert.ok(bad.errors.gesamt && bad.errors.wieder);
  assert.equal(bad.answers.highlight, undefined);
});

test("send time is compared in Berlin time", () => {
  const now = new Date("2027-06-01T08:30:00Z"); // 10:30 in Berlin (summer time)
  assert.equal(isDue("2027-06-01T10:00", now), true);
  assert.equal(isDue("2027-06-01T11:00", now), false);
  assert.equal(isDue("", now), false);
});

test("mails render uploaded images, custom logo and the survey button", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const t = normalizeMailTemplates({ design: { logoImage: id, blocks: [{ id: "bild1", enabled: true }], images: { bild1: { imageId: id, width: 300, link: "javascript:alert(1)" } } } });
  const m = renderMail(t, "umfrage", SAMPLE_VARS, { imageUrl: (x) => `https://site/api/mail-images/${x}`, surveyUrl: "https://site/umfrage?t=abc" });
  assert.equal((m.html.match(/api\/mail-images\//g) ?? []).length, 2);
  assert.doesNotMatch(m.html, /javascript:/);
  assert.match(m.html, /href="https:\/\/site\/umfrage\?t=abc"/);
  assert.match(m.text, /Zur Umfrage: https:\/\/site\/umfrage\?t=abc/);
});
