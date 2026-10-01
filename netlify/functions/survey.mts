import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, surveyResponses } from "../../db/schema.js";
import { formatRegistrationNumber } from "../../shared/registration.js";
import { normalizeSurvey, validateAnswers } from "../../shared/survey.js";
import { logAction } from "../lib/audit.js";
import { TransportError, readSealed, seal } from "../lib/crypto.js";
import { getEvent } from "../lib/event.js";
import { error, json, logError, str, crossSiteError, isCrossSite } from "../lib/http.js";

/*
 * Public survey page API (/umfrage?t=<personal token>):
 *   GET  /api/survey?t=     → questions (+ whether already answered)
 *   POST /api/survey        → { t, answers } (encrypted body), one response per token
 */
const TOKEN = /^[0-9a-f-]{36}$/;

async function load(token: string) {
  if (!TOKEN.test(token)) return null;
  const [row] = await db.select({ id: registrations.id }).from(registrations).where(eq(registrations.surveyToken, token));
  return row ?? null;
}

export default async (req: Request) => {
  if (isCrossSite(req)) return crossSiteError();
  try {
    const settings = await getEvent();
    const survey = normalizeSurvey("survey" in settings ? settings.survey : null);
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("t") ?? "";
      if (!TOKEN.test(token)) return error("Dieser Umfrage-Link ist ungültig.", 404);
      // One-time link: once answered, the token is burned and only "already used" is shown.
      const [answered] = await db.select({ id: surveyResponses.id }).from(surveyResponses).where(eq(surveyResponses.token, token));
      if (answered) return json({ event: settings.name, title: survey.title, intro: "", thanks: survey.thanks, questions: [], answered: true });
      const row = await load(token);
      if (!row) return error("Dieser Umfrage-Link ist ungültig oder abgelaufen.", 404);
      return json({ event: settings.name, title: survey.title, intro: survey.intro, thanks: survey.thanks, questions: survey.questions, answered: false });
    }
    if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);
    const body = await readSealed(req);
    const token = str(body.t);
    const row = await load(token);
    if (!row) return error("Dieser Umfrage-Link ist ungültig.", 404);
    const { answers, errors } = validateAnswers(survey, body.answers);
    if (Object.keys(errors).length) return error("Bitte beantworte alle Pflichtfragen.", 422, { fieldErrors: errors });
    const sealedAnswers = await seal(JSON.stringify(answers));
    // Burn the one-time token and store the answer atomically – a second submit finds no token.
    const created = await db.transaction(async (tx) => {
      const [burned] = await tx.update(registrations).set({ surveyToken: null }).where(eq(registrations.surveyToken, token)).returning({ id: registrations.id });
      if (!burned) return null;
      const [r] = await tx.insert(surveyResponses).values({ registrationId: burned.id, token, answers: sealedAnswers }).onConflictDoNothing().returning({ id: surveyResponses.id });
      return r ?? null;
    });
    if (!created) return error("Dieser Einmal-Link wurde bereits verwendet – danke für deine Antwort!", 409);
    await logAction({ username: null, action: "umfrage_beantwortet", target: formatRegistrationNumber(row.id), registrationId: row.id });
    return json({ ok: true, thanks: survey.thanks }, 201);
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    logError("Survey request failed", err);
    return error("Die Umfrage ist gerade nicht erreichbar. Bitte später erneut versuchen.", 500);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = { path: "/api/survey", rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };
