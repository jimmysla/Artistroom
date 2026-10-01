import type { Config } from "@netlify/functions";
import { eq, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, type Registration } from "../../db/schema.js";
import { categoriesOf, formOf, getEvent } from "../lib/event.js";
import { enabledCategories, fieldEnabled, validateCustomAnswers } from "../../shared/site.js";
import { MailError, buildStatusMail, mailProvider, sendMail } from "../lib/mail.js";
import { normalizeMailTemplates } from "../../shared/mail-template.js";
import { categoryLabel, formatRegistrationNumber, normalizeInstagram, normalizeTiktok, validateDetails } from "../../shared/registration.js";
import { error, json, str, logError, crossSiteError, isCrossSite } from "../lib/http.js";
import { TransportError, blindIndex, readSealed } from "../lib/crypto.js";
import { openRegistration, sealRegistration } from "../lib/pii.js";
import { logAction } from "../lib/audit.js";
import { ticketAvailability } from "../lib/tickets.js";

/** Confirmation mail ("Anmeldung eingegangen") – a mail problem must never fail the registration. */
async function sendConfirmation(row: Registration) {
  try {
    const settings = await getEvent();
    const templates = normalizeMailTemplates("mailTemplates" in settings ? settings.mailTemplates : null);
    if (!templates.sendConfirmation || !mailProvider(settings) || !settings.senderEmail) return;
    const mail = await buildStatusMail({ ...row, status: "eingegangen" }, settings);
    await sendMail(settings, { to: row.email, ...mail, idempotencyKey: `registration-${row.id}-confirmation` });
    await logAction({ username: null, action: "bestaetigung_gesendet", target: `${formatRegistrationNumber(row.id)} · ${row.name}`, details: `E-Mail an ${row.email}`, registrationId: row.id });
  } catch (err) {
    logError("Confirmation mail failed", err);
    await logAction({ username: null, action: "bestaetigung_fehlgeschlagen", target: `${formatRegistrationNumber(row.id)} · ${row.name}`, details: err instanceof MailError ? err.message : "Unbekannter Fehler", registrationId: row.id });
  }
}

export default async (req: Request) => {
  if (isCrossSite(req)) return crossSiteError();
  if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);

  // Personal data arrives encrypted from the browser (src/lib/secure.ts).
  let body: Record<string, unknown>;
  try {
    body = await readSealed(req);
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    logError("Transport decryption unavailable", err);
    return error("Deine Anmeldung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.", 500);
  }

  // Honeypot: real users never fill this hidden field. Pretend success so bots don't retry.
  if (str(body.website)) return json({ ok: true }, 201);

  let settings: Awaited<ReturnType<typeof getEvent>>;
  try {
    settings = await getEvent();
  } catch (err) {
    logError("Event settings unavailable", err);
    return error("Deine Anmeldung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.", 500);
  }
  // Sold out: the form is greyed out in the browser; refuse direct requests too.
  try {
    if ((await ticketAvailability(settings)).soldOut) return error("Ausverkauft – alle Tickets sind vergeben. Eine Anmeldung ist nicht mehr möglich.", 409, { soldOut: true });
  } catch (err) {
    logError("Ticket availability check failed", err);
    return error("Deine Anmeldung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.", 500);
  }
  const form = formOf(settings);
  // Optional fields hidden in the form builder are ignored.
  const optional = (field: "instagram" | "tiktok" | "referredBy", value: string) => (fieldEnabled(form, field) ? value : "");

  const input = {
    category: str(body.category),
    firstName: str(body.firstName).trim(),
    lastName: str(body.lastName).trim(),
    stageName: str(body.stageName).trim(),
    email: str(body.email).trim().toLowerCase(),
    instagram: optional("instagram", str(body.instagram)),
    tiktok: optional("tiktok", str(body.tiktok)),
    referredBy: optional("referredBy", str(body.referredBy).trim()),
    city: str(body.city).trim(),
  };

  const fieldErrors: Record<string, string> = { ...validateDetails(input) };
  if (!enabledCategories(form).some((c) => c.id === input.category)) fieldErrors.category = "Bitte wähle eine Kategorie.";
  const extraAnswers = body.extra && typeof body.extra === "object" ? (body.extra as Record<string, unknown>) : {};
  const custom = validateCustomAnswers(form, extraAnswers);
  Object.assign(fieldErrors, custom.errors);
  if (body.mediaConsent !== true) {
    fieldErrors.mediaConsent = "Bitte bestätige die Einwilligung zu Foto- und Videoaufnahmen.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return error("Bitte überprüfe deine Eingaben.", 422, { fieldErrors });
  }

  try {
    const [existing] = await db
      .select({ id: registrations.id })
      .from(registrations)
      // E-mails are stored encrypted → compare the keyed fingerprint (plus plain legacy rows).
      // One registration per e-mail address (across all categories).
      .where(or(eq(registrations.emailHash, await blindIndex(input.email)), eq(sql`lower(${registrations.email})`, input.email)))
      .limit(1);
    if (existing) {
      return error("Mit dieser E-Mail-Adresse gibt es bereits eine Anmeldung. Pro E-Mail-Adresse ist nur eine Anmeldung möglich.", 409, {
        fieldErrors: { email: "Mit dieser E-Mail ist bereits jemand angemeldet." },
      });
    }

    const [stored] = await db
      .insert(registrations)
      .values({
        ...(await sealRegistration({
          name: input.stageName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          instagram: normalizeInstagram(input.instagram) || null,
          tiktok: normalizeTiktok(input.tiktok) || null,
          referredBy: input.referredBy || null,
          city: input.city,
          extra: custom.values.length ? JSON.stringify(custom.values) : null,
        })),
        category: input.category,
        mediaConsentAt: new Date(),
      })
      .returning();
    const created = await openRegistration(stored);

    await logAction({
      username: null,
      action: "anmeldung_eingegangen",
      target: `${formatRegistrationNumber(created.id)} · ${input.stageName}`,
      details: `${categoryLabel(input.category, categoriesOf(settings))} · ${input.firstName} ${input.lastName} · ${input.city}${input.referredBy ? ` · empfohlen von ${input.referredBy}` : ""}`,
      registrationId: created.id,
    });
    await sendConfirmation(created);
    return json({ ok: true, id: created.id, createdAt: created.createdAt }, 201);
  } catch (err) {
    logError("Failed to store registration", err);
    return error("Deine Anmeldung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.", 500);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = {
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
  path: "/api/registrations",
  method: "POST",
};
