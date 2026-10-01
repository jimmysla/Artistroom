import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT, validPaymentUrl, type EventSettings } from "../../shared/event.js";
import { parseEuroToCents, validateEmail } from "../../shared/registration.js";
import { requireAdmin } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { TransportError, readSealed, seal } from "../lib/crypto.js";
import { getEvent } from "../lib/event.js";
import { describeProductChanges, describeSurveyChanges, describeTemplateChanges } from "../lib/diff.js";
import { createTestCheckout } from "../lib/test-checkout.js";
import { PAYMENT_PROVIDERS, PaymentError, isPaymentProvider, paymentCredentials, providerConfigured, testProvider } from "../lib/payments.js";
import { isTemplateStatus, normalizeMailTemplates } from "../../shared/mail-template.js";
import { normalizeSurvey } from "../../shared/survey.js";
import { normalizeProduct } from "../../shared/product.js";
import { MailError, buildStatusMail, mailProvider, sendMail } from "../lib/mail.js";
import type { Registration } from "../../db/schema.js";
import { json, error, str, logError } from "../lib/http.js";
const LABELS: Record<keyof typeof DEFAULT_EVENT, string> = {
  name: "Name", date: "Datum", time: "Uhrzeit", location: "Ort", senderEmail: "Absenderadresse", senderName: "Absendername", paymentUrl: "Zahlungslink", welcomeText: "Startseiten-Text", welcomeImage: "Startseiten-Bild", showLegal: "Impressum/Datenschutz im Footer", imprintText: "Impressum", privacyText: "Datenschutzerklärung", paymentProvider: "Zahlungsart",
  ticketPrice: "Ticketpreis", smtpHost: "SMTP-Server", smtpPort: "SMTP-Port", smtpSecurity: "SMTP-Verschlüsselung", smtpUser: "SMTP-Benutzer", smtpPassword: "SMTP-Passwort",
  stripeSecretKey: "Stripe-Secret-Key", paypalClientId: "PayPal-Client-ID", paypalClientSecret: "PayPal-Secret", paypalMode: "PayPal-Modus",
};
const SECURITY = ["starttls", "ssl"];
/** Max length of the free-text settings (others: 1000). */
const LONG_TEXT: Partial<Record<keyof typeof DEFAULT_EVENT, number>> = { welcomeText: 5000, imprintText: 30000, privacyText: 100000 };

/** Settings as sent to the admin UI – the SMTP password never leaves the server. */
/** Secret settings: never sent to the browser, stored encrypted; empty = keep, `<key>Clear` = remove. */
const SECRET_KEYS = ["smtpPassword", "stripeSecretKey", "paypalClientSecret"] as const;

