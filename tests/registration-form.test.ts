import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REGISTRATION_FORM,
  EMPTY_VALUES,
  collectExtra,
  findCategory,
  normalizeRegistrationForm,
  publicForm,
  validateRegistration,
} from "../shared/registration-form.ts";

const valid = { ...EMPTY_VALUES, category: "dj", firstName: "Alex", lastName: "Muster", stageName: "DJ Alex", email: "alex@example.de", city: "Hamburg", extra: {} };

test("defaults keep the original categories and fields", () => {
  const f = normalizeRegistrationForm(null);
  assert.deepEqual(f.categories.map((c) => c.id), ["teilnehmer", "musiker", "kuenstler", "dj", "taenzer", "presse"]);
  assert.equal(f.fields.filter((x) => x.type === "builtin").length, 8);
  assert.deepEqual(validateRegistration(valid, f), {});
});

test("categories: bad ids, duplicates and colours are cleaned; empty list falls back to defaults", () => {
  const f = normalizeRegistrationForm({ categories: [{ id: "neu1", label: "Neu", color: "#ABCDEF", icon: "🔥" }, { id: "neu1", label: "dup" }, { id: "Bad Id", label: "x" }, { id: "neu2", label: "", color: "red" }] });
  assert.deepEqual(f.categories.map((c) => c.id), ["neu1", "neu2"]);
  assert.equal(f.categories[0].color, "#abcdef");
  assert.equal(f.categories[1].color, "#8b5cf6");
  assert.equal(normalizeRegistrationForm({ categories: [] }).categories.length, 6);
  // Removed categories still resolve for old registrations.
  assert.equal(findCategory("dj", f.categories).label, "DJ");
});

test("locked fields stay required, hidden fields are not validated, missing built-ins are re-added", () => {
  const f = normalizeRegistrationForm({ fields: [{ id: "email", type: "builtin", enabled: false, required: false }, { id: "city", type: "builtin", enabled: false }] });
  const email = f.fields.find((x) => x.id === "email")!;
  assert.equal(email.enabled && email.required, true);
  assert.equal(f.fields.find((x) => x.id === "stageName")!.enabled, true);
  assert.equal(f.fields.find((x) => x.id === "firstName")!.enabled, false);
  assert.deepEqual(validateRegistration({ ...valid, city: "", firstName: "", lastName: "" }, f), {});
  assert.ok(validateRegistration({ ...valid, email: "" }, f).email);
});

test("custom fields: required text, select options and checkbox; only enabled answers are stored", () => {
  const f = normalizeRegistrationForm({
    fields: [
      ...DEFAULT_REGISTRATION_FORM.fields,
      { id: "fgenre", type: "select", label: "Genre", required: true, options: ["House", "Techno"] },
      { id: "fagb", type: "checkbox", label: "Hausordnung gelesen", required: true },
      { id: "fbio", type: "textarea", label: "Bio" },
      { id: "fold", type: "text", label: "Alt", enabled: false },
      { id: "hinfo", type: "info", label: "Hinweis", required: true },
      { id: "xbad", type: "text", label: "nope" },
    ],
  });
  assert.equal(f.fields.some((x) => x.id === "xbad"), false);
  assert.equal(f.fields.find((x) => x.id === "hinfo")!.required, false);
  const errors = validateRegistration({ ...valid, extra: { fgenre: "Schlager" } }, f);
  assert.ok(errors.fgenre && errors.fagb);
  const ok = { ...valid, extra: { fgenre: "Techno", fagb: "ja", fbio: "  Hallo  ", fold: "x" } };
  assert.deepEqual(validateRegistration(ok, f), {});
  assert.deepEqual(collectExtra(ok, f), { fgenre: { label: "Genre", value: "Techno" }, fagb: { label: "Hausordnung gelesen", value: "Ja" }, fbio: { label: "Bio", value: "Hallo" } });
});

test("unknown category is rejected; public form never contains the check-in design", () => {
  const f = normalizeRegistrationForm(null);
  assert.ok(validateRegistration({ ...valid, category: "gibtsnicht" }, f).category);
  assert.equal("checkin" in publicForm(f), false);
});

test("check-in blocks: single blocks once, text/feld repeatable, duration clamped", () => {
  const c = normalizeRegistrationForm({ checkin: { duration: 99, animation: "hack", blocks: [{ id: "name", type: "name" }, { id: "name2", type: "name" }, { id: "ct1", type: "text", text: "Hi" }, { id: "ct2", type: "text", text: "Ho" }, { id: "cf", type: "feld", fieldId: "fgenre" }] } }).checkin;
  assert.deepEqual(c.blocks.map((b) => b.id), ["name", "ct1", "ct2", "cf"]);
  assert.equal(c.duration, 30);
  assert.equal(c.animation, "burst");
});
