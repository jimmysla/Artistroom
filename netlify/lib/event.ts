import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT } from "../../shared/event.js";
import { normalizeRegistrationForm, type RegistrationForm } from "../../shared/registration-form.js";
export async function getEvent() {
  const [settings] = await db.select().from(eventSettings).limit(1);
  return settings ?? DEFAULT_EVENT;
}

/** Configured registration form (categories, fields, check-in design) of an event settings row. */
export const formOf = (settings: object): RegistrationForm =>
  normalizeRegistrationForm("registrationForm" in settings ? settings.registrationForm : null);

export const getRegistrationForm = async () => formOf(await getEvent());
