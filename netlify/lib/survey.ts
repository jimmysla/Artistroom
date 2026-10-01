import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { eventSettings, registrations } from "../../db/schema.js";
import { formatRegistrationNumber } from "../../shared/registration.js";
import { normalizeSurvey } from "../../shared/survey.js";
import { logAction } from "./audit.js";
import { getEvent } from "./event.js";
import { logError } from "./http.js";
import { buildStatusMail, checkMailConfig, sendMail } from "./mail.js";
import { openRegistration } from "./pii.js";

/** Berlin wall-clock "YYYY-MM-DDTHH:MM" → is it in the past? */
export function isDue(sendAt: string, now = new Date()): boolean {
  if (!sendAt) return false;
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(now)
    .replace(" ", "T");
  return local >= sendAt;
}

/**
 * Mails the survey invitation (template "umfrage") with a personal link to everyone who checked
 * in and hasn't received it yet. Safe to call repeatedly. Returns sent / failed counts.
 */
export async function sendSurvey(actor: string | null, origin?: string): Promise<{ sent: number; failed: number }> {
  const settings = await getEvent();
  checkMailConfig(settings);
  const base = origin ?? Netlify.env.get("URL");
  if (!base) throw new Error("Site URL unknown");
  const rows = await db.select().from(registrations).where(and(isNotNull(registrations.checkedInAt), isNull(registrations.surveySentAt)));
  let sent = 0;
  let failed = 0;
  for (const stored of rows) {
    const row = await openRegistration(stored);
    const token = stored.surveyToken ?? randomUUID();
    try {
      if (!stored.surveyToken) await db.update(registrations).set({ surveyToken: token }).where(eq(registrations.id, row.id));
      const mail = await buildStatusMail({ ...row, status: "umfrage" }, settings, { surveyUrl: `${base}/umfrage?t=${token}` });
      await sendMail(settings, { to: row.email, ...mail, idempotencyKey: `survey-${row.id}-${token}` });
      await db.update(registrations).set({ surveySentAt: new Date() }).where(eq(registrations.id, row.id));
      sent++;
    } catch (err) {
      failed++;
      logError(`Survey mail ${formatRegistrationNumber(row.id)} failed`, err);
    }
  }
  await db.update(eventSettings).set({ surveySentAt: new Date() }).where(eq(eventSettings.id, 1));
  await logAction({ username: actor, action: "umfrage_gesendet", details: `${sent} Einladung(en) verschickt${failed ? `, ${failed} fehlgeschlagen` : ""}` });
  return { sent, failed };
}

/** Scheduled: sends the invitation once the configured time has passed. */
export async function sendSurveyIfDue(): Promise<void> {
  const settings = await getEvent();
  if (!("survey" in settings)) return;
  const survey = normalizeSurvey(settings.survey);
  if (!survey.enabled || settings.surveySentAt || !isDue(survey.sendAt)) return;
  await sendSurvey(null);
}
