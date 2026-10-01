import type { Config } from "@netlify/functions";
import { desc, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, surveyResponses } from "../../db/schema.js";
import { normalizeSurvey, type SurveyAnswers } from "../../shared/survey.js";
import { requireAdmin } from "../lib/auth.js";
import { open } from "../lib/crypto.js";
import { getEvent } from "../lib/event.js";
import { error, json, logError } from "../lib/http.js";
import { MailError } from "../lib/mail.js";
import { sendSurvey } from "../lib/survey.js";

/*
 *   GET  /api/admin/survey/results  → survey, decrypted responses, sent/answered counts ("umfrage")
 *   POST /api/admin/survey/send     → send the invitation now to all checked-in guests ("einstellungen")
 */
export default async (req: Request) => {
  const isSend = new URL(req.url).pathname.endsWith("/send");
  const session = await requireAdmin(req, isSend ? "einstellungen" : "umfrage");
  if (session instanceof Response) return session;
  try {
    if (isSend) {
      if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);
      const result = await sendSurvey(session.username, new URL(req.url).origin);
      return json({ ok: true, ...result });
    }
    if (req.method !== "GET") return error("Methode nicht erlaubt.", 405);
    const settings = await getEvent();
    const [rows, [counts]] = await Promise.all([
      db.select().from(surveyResponses).orderBy(desc(surveyResponses.createdAt)),
      db
        .select({ sent: sql<number>`count(*) filter (where ${registrations.surveySentAt} is not null)::int`, checkedIn: sql<number>`count(*)::int` })
        .from(registrations)
        .where(isNotNull(registrations.checkedInAt)),
    ]);
    const responses = await Promise.all(
      rows.map(async (r) => ({ id: r.id, createdAt: r.createdAt, answers: JSON.parse((await open(r.answers))?.plain ?? "{}") as SurveyAnswers })),
    );
    return json({
      survey: normalizeSurvey("survey" in settings ? settings.survey : null),
      sentAt: "surveySentAt" in settings ? settings.surveySentAt : null,
      sent: counts?.sent ?? 0,
      checkedIn: counts?.checkedIn ?? 0,
      responses,
    });
  } catch (err) {
    if (err instanceof MailError) return error(err.message, 502);
    logError("Admin survey request failed", err);
    return error("Die Umfrage ist gerade nicht verfügbar.", 500);
  }
};

export const config: Config = { path: ["/api/admin/survey/results", "/api/admin/survey/send"] };
