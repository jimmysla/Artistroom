import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProductChanges, describeSurveyChanges, describeTemplateChanges } from "../netlify/lib/diff.ts";
import { DEFAULT_SURVEY } from "../shared/survey.ts";

test("settings changes are described in detail for the log", () => {
  const t = describeTemplateChanges(null, { templates: { kostenlos: { subject: "Neu!" } }, design: { background: "hell" } });
  assert.ok(t.some((c) => c.includes("Kostenlos") && c.includes("Betreff")));
  assert.ok(t.some((c) => c.startsWith("Design Hintergrund")));
  const s = describeSurveyChanges(DEFAULT_SURVEY, { ...DEFAULT_SURVEY, questions: DEFAULT_SURVEY.questions.slice(1) });
  assert.ok(s.some((c) => c.startsWith("Frage entfernt")));
  assert.deepEqual(describeProductChanges(null, null), []);
  assert.ok(describeProductChanges(null, { vatRate: 19 })[0].startsWith("MwSt."));
});
