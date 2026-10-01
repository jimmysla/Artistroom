import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, type Registration } from "../../db/schema.js";
import { formatEuro, formatNet, formatRegistrationNumber } from "../../shared/registration.js";
import { normalizeProduct, priceBreakdown } from "../../shared/product.js";
import { logAction } from "./audit.js";
import { getEvent } from "./event.js";
import { logError } from "./http.js";
import { sendStatusMail } from "./mail.js";
import { open } from "./crypto.js";
import { openRegistration } from "./pii.js";

/*
 * Online payment with automatic, server-side confirmation (Stripe Checkout / PayPal Orders v2).
 * The payment mail links to our own page /zahlung?ref=<paymentRef>; each click there creates a
 * fresh checkout (Stripe sessions expire after 24 h). Confirmation never trusts the browser:
 * the server asks Stripe/PayPal for the status and checks amount, currency and registration id.
 * Pending payments are reconciled by the payment page (polling) and a scheduled function.
 *
 * Credentials: settings (Einstellungen → Zahlung, secrets encrypted) or env STRIPE_SECRET_KEY ·
 * PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (+ PAYPAL_MODE=sandbox).
 */
export const PAYMENT_PROVIDERS = ["stripe", "paypal"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const isPaymentProvider = (v: unknown): v is PaymentProvider => (PAYMENT_PROVIDERS as readonly unknown[]).includes(v);

export class PaymentError extends Error {}

const env = (k: string) => Netlify.env.get(k);

export interface PaymentCredentials {
  stripeKey?: string;
  paypalId?: string;
  paypalSecret?: string;
  paypalSandbox: boolean;
}

type CredentialSettings = { stripeSecretKey?: string; paypalClientId?: string; paypalClientSecret?: string; paypalMode?: string };

/**
 * Stripe/PayPal access from the settings (secrets stored encrypted), falling back to the
 * env vars STRIPE_SECRET_KEY / PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_MODE.
 */
export async function paymentCredentials(settings?: CredentialSettings): Promise<PaymentCredentials> {
  const s = settings ?? ((await getEvent()) as CredentialSettings);
  const dec = async (v?: string) => (v ? (await open(v))?.plain : undefined);
  return {
    stripeKey: (await dec(s.stripeSecretKey)) || env("STRIPE_SECRET_KEY"),
    paypalId: s.paypalClientId || env("PAYPAL_CLIENT_ID"),
    paypalSecret: (await dec(s.paypalClientSecret)) || env("PAYPAL_CLIENT_SECRET"),
    paypalSandbox: s.paypalClientId ? s.paypalMode === "sandbox" : env("PAYPAL_MODE") === "sandbox",
  };
}

export const providerConfigured = (p: PaymentProvider, c: PaymentCredentials) => (p === "stripe" ? Boolean(c.stripeKey) : Boolean(c.paypalId && c.paypalSecret));

/** Checks the credentials against the provider (used by "Verbindung testen"). */
export async function testProvider(p: PaymentProvider, c: PaymentCredentials): Promise<string> {
  if (!providerConfigured(p, c)) throw new PaymentError(`${p === "stripe" ? "Stripe" : "PayPal"}: keine Zugangsdaten hinterlegt.`);
  if (p === "stripe") {
    await stripe(c, "balance");
    return c.stripeKey!.startsWith("sk_test_") ? "Stripe verbunden (Testmodus)." : "Stripe verbunden (Live).";
  }
  await paypalToken(c);
  return c.paypalSandbox ? "PayPal verbunden (Sandbox)." : "PayPal verbunden (Live).";
}

export const paymentPageUrl = (origin: string, ref: string) => `${origin}/zahlung?ref=${encodeURIComponent(ref)}`;

// ---------- Stripe ----------
async function stripe<T>(c: PaymentCredentials, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? (init.form ? "POST" : "GET"),
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${c.stripeKey}`, ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: init.form ? new URLSearchParams(init.form) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new PaymentError(`Stripe: ${data.error?.message ?? `Fehler ${res.status}`}`);
  return data;
}

interface StripeSession {
  id: string;
  url: string | null;
  payment_status: string;
  status: string;
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
}

// ---------- PayPal ----------
const paypalBase = (c: PaymentCredentials) => (c.paypalSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");

async function paypalToken(c: PaymentCredentials): Promise<string> {
  const auth = Buffer.from(`${c.paypalId}:${c.paypalSecret}`).toString("base64");
  const tokenRes = await fetch(`${paypalBase(c)}/v1/oauth2/token`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new PaymentError("PayPal: Anmeldung fehlgeschlagen – bitte Client-ID, Secret und Live/Sandbox prüfen.");
  return ((await tokenRes.json()) as { access_token: string }).access_token;
}

async function paypal<T>(c: PaymentCredentials, path: string, body?: unknown): Promise<T> {
  const access_token = await paypalToken(c);
  const res = await fetch(`${paypalBase(c)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; details?: { issue?: string }[] };
  if (!res.ok && !(data.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED")) throw new PaymentError(`PayPal: ${data.details?.[0]?.issue ?? data.message ?? `Fehler ${res.status}`}`);
  return data;
}

interface PaypalOrder {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; amount?: { value: string; currency_code: string }; payments?: { captures?: { status: string; amount: { value: string; currency_code: string } }[] } }[];
}

const euros = (cents: number) => (cents / 100).toFixed(2);

/** Gross amount to charge: net price + VAT of the configured checkout product. */
export async function grossAmount(netCents: number): Promise<number> {
  const event = await getEvent();
  return priceBreakdown(netCents, normalizeProduct("product" in event ? event.product : null).vatRate).gross;
}

/** Providers the payer may choose on the checkout page (always all configured ones). */
export async function allowedProviders(): Promise<PaymentProvider[]> {
  const event = await getEvent();
  const c = await paymentCredentials(event);
  // The payer always chooses among every configured provider (old fixed "stripe"/"paypal" settings are ignored).
  return PAYMENT_PROVIDERS.filter((p) => providerConfigured(p, c));
}

interface CheckoutRequest {
  /** Our reference that the provider echoes back (registration id or "test-…"); verified on confirmation. */
  reference: string;
  amountCents: number;
  description: string;
  /** Payment page to return to (success → &zurueck=1, cancel → &abgebrochen=1). */
  back: string;
  email?: string;
}

/** Creates a Stripe Checkout session / PayPal order and returns its id and the redirect URL. */
export async function createProviderCheckout(c: PaymentCredentials, provider: PaymentProvider, r: CheckoutRequest): Promise<{ id: string; url: string }> {
  const event = await getEvent();
  let id: string;
  let url: string | undefined;
  if (provider === "stripe") {
    const s = await stripe<StripeSession>(c, "checkout/sessions", {
      form: {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": String(r.amountCents),
        "line_items[0][price_data][product_data][name]": r.description,
        ...(r.email ? { customer_email: r.email } : {}),
        client_reference_id: r.reference,
        "metadata[reference]": r.reference,
        locale: "de",
        success_url: `${r.back}&zurueck=1`,
        cancel_url: `${r.back}&abgebrochen=1`,
      },
    });
    id = s.id;
    url = s.url ?? undefined;
  } else {
    const o = await paypal<PaypalOrder>(c, "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: r.reference.slice(0, 256), custom_id: r.reference, description: r.description.slice(0, 127), amount: { currency_code: "EUR", value: euros(r.amountCents) } }],
      payment_source: { paypal: { experience_context: { brand_name: event.name.slice(0, 127), locale: "de-DE", user_action: "PAY_NOW", return_url: `${r.back}&zurueck=1`, cancel_url: `${r.back}&abgebrochen=1` } } },
    });
    id = o.id;
    url = o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  }
  if (!url) throw new PaymentError("Der Zahlungsanbieter hat keinen Bezahl-Link geliefert.");
  return { id, url };
}

/** Server-side verification: paid, amount, currency and our reference must match (PayPal: captures first). */
export async function verifyProviderCheckout(c: PaymentCredentials, provider: PaymentProvider, checkoutId: string, amountCents: number, reference: string): Promise<boolean> {
  if (!providerConfigured(provider, c)) return false;
  if (provider === "stripe") {
    const s = await stripe<StripeSession>(c, `checkout/sessions/${encodeURIComponent(checkoutId)}`);
    return s.payment_status === "paid" && s.amount_total === amountCents && s.currency === "eur" && s.client_reference_id === reference;
  }
  let o = await paypal<PaypalOrder>(c, `/v2/checkout/orders/${encodeURIComponent(checkoutId)}`);
  if (o.status === "APPROVED") o = await paypal<PaypalOrder>(c, `/v2/checkout/orders/${encodeURIComponent(checkoutId)}/capture`, {});
  const unit = o.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return o.status === "COMPLETED" && unit?.custom_id === reference && capture?.status === "COMPLETED" && capture.amount.currency_code === "EUR" && capture.amount.value === euros(amountCents);
}

/** Creates a fresh checkout for a pending payment and returns the URL to redirect the payer to. */
export async function startCheckout(row: Registration, origin: string, chosen: PaymentProvider): Promise<string> {
  if (row.status !== "zahlung_angefordert" || !row.amountCents || !row.paymentProvider || !row.paymentRef) throw new PaymentError("Für diese Anmeldung ist keine Zahlung offen.");
  if (!(await allowedProviders()).includes(chosen)) throw new PaymentError("Diese Zahlungsart ist gerade nicht verfügbar. Bitte eine andere wählen oder das Team kontaktieren.");
  const event = await getEvent();
  // The requested amount is net; VAT from the checkout product is added on top.
  const charge = await grossAmount(row.amountCents);
  const { id, url } = await createProviderCheckout(await paymentCredentials(event), chosen, {
    reference: String(row.id),
    amountCents: charge,
    description: `${event.name} – Ticket ${formatRegistrationNumber(row.id)}`,
    back: paymentPageUrl(origin, row.paymentRef),
    email: row.email,
  });
  // Only the latest checkout counts; the chosen provider is the one verified later.
  await db.update(registrations).set({ paymentCheckout: id, paymentProvider: chosen, paymentAmountCents: charge }).where(and(eq(registrations.id, row.id), eq(registrations.status, "zahlung_angefordert")));
  await logAction({ username: null, action: "zahlung_gestartet", target: `${formatRegistrationNumber(row.id)} · ${row.name}`, details: `${formatNet(row.amountCents)} → ${formatEuro(charge)} gesamt · ${chosen === "stripe" ? "Stripe" : "PayPal"} (${id})`, registrationId: row.id });
  return url;
}

/** Asks the provider whether the current checkout is paid (and captures approved PayPal orders). */
export async function isPaid(row: Registration, credentials?: PaymentCredentials): Promise<boolean> {
  if (!row.paymentCheckout || !row.amountCents || !isPaymentProvider(row.paymentProvider)) return false;
  const c = credentials ?? (await paymentCredentials());
  return verifyProviderCheckout(c, row.paymentProvider, row.paymentCheckout, row.paymentAmountCents ?? row.amountCents, String(row.id));
}

/**
 * Checks a pending payment and, if the provider confirms it, marks the registration as paid
 * (exactly once) and sends the ticket mail. Returns the current status.
 */
export async function reconcilePayment(row: Registration): Promise<string> {
  if (row.status !== "zahlung_angefordert") return row.status;
  if (!(await isPaid(row))) return row.status;
  const [paidRow] = await db
    .update(registrations)
    .set({ status: "bezahlt", revision: row.revision + 1 })
    .where(and(eq(registrations.id, row.id), eq(registrations.status, "zahlung_angefordert"), eq(registrations.revision, row.revision)))
    .returning();
  if (!paidRow) return "bezahlt";
  const paid = await openRegistration(paidRow);
  const provider = row.paymentProvider === "stripe" ? "Stripe" : "PayPal";
  await logAction({
    username: null,
    action: "zahlung_bestaetigt",
    target: `${formatRegistrationNumber(paid.id)} · ${paid.name}`,
    details: `${formatEuro(row.paymentAmountCents ?? paid.amountCents!)} gesamt (${formatNet(paid.amountCents!)}) per ${provider} bestätigt (${row.paymentCheckout})`,
    registrationId: paid.id,
    undo: { kind: "status", id: paid.id, revision: paid.revision, before: { status: "zahlung_angefordert", amountCents: paid.amountCents } },
  });
  try {
    await sendStatusMail(paid, await getEvent());
    await db.update(registrations).set({ emailSentAt: new Date() }).where(eq(registrations.id, paid.id));
  } catch (err) {
    // The payment stays confirmed; the team sees the failed mail in the log.
    logError("Ticket mail after payment failed", err);
    await logAction({ username: null, action: "status_fehlgeschlagen", target: `${formatRegistrationNumber(paid.id)} · ${paid.name}`, details: `Bezahlt, aber Ticket-E-Mail fehlgeschlagen: ${(err as Error).message}`, registrationId: paid.id });
  }
  return "bezahlt";
}
