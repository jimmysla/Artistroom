import type { Config, Context } from "@netlify/functions";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { eventSettings, registrations, surveyResponses, type Registration } from "../../db/schema.js";
import { MAX_AMOUNT_CENTS, hasTicket, isFinalStatus, instagramUrl, tiktokUrl, categoryLabel, formatNet, formatRegistrationNumber, isStatus, statusLabel } from "../../shared/registration.js";
import { checkCredentials, requireAdmin } from "../lib/auth.js";
import { allowedProviders, isPaymentProvider, paymentPageUrl } from "../lib/payments.js";
import { encryptLegacyRegistrations, openRegistration, openRegistrations } from "../lib/pii.js";
import { TransportError, readSealed } from "../lib/crypto.js";
import { logAction, purgeRegistrationLog } from "../lib/audit.js";
import { RESET_CONFIRMATION } from "../../shared/admin.js";
import { error, json, logError, readJson, str } from "../lib/http.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

import { randomUUID } from "node:crypto";
import { getEvent } from "../lib/event.js";
import { buildStatusMail, checkMailConfig, sendMail, sendStatusMail, MailError } from "../lib/mail.js";

function toCsv(rows: Registration[]): string {
  const escape = (v: string) => {
    // Neutralise spreadsheet formula injection and quote every cell.
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["Anmeldenummer", "Datum", "Künstlername", "Vorname", "Nachname", "E-Mail", "Instagram", "TikTok", "Eingeladen / empfohlen von", "Stadt", "Kategorie", "Status", "Betrag (EUR)", "Foto/Video-Einwilligung", "Check-in", "E-Mail versendet"];
  const lines = rows.map((r) =>
    [
      formatRegistrationNumber(r.id),
      new Date(r.createdAt).toISOString(),
      r.name,
      r.firstName ?? "",
      r.lastName ?? "",
      r.email,
      r.instagram ? instagramUrl(r.instagram) : "",
      r.tiktok ? tiktokUrl(r.tiktok) : "",
      r.referredBy ?? "",
      r.city ?? "",
      categoryLabel(r.category),
      statusLabel(r.status),
      r.amountCents != null ? (r.amountCents / 100).toFixed(2).replace(".", ",") : "",
      r.mediaConsentAt ? new Date(r.mediaConsentAt).toISOString() : "",
      r.checkedInAt ? new Date(r.checkedInAt).toISOString() : "",
      r.emailSentAt ? new Date(r.emailSentAt).toISOString() : "",
    ]
      .map(escape)
      .join(";"),
  );
  // BOM so Excel opens umlauts correctly.
  return "﻿" + [header.map(escape).join(";"), ...lines].join("\r\n");
}

const target = (r: Pick<Registration, "id" | "name">) => `${formatRegistrationNumber(r.id)} · ${r.name}`;
const statusText = (status: string, amountCents: number | null) =>
  statusLabel(status) + (amountCents != null && ["zahlung_angefordert", "bezahlt"].includes(status) ? ` · ${formatNet(amountCents)}` : "");

export default async (req: Request, context: Context) => {
  const idParam = context.params?.id;
  const method = req.method;
  const isCsv = !idParam && new URL(req.url).searchParams.get("format") === "csv";
  const isReminder = Boolean(idParam) && new URL(req.url).pathname.endsWith("/reminder");

  // Which permission each operation needs; the check-in view also needs the (read-only) list.
  const session = await requireAdmin(
    req,
    ...(idParam === "reset"
      ? (["super"] as const)
      : isCsv
        ? (["export"] as const)
        : method === "PATCH" || isReminder
          ? (["status"] as const)
          : method === "DELETE"
            ? (["loeschen"] as const)
            : idParam
              ? (["anmeldungen"] as const)
              : (["anmeldungen", "checkin"] as const)),
  );
  if (session instanceof Response) return session;
  const actor = session.username;

  try {
    if (idParam === "reset") {
      if (method !== "POST") return error("Methode nicht erlaubt.", 405);
      // Encrypted body: confirmation phrase + credentials of a super user (re-authentication).
      const body = await readSealed(req);
      if (body.confirm !== RESET_CONFIRMATION) return error(`Bitte zur Bestätigung „${RESET_CONFIRMATION}“ eingeben.`, 422);
      const username = str(body.username).trim();
      const authorizer = username && str(body.password) ? await checkCredentials(username, str(body.password)) : null;
      if (!authorizer?.isSuper) {
        await logAction({ username: actor, action: "reset_verweigert", target: username.slice(0, 60) || null, details: authorizer ? "Konto ist kein Super User" : "Login fehlgeschlagen" });
        await delay(800);
        return error(authorizer ? "Dieses Konto ist kein Super User. Nur Super User dürfen alle Anmeldungen löschen." : "Benutzername oder Passwort ist falsch.", 403, { fieldErrors: { password: "Login fehlgeschlagen" } });
      }
      const [{ count: rowCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(registrations);
      const [{ count: responseCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(surveyResponses);
      // Removes every registration and restarts the serial so the next registration is #0001 again.
      await db.execute(sql`TRUNCATE TABLE ${registrations} RESTART IDENTITY`);
      // The survey belongs to the past event too: answers deleted, automatic sending re-armed.
      await db.delete(surveyResponses);
      await db.update(eventSettings).set({ surveySentAt: null });
      // Final: every log entry about a registration goes too (numbers start again at #0001).
      await purgeRegistrationLog();
      await logAction({
        username: actor,
        action: "alle_anmeldungen_geloescht",
        details: `${rowCount} Anmeldung(en), ${responseCount} Umfrage-Antwort(en) und alle zugehörigen Log-Einträge endgültig gelöscht, Anmeldenummern zurückgesetzt · bestätigt durch Login von ${authorizer.username}`,
      });
      return json({ ok: true, deleted: rowCount });
    }

    if (!idParam) {
      if (method !== "GET") return error("Methode nicht erlaubt.", 405);
      // Converts rows from before the encryption at rest (no-op once everything is encrypted).
      const converted = await encryptLegacyRegistrations().catch((err) => (logError("Legacy encryption failed", err), 0));
      if (converted) await logAction({ username: null, action: "daten_verschluesselt", details: `${converted} ältere Anmeldung(en) nachträglich verschlüsselt` });
      const rows = await openRegistrations(await db.select().from(registrations).orderBy(desc(registrations.createdAt)));

      if (isCsv) {
        await logAction({ username: actor, action: "csv_export", details: `${rows.length} Anmeldung(en)` });
        const date = new Date().toISOString().slice(0, 10);
        return new Response(toCsv(rows), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="artistroom-anmeldungen-${date}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return json({ registrations: rows });
    }

    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return error("Ungültige ID.", 400);

    // Payment reminder (template "zahlungserinnerung") with the link to the checkout page.
    if (isReminder) {
      if (method !== "POST") return error("Methode nicht erlaubt.", 405);
      const [stored] = await db.select().from(registrations).where(eq(registrations.id, id));
      if (!stored) return error("Anmeldung nicht gefunden.", 404);
      if (stored.status !== "zahlung_angefordert" || !stored.paymentRef) return error("Für diese Anmeldung ist keine Zahlung ausstehend.", 409);
      const row = await openRegistration(stored);
      const event = await getEvent();
      const settings = { ...event, paymentUrl: paymentPageUrl(new URL(req.url).origin, stored.paymentRef) };
      checkMailConfig(settings, "zahlung_angefordert");
      const mail = await buildStatusMail({ ...row, status: "zahlungserinnerung" }, settings);
      await sendMail(settings, { to: row.email, ...mail });
      await logAction({ username: actor, action: "zahlungserinnerung_gesendet", target: target(row), details: `${statusText(row.status, row.amountCents)} · E-Mail an ${row.email}`, registrationId: row.id });
      return json({ ok: true });
    }

    if (method === "GET") {
      const [row] = await db.select().from(registrations).where(eq(registrations.id, id));
      return row ? json({ registration: await openRegistration(row) }) : error("Anmeldung nicht gefunden.", 404);
    }

    if (method === "PATCH") {
      const body = await readJson(req);
      const status = body?.status;
      if (!isStatus(status)) return error("Ungültiger Status.", 422);
      // "Bezahlt" is only ever set automatically after Stripe/PayPal confirmed the payment.
      if (status === "bezahlt") return error("„Bezahlt“ wird automatisch gesetzt, sobald Stripe oder PayPal die Zahlung bestätigt haben.", 422);

      // Only a payment request carries an amount.
      let amountCents: number | null = null;
      if (status === "zahlung_angefordert") {
        const raw = body?.amountCents;
        if (typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= MAX_AMOUNT_CENTS) amountCents = raw;
        else return error("Bitte gib einen gültigen Betrag ein.", 422);
      }

      if (body?.confirmEmail !== true || !Number.isInteger(body?.revision)) return error("Bitte den E-Mail-Versand bestätigen.", 422);
      const event = await getEvent();
      // Payment requests always go through our checkout page (/zahlung), which waits for the
      // server-side confirmation by Stripe/PayPal and then sets "bezahlt" automatically.
      const online = status === "zahlung_angefordert" ? (isPaymentProvider(event.paymentProvider) ? event.paymentProvider : "online") : null;
      if (online && !(await allowedProviders()).length) return error("Stripe bzw. PayPal ist noch nicht eingerichtet – bitte unter Einstellungen → Zahlung die Zugangsdaten hinterlegen.", 422);
      const paymentRef = online ? randomUUID() : null;
      const settings = online ? { ...event, paymentUrl: paymentPageUrl(new URL(req.url).origin, paymentRef!) } : event;
      const paymentFields =
        status === "zahlung_angefordert" ? { paymentProvider: online, paymentRef, paymentCheckout: null, paymentAmountCents: null } : { paymentProvider: null, paymentRef: null, paymentCheckout: null, paymentAmountCents: null };
      try {
        checkMailConfig(settings, status);
      } catch (err) {
        const [stored] = await db.select({ id: registrations.id, name: registrations.name }).from(registrations).where(eq(registrations.id, id));
        const row = stored && (await openRegistration(stored));
        await logAction({ username: actor, action: "status_fehlgeschlagen", target: row ? target(row) : formatRegistrationNumber(id), details: `${statusText(status, amountCents ?? null)} · ${(err as Error).message}`, registrationId: id });
        throw err;
      }
      // Persist a stable opaque ticket before sending, including across failed send attempts.
      await db.update(registrations).set({ ticketToken: sql`coalesce(${registrations.ticketToken}, ${randomUUID()})` }).where(eq(registrations.id, id));
      const result = await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(registrations).where(eq(registrations.id, id)).for("update");
        if (!locked) return error("Anmeldung nicht gefunden.", 404);
        const old = await openRegistration(locked);
        if (old.revision !== body.revision) return error("Die Anmeldung wurde inzwischen geändert. Bitte aktualisieren und erneut prüfen.", 409);
        if (old.checkedInAt) return error("Bereits eingecheckte Anmeldungen können nicht mehr umgestellt werden.", 409);
        if (old.status === "zahlung_angefordert" && old.paymentProvider) return error(`Es wird auf die Zahlungsbestätigung ${old.paymentProvider === "stripe" ? "von Stripe" : old.paymentProvider === "paypal" ? "von PayPal" : "(Stripe/PayPal)"} gewartet – bis dahin ist der Status gesperrt. Abbrechen nur über das Logging.`, 409);
        if (isFinalStatus(old.status)) return error(hasTicket(old.status) ? "Für diese Anmeldung wurde bereits ein Ticket ausgestellt – der Status ist gesperrt. Ein Fehler lässt sich nur im Logging rückgängig machen." : "Diese Anmeldung wurde abgelehnt – der Status ist gesperrt. Ein Fehler lässt sich nur im Logging rückgängig machen.", 409);
        const next = { ...old, status, amountCents, revision: old.revision + 1 };
        try {
          await sendStatusMail(next, settings);
        } catch (err) {
          await logAction({ username: actor, action: "status_fehlgeschlagen", target: target(old), details: `${statusText(status, next.amountCents)} · ${(err as Error).message}`, registrationId: id });
          throw err;
        }
        const row = await openRegistration((await tx.update(registrations).set({ status, amountCents: next.amountCents, revision: next.revision, emailSentAt: new Date(), ...paymentFields }).where(eq(registrations.id, id)).returning())[0]);
        await logAction({ username: actor, action: "status_geaendert", target: target(row), details: `${statusText(old.status, old.amountCents)} → ${statusText(status, row.amountCents)} · E-Mail an ${row.email}`, registrationId: id, undo: { kind: "status", id, revision: row.revision, before: { status: old.status, amountCents: old.amountCents } } });
        return json({ registration: row });
      });
      return result;
    }

    if (method === "DELETE") {
      const [deleted] = await db.delete(registrations).where(eq(registrations.id, id)).returning();
      if (!deleted) return error("Anmeldung nicht gefunden.", 404);
      // Deleted people vanish from the log entirely; the deletion itself is noted without personal data.
      await purgeRegistrationLog(deleted.id);
      await logAction({ username: actor, action: "anmeldung_geloescht", target: formatRegistrationNumber(deleted.id), details: `${categoryLabel(deleted.category)} · Anmeldung und alle zugehörigen Log-Einträge endgültig gelöscht` });
      return json({ ok: true });
    }

    return error("Methode nicht erlaubt.", 405);
  } catch (err) {
    if (err instanceof MailError) return error(err.message, 502);
    if (err instanceof TransportError) return error(err.message, 400);
    console.error("Admin registrations operation failed");
    return error("Die Daten konnten nicht geladen werden.", 500);
  }
};

export const config: Config = {
  path: ["/api/admin/registrations", "/api/admin/registrations/:id", "/api/admin/registrations/:id/reminder"],
};
