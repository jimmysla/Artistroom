import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT } from "../../shared/event.js";
import { normalizeRegistrationForm } from "../../shared/registration-form.js";
import { requireAdmin } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { describeRegistrationFormChanges } from "../lib/diff.js";
import { getEvent } from "../lib/event.js";
import { error, json, logError, readJson } from "../lib/http.js";

/*
 * Registration form Baukasten (Dashboard → Anmeldung):
 *   GET /api/admin/registration-form  any dashboard account (categories + check-in animation are
 *                                     needed by the dashboard and the check-in)
 *   PUT /api/admin/registration-form  super users only
 * The public part (categories, fields) is delivered with GET /api/event.
 */
export default async (req: Request) => {
  const session = await requireAdmin(req, ...(req.method === "GET" ? [] : (["super"] as const)));
  if (session instanceof Response) return session;
  try {
    const settings = await getEvent();
    const stored = "registrationForm" in settings ? (settings.registrationForm ?? null) : null;
    if (req.method === "GET") return json({ form: normalizeRegistrationForm(stored) });
    if (req.method !== "PUT") return error("Methode nicht erlaubt.", 405);

    const body = await readJson(req);
    if (!body?.form || typeof body.form !== "object") return error("Ungültige Anmelde-Einstellungen.", 422);
    const form = normalizeRegistrationForm(body.form);
    if (!form.categories.length) return error("Mindestens eine Kategorie ist nötig.", 422);
    const value = form as unknown as Record<string, unknown>;

    if (JSON.stringify(form) !== JSON.stringify(normalizeRegistrationForm(stored)) || stored === null) {
      const [row] = await db.update(eventSettings).set({ registrationForm: value }).where(eq(eventSettings.id, 1)).returning({ id: eventSettings.id });
      if (!row) await db.insert(eventSettings).values({ id: 1, ...DEFAULT_EVENT, registrationForm: value }).onConflictDoUpdate({ target: eventSettings.id, set: { registrationForm: value } });
      const changes = describeRegistrationFormChanges(stored, form);
      if (changes.length) {
        await logAction({ username: session.username, action: "anmeldeformular_geaendert", details: changes.join("; "), undo: { kind: "registration_form", before: stored } });
      }
    }
    return json({ form });
  } catch (err) {
    logError("Registration form settings error", err);
    return error("Die Anmelde-Einstellungen konnten nicht geladen oder gespeichert werden.", 500);
  }
};

export const config: Config = { path: "/api/admin/registration-form" };
