import QRCode from "qrcode";
import type { Registration } from "../../db/schema.js";
import type { EventSettings } from "../../shared/event.js";
import { eventDate, validPaymentUrl } from "../../shared/event.js";
import { categoryLabel, statusLabel, formatNet, formatRegistrationNumber } from "../../shared/registration.js";
import nodemailer from "nodemailer";
import { isTemplateStatus, normalizeMailTemplates, renderMail, type MailVars } from "../../shared/mail-template.js";
import { open } from "./crypto.js";
import { inlineImages } from "./inline-images.js";
import { categoriesOf } from "./event.js";
export class MailError extends Error {}

export const smtpConfigured = (s: EventSettings) => Boolean(s.smtpHost && s.smtpUser && s.smtpPassword);
export const mailProvider = (s: EventSettings): "smtp" | "resend" | null =>
  smtpConfigured(s) ? "smtp" : Netlify.env.get("RESEND_API_KEY") ? "resend" : null;

export function checkMailConfig(settings: EventSettings, status?: string) {
  if (!mailProvider(settings) || !settings.senderEmail) throw new MailError("E-Mail-Versand noch nicht eingerichtet. Bitte Absenderadresse und SMTP-Postfach in den Einstellungen hinterlegen.");
  if (status === "zahlung_angefordert" && !validPaymentUrl(settings.paymentUrl)) throw new MailError(settings.paymentProvider === "link" ? "Bitte zuerst einen Zahlungslink in den Einstellungen hinterlegen." : "Die Zahlungsseite braucht eine HTTPS-Adresse.");
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** `cid` = inline image referenced as `cid:<id>` in the HTML (QR code). */
  attachments?: { filename: string; content: Buffer; cid?: string }[];
  idempotencyKey?: string;
}

/** Sends via the configured SMTP mailbox, otherwise via Resend. Throws MailError with a German message. */
export async function sendMail(settings: EventSettings, mail: Mail) {
  checkMailConfig(settings);
  if (mailProvider(settings) === "smtp") {
    const password = (await open(settings.smtpPassword))?.plain;
    if (!password) throw new MailError("Das SMTP-Passwort konnte nicht entschlüsselt werden. Bitte in den Einstellungen neu eingeben.");
    const port = Number(settings.smtpPort) || 587;
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port,
      secure: settings.smtpSecurity === "ssl",
      requireTLS: settings.smtpSecurity !== "ssl",
      auth: { user: settings.smtpUser, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transport.sendMail({
        from: { name: settings.senderName, address: settings.senderEmail },
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: mail.attachments,
      });
    } catch (err) {
      console.error("SMTP send failed", (err as { code?: string }).code ?? "unknown error");
      const code = (err as { code?: string }).code;
      throw new MailError(
        code === "EAUTH"
          ? "SMTP-Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort des Postfachs prüfen."
          : code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS"
            ? "SMTP-Server nicht erreichbar. Bitte Server, Port und Verschlüsselung prüfen."
            : "E-Mail konnte über SMTP nicht versendet werden. Bitte die Postfach-Einstellungen prüfen.",
      );
    } finally {
      transport.close();
    }
    return;
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${Netlify.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json", ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey } : {}) },
      body: JSON.stringify({ from: `${settings.senderName} <${settings.senderEmail}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments?.map(a => ({ filename: a.filename, content: a.content.toString("base64"), ...(a.cid ? { content_id: a.cid } : {}) })) }),
    });
  } catch { throw new MailError("Der E-Mail-Dienst ist nicht erreichbar. Bitte erneut versuchen."); }
  if (!response.ok) throw new MailError("E-Mail konnte nicht versendet werden. Bitte Resend-Konfiguration und verifizierte Absenderdomain prüfen.");
}

type SettingsWithTemplates = EventSettings & { mailTemplates?: unknown };

const QR_CID = "ticket-qr";

export const mailVars = (row: Registration, settings: EventSettings): MailVars => ({
  vorname: row.firstName || row.name,
  name: row.name,
  nummer: formatRegistrationNumber(row.id),
  kategorie: categoryLabel(row.category, categoriesOf(settings)),
  event: settings.name,
  datum: eventDate(settings),
  ort: settings.location,
  betrag: row.amountCents ? formatNet(row.amountCents) : "",
  zahlungslink: settings.paymentUrl,
  umfragelink: "",
});

/** Builds the status mail from the configured template (or the built-in text for "ausstehend"). */
export async function buildStatusMail(row: Registration, settings: SettingsWithTemplates, extra: { surveyUrl?: string } = {}) {
  const ticket = ["kostenlos", "bezahlt"].includes(row.status) && Boolean(row.ticketToken);
  const qr = ticket ? await QRCode.toBuffer(`artistroom:${row.ticketToken}`, { width: 640, margin: 4, errorCorrectionLevel: "M" }) : null;
  if (isTemplateStatus(row.status)) {
    const templates = normalizeMailTemplates(settings.mailTemplates);
    const qrInline = templates.design.blocks.some((b) => b.id === "qr" && b.enabled);
    const images = await inlineImages(templates.design);
    const mail = renderMail(templates, row.status, { ...mailVars(row, settings), umfragelink: extra.surveyUrl ?? "" }, {
      qrSrc: qr ? `cid:${QR_CID}` : undefined,
      logoUrl: images.logoUrl,
      imageUrl: images.imageUrl,
      externalUrl: images.externalUrl,
      paymentUrl: settings.paymentUrl,
      surveyUrl: extra.surveyUrl,
    });
    const text = ticket ? `${mail.text}\n\nTicketcode: artistroom:${row.ticketToken}` : mail.text;
    const attachments = [...images.attachments, ...(qr ? [{ filename: "Artistroom-Ticket.png", content: qr, ...(qrInline ? { cid: QR_CID } : {}) }] : [])];
    return { subject: mail.subject, html: mail.html, text, attachments: attachments.length ? attachments : undefined };
  }
  const lines = [
    `Hallo ${row.firstName || row.name},`, `deine Anmeldung ${formatRegistrationNumber(row.id)}: ${statusLabel(row.status)}.`,
    `${settings.name} · ${eventDate(settings)} · ${settings.location}`, `Kategorie: ${categoryLabel(row.category, categoriesOf(settings))}`,
    "Deine Anmeldung wird erneut geprüft. Ein bisheriges Ticket ist bis zur Freigabe nicht gültig.",
  ];
  return { subject: `${settings.name}: ${statusLabel(row.status)} · ${formatRegistrationNumber(row.id)}`, text: lines.join("\n\n"), html: lines.map(l => `<p>${escape(l)}</p>`).join(""), attachments: undefined };
}

export async function sendStatusMail(row: Registration, settings: SettingsWithTemplates) {
  checkMailConfig(settings, row.status);
  const mail = await buildStatusMail(row, settings);
  try {
    await sendMail(settings, { to: row.email, ...mail, idempotencyKey: `registration-${row.id}-revision-${row.revision}` });
  } catch (err) {
    if (err instanceof MailError) throw new MailError(`${err.message} Der Status wurde nicht geändert.`);
    throw err;
  }
}
