import { pgTable, serial, integer, text, timestamp, index, boolean, jsonb } from "drizzle-orm/pg-core";

export const registrations = pgTable(
  "registrations",
  {
    id: serial().primaryKey(),
    category: text().notNull(),
    // Künstlername / Stagename (or public name) – the display name everywhere.
    name: text().notNull(),
    // Nullable because registrations before the extended form only had `name`.
    firstName: text("first_name"),
    lastName: text("last_name"),
    // Personal fields (name … city) are stored encrypted (enc$v1$…, see netlify/lib/pii.ts).
    email: text().notNull(),
    // HMAC fingerprint of the lower-cased e-mail for the duplicate check (email itself is encrypted).
    emailHash: text("email_hash"),
    // Instagram / TikTok handles without "@" (the form accepts profile URLs).
    instagram: text(),
    tiktok: text(),
    referredBy: text("referred_by"),
    city: text(),
    // Answers to the custom questions of the form builder (shared/site.ts), encrypted JSON.
    extra: text(),
    status: text().notNull().default("ausstehend"),
    // Requested / paid amount in euro cents; only set for "zahlung_angefordert" and "bezahlt".
    amountCents: integer("amount_cents"),
    // When the registrant acknowledged that photos/videos are taken at the event (required to submit).
    mediaConsentAt: timestamp("media_consent_at", { withTimezone: true }),
    ticketToken: text("ticket_token").unique(),
    // Online payment while "zahlung_angefordert": provider ("stripe" | "paypal"), our random public
    // reference for the payment page (/zahlung?ref=…) and the current Stripe session / PayPal order id.
    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref").unique(),
    paymentCheckout: text("payment_checkout"),
    // Gross amount actually charged for the current checkout (net amount_cents + VAT); verified against.
    paymentAmountCents: integer("payment_amount_cents"),
    // Survey invitation: personal random token for /umfrage?t=… and when it was mailed.
    surveyToken: text("survey_token").unique(),
    surveySentAt: timestamp("survey_sent_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    revision: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("registrations_created_at_idx").on(t.createdAt)],
);

export type Registration = typeof registrations.$inferSelect;

export const adminUsers = pgTable("admin_users", {
  id: serial().primaryKey(),
  username: text().notNull().unique(),
  // scrypt hash, format: scrypt$N$r$p$saltB64$hashB64 – never the plain password.
  passwordHash: text("password_hash").notNull(),
  // Super users manage admin accounts and may reset all registrations; they implicitly have every permission.
  isSuper: boolean("is_super").notNull().default(false),
  // Permission IDs from shared/admin.ts, e.g. ["anmeldungen", "checkin"].
  permissions: jsonb().$type<string[]>().notNull().default([]),
  active: boolean().notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;

export const eventSettings = pgTable("event_settings", {
  id: integer().primaryKey(),
  name: text().notNull(),
  date: text().notNull(),
  time: text().notNull().default(""),
  location: text().notNull(),
  senderEmail: text("sender_email").notNull().default(""),
  senderName: text("sender_name").notNull().default("Artistroom"),
  paymentUrl: text("payment_url").notNull().default(""),
  // "link" = own payment link (manual confirmation), "stripe" / "paypal" = checkout with automatic confirmation.
  paymentProvider: text("payment_provider").notNull().default("link"),
  // Default amount (e.g. "15" or "12,50") prefilled when requesting a payment.
  ticketPrice: text("ticket_price").notNull().default(""),
  // Maximum number of tickets (kostenlos + zahlungspflichtig) as a whole number; "" = unlimited.
  maxTickets: text("max_tickets").notNull().default(""),
  // Own mailbox via SMTP; when set it replaces Resend. Password is stored encrypted (enc$v1$…).
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: text("smtp_port").notNull().default("587"),
  smtpSecurity: text("smtp_security").notNull().default("starttls"),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),
  // Stripe / PayPal access (secrets stored encrypted); env vars are the fallback.
  stripeSecretKey: text("stripe_secret_key").notNull().default(""),
  paypalClientId: text("paypal_client_id").notNull().default(""),
  paypalClientSecret: text("paypal_client_secret").notNull().default(""),
  paypalMode: text("paypal_mode").notNull().default("live"),
  // Home page: welcome text under the scroll hint (placeholder {ticketpreis}) and image (mail-images id).
  welcomeText: text("welcome_text").notNull().default(""),
  welcomeImage: text("welcome_image").notNull().default(""),
  // Ticket product for the checkout page (shared/product.ts).
  product: jsonb().$type<Record<string, unknown>>(),
  // Survey builder config (shared/survey.ts) and when the invitation was sent out.
  survey: jsonb().$type<Record<string, unknown>>(),
  surveySentAt: timestamp("survey_sent_at", { withTimezone: true }),
  // Status mail templates + design (shared/mail-template.ts); null = defaults.
  mailTemplates: jsonb("mail_templates").$type<Record<string, unknown>>(),
  // Super-user site config (shared/site.ts): form builder, Impressum/Datenschutz, check-in scan screen; null = defaults.
  formConfig: jsonb("form_config").$type<Record<string, unknown>>(),
  legal: jsonb().$type<Record<string, unknown>>(),
  checkinDesign: jsonb("checkin_design").$type<Record<string, unknown>>(),
});

// Server-generated keys (transport RSA key pair, fallback encryption key, challenge HMAC key).
export const appSecrets = pgTable("app_secrets", {
  name: text().primaryKey(),
  value: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Acting admin; null for public actions (e.g. a new registration).
    username: text(),
    action: text().notNull(),
    // Snapshot of the affected object ("#0001 · Max Muster") so entries stay readable after deletes/resets.
    target: text(),
    details: text(),
    registrationId: integer("registration_id"),
    // Server-only data needed to undo this action (previous state / deleted rows); never sent to the browser.
    // Cleared once undone; entries (and with them this data) are deleted after 3 months.
    undo: jsonb().$type<Record<string, unknown>>(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneBy: text("undone_by"),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt), index("audit_log_action_idx").on(t.action)],
);

export type AuditEntry = typeof auditLog.$inferSelect;

export const surveyResponses = pgTable("survey_responses", {
  id: serial().primaryKey(),
  // Kept even if the registration is deleted later (answers stay anonymous then).
  registrationId: integer("registration_id"),
  token: text().notNull().unique(),
  // JSON of the answers, encrypted (enc$v1$…).
  answers: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
