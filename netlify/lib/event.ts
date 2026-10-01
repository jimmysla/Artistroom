import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT } from "../../shared/event.js";
import { formCategories, normalizeForm, type FormConfig } from "../../shared/site.js";
export async function getEvent() {
  const [settings] = await db.select().from(eventSettings).limit(1);
  return settings ?? DEFAULT_EVENT;
}

/** Form builder config of a settings row (defaults when not configured yet). */
export const formOf = (s: object): FormConfig => normalizeForm("formConfig" in s ? s.formConfig : null);
/** Configured categories (incl. hidden ones) for labels in mails, logs and exports. */
export const categoriesOf = (s: object) => formCategories(formOf(s));