const forAdmin = async (s: EventSettings & { mailTemplates?: unknown; survey?: unknown; product?: unknown; surveySentAt?: Date | null }) => ({
  settings: { ...s, smtpPassword: "", stripeSecretKey: "", paypalClientSecret: "" },
  secretsSet: { smtpPassword: Boolean(s.smtpPassword), stripeSecretKey: Boolean(s.stripeSecretKey), paypalClientSecret: Boolean(s.paypalClientSecret) },
  mailTemplates: normalizeMailTemplates(s.mailTemplates),
  survey: normalizeSurvey(s.survey),
  product: normalizeProduct(s.product),
  surveySentAt: s.surveySentAt ?? null,
  smtpPasswordSet: Boolean(s.smtpPassword),
  mailProvider: mailProvider(s),
  mailConfigured: Boolean(mailProvider(s) && s.senderEmail),
  paymentProviders: await (async () => {
    const c = await paymentCredentials(s);
    return { stripe: providerConfigured("stripe", c), paypal: providerConfigured("paypal", c) };
  })(),
});

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const admin = path.startsWith("/api/admin/");
  const session = admin ? await requireAdmin(req, "einstellungen") : null;
  if (session instanceof Response) return session;
  try {
    if (path.endsWith("/test-checkout")) {
      if (!session || req.method !== "POST") return error("Methode nicht erlaubt.", 405);
      return json({ url: await createTestCheckout(session.username, new URL(req.url).origin) });
    }
    if (path.endsWith("/test-payment")) {
      if (!session || req.method !== "POST") return error("Methode nicht erlaubt.", 405);
      // Tests the entered (or else stored) credentials without saving them.
      const body = await readSealed(req);
      const provider = body.provider;
      if (!isPaymentProvider(provider)) return error("Unbekannter Zahlungsanbieter.", 422);
      const stored = await paymentCredentials(await getEvent());
      const c = {
        stripeKey: str(body.stripeSecretKey) || stored.stripeKey,
        paypalId: str(body.paypalClientId) || stored.paypalId,
        paypalSecret: str(body.paypalClientSecret) || stored.paypalSecret,
        paypalSandbox: body.paypalMode !== undefined ? body.paypalMode === "sandbox" : stored.paypalSandbox,
      };
      try {
        const message = await testProvider(provider, c);
        await logAction({ username: session.username, action: "zahlung_verbindung_getestet", details: `${provider === "stripe" ? "Stripe" : "PayPal"}: ${message}` });
        return json({ ok: true, message });
      } catch (err) {
        await logAction({ username: session.username, action: "zahlung_verbindung_getestet", details: `${provider === "stripe" ? "Stripe" : "PayPal"}: fehlgeschlagen – ${(err as Error).message}` });
        throw err;
      }
    }
    if (path.endsWith("/test-mail")) {
      if (!session || req.method !== "POST") return error("Methode nicht erlaubt.", 405);
      const body = await readSealed(req);
      const to = str(body.to).trim();
      if (validateEmail(to)) return error("Bitte eine gültige Empfängeradresse eingeben.", 422);
      const s = await getEvent();
      const template = str(body.template);
      if (isTemplateStatus(template)) {
        // Sample registration so the saved template/design can be checked in a real inbox.
        const sample = { id: 42, name: "DJ Beispiel", firstName: "Alex", category: "dj", email: to, status: template, amountCents: parseEuroToCents(s.ticketPrice) ?? 1500, ticketToken: "00000000-0000-4000-8000-000000000000", revision: 0 } as Registration;
        const mail = await buildStatusMail(sample, s, { surveyUrl: `${new URL(req.url).origin}/umfrage?t=beispiel` });
        await sendMail(s, { to, ...mail, subject: `[Test] ${mail.subject}` });
      } else {
        await sendMail(s, {
          to,
          subject: `${s.name}: Test-E-Mail`,
          text: `Diese Test-E-Mail bestätigt, dass der E-Mail-Versand für ${s.name} funktioniert.`,
          html: `<p>Diese Test-E-Mail bestätigt, dass der E-Mail-Versand funktioniert.</p>`,
        });
      }
      await logAction({ username: session.username, action: "testmail_gesendet", target: to, details: isTemplateStatus(template) ? `Vorlage: ${template}` : null });
      return json({ ok: true });
    }
    if (req.method === "GET") {
      const s = await getEvent();
      return json(admin ? await forAdmin(s) : { settings: { name: s.name, date: s.date, time: s.time, location: s.location, ticketPrice: s.ticketPrice, welcomeText: s.welcomeText, welcomeImage: s.welcomeImage, showLegal: s.showLegal, imprintText: s.imprintText, privacyText: s.privacyText } });
    }
    if (!session || req.method !== "PUT") return error("Methode nicht erlaubt.", 405);
    // Whole body (incl. SMTP password) arrives encrypted from the browser.
    const body = await readSealed(req);
    const before = await getEvent();
    const s = { ...DEFAULT_EVENT };
    for (const key of Object.keys(s) as (keyof typeof s)[]) {
      if ((SECRET_KEYS as readonly string[]).includes(key)) continue;
      if (typeof body[key] !== "string" || (body[key] as string).length > (LONG_TEXT[key] ?? 1000)) return error("Ungültige Einstellungen.", 422);
      s[key] = (body[key] as string).trim();
    }
    // Secrets (any length) are encrypted: empty = keep, `<key>Clear: true` = remove.
    for (const key of SECRET_KEYS) {
      const value = str(body[key]);
      s[key] = body[`${key}Clear`] === true ? "" : value ? await seal(value) : before[key];
    }
    if (!["live", "sandbox"].includes(s.paypalMode)) return error("Ungültiger PayPal-Modus.", 422);

    if (!s.name || !s.location || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || Number.isNaN(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0,10) !== s.date || (s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))) return error("Bitte Name, gültiges Datum, Uhrzeit und Ort prüfen.", 422);
    if ((s.senderEmail && validateEmail(s.senderEmail)) || /[\r\n<>]/.test(s.senderName) || !s.senderName) return error("Bitte gültigen Absender eintragen.", 422);
    if (s.welcomeImage && !/^[0-9a-f-]{36}$/.test(s.welcomeImage)) return error("Ungültiges Startseiten-Bild.", 422);
    if (!["an", "aus"].includes(s.showLegal)) return error("Ungültige Footer-Einstellung.", 422);
    if (s.paymentProvider === "link") s.paymentProvider = "online"; // retired mode: checkout is the standard
    if (!["online", ...PAYMENT_PROVIDERS].includes(s.paymentProvider)) return error("Ungültige Zahlungsart.", 422);
    const creds = await paymentCredentials(s);
    if (s.paymentProvider === "online" && !PAYMENT_PROVIDERS.some((p) => providerConfigured(p, creds))) return error("Für „Stripe + PayPal“ bitte mindestens einen Anbieter einrichten.", 422);
    if (isPaymentProvider(s.paymentProvider) && !providerConfigured(s.paymentProvider, creds)) return error(`${s.paymentProvider === "stripe" ? "Stripe" : "PayPal"} ist noch nicht eingerichtet – bitte zuerst die Zugangsdaten unten eintragen.`, 422);
    if (s.paymentUrl && !validPaymentUrl(s.paymentUrl)) return error("Der Zahlungslink muss eine gültige HTTPS-Adresse sein.", 422);
    if (s.ticketPrice) {
      const cents = parseEuroToCents(s.ticketPrice);
      if (cents == null) return error("Ticketpreis: bitte nur eine Zahl eingeben, z. B. 15 oder 12,50.", 422);
      s.ticketPrice = (cents / 100).toFixed(cents % 100 ? 2 : 0).replace(".", ",");
    }
    if (s.smtpHost && !/^[a-zA-Z0-9.-]{3,253}$/.test(s.smtpHost)) return error("Bitte einen gültigen SMTP-Server eintragen, z. B. smtp.example.de.", 422);
    if (!/^\d{1,5}$/.test(s.smtpPort) || +s.smtpPort < 1 || +s.smtpPort > 65535) return error("Bitte einen gültigen SMTP-Port eintragen (meist 587 oder 465).", 422);
    if (!SECURITY.includes(s.smtpSecurity)) return error("Ungültige SMTP-Verschlüsselung.", 422);
    if (/[\r\n]/.test(s.smtpUser)) return error("Ungültiger SMTP-Benutzer.", 422);

    // Mail templates (Baukasten): validated and completed with defaults; omitted = keep.
    const beforeTemplates = "mailTemplates" in before ? (before.mailTemplates ?? null) : null;
    const mailTemplates = body.mailTemplates !== undefined ? normalizeMailTemplates(body.mailTemplates) : beforeTemplates;
    const templatesChanged = JSON.stringify(mailTemplates) !== JSON.stringify(beforeTemplates);

    // Survey builder: same pattern; a new send time re-arms the automatic invitation
    // (people who already got it are skipped per registration).
    const beforeSurvey = "survey" in before ? (before.survey ?? null) : null;
    const survey = body.survey !== undefined ? normalizeSurvey(body.survey) : beforeSurvey;
    const surveyChanged = JSON.stringify(survey) !== JSON.stringify(beforeSurvey);
    const rearm = surveyChanged && normalizeSurvey(survey).sendAt !== normalizeSurvey(beforeSurvey).sendAt;

    const beforeProduct = "product" in before ? (before.product ?? null) : null;
    const product = body.product !== undefined ? normalizeProduct(body.product) : beforeProduct;
    const productChanged = JSON.stringify(product) !== JSON.stringify(beforeProduct);

    const row = {
      ...s,
      product: product as Record<string, unknown> | null,
      mailTemplates: mailTemplates as Record<string, unknown> | null,
      survey: survey as Record<string, unknown> | null,
      ...(rearm ? { surveySentAt: null } : {}),
    };
    await db.insert(eventSettings).values({ id: 1, ...row }).onConflictDoUpdate({ target: eventSettings.id, set: row });
    const changes = (Object.keys(LABELS) as (keyof typeof s)[])
      .filter((k) => before[k] !== s[k])
      .map((k) => ((SECRET_KEYS as readonly string[]).includes(k) || k === "imprintText" || k === "privacyText" ? `${LABELS[k]} ${s[k] ? "geändert" : "entfernt"}` : `${LABELS[k]}: „${before[k] || "–"}“ → „${s[k] || "–"}“`));
    const previous: Record<string, unknown> = Object.fromEntries((Object.keys(LABELS) as (keyof typeof s)[]).filter((k) => before[k] !== s[k]).map((k) => [k, before[k]]));
    if (productChanged) {
      changes.push(...(describeProductChanges(beforeProduct, product).map((c) => `Checkout: ${c}`)));
      previous.product = beforeProduct;
    }
    if (surveyChanged) {
      changes.push(...describeSurveyChanges(beforeSurvey, survey));
      previous.survey = beforeSurvey;
    }
    if (templatesChanged) {
      const details = describeTemplateChanges(beforeTemplates, mailTemplates);
      changes.push(...(details.length ? details : ["E-Mail-Vorlagen geändert"]));
      previous.mailTemplates = beforeTemplates;
    }
    if (changes.length) await logAction({ username: session.username, action: "einstellungen_geaendert", details: changes.join("; "), undo: { kind: "settings", before: previous } });
    return json(await forAdmin(row));
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    if (err instanceof MailError || err instanceof PaymentError) return error(err.message, 502);
    logError("Event settings error", err);
    return error("Einstellungen konnten nicht gespeichert oder geladen werden.", 500);
  }
};
export const config: Config = { path: ["/api/event", "/api/admin/settings", "/api/admin/settings/test-mail", "/api/admin/settings/test-payment", "/api/admin/settings/test-checkout"] };
