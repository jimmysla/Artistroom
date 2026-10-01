import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations } from "../../db/schema.js";
import { formatEuro, formatNet, formatRegistrationNumber } from "../../shared/registration.js";
import { getEvent } from "../lib/event.js";
import { error, json, logError, readJson, str, crossSiteError, isCrossSite } from "../lib/http.js";
import { PaymentError, allowedProviders, isPaymentProvider, reconcilePayment, startCheckout } from "../lib/payments.js";
import { normalizeProduct, priceBreakdown } from "../../shared/product.js";
import { openRegistration } from "../lib/pii.js";
import { getTestCheckout, reconcileTestCheckout, startTestCheckout, testProviders } from "../lib/test-checkout.js";

/*
 * Public payment page API (/zahlung?ref=…):
 *   GET  /api/payments/status?ref=  → current state; checks with Stripe/PayPal while pending
 *   POST /api/payments/start {ref}  → URL of a fresh Stripe/PayPal checkout
 * `ref` is a random token per payment request, so nothing else can be looked up.
 */
const REF = /^[0-9a-f-]{36}$/;

/** Cart part of the response: configured product + price split (price always from the system). */
async function cart(amountCents: number | null) {
  const event = await getEvent();
  const product = normalizeProduct("product" in event ? event.product : null);
  const price = amountCents ? priceBreakdown(amountCents, product.vatRate) : null;
  return {
    event: event.name,
    // Requested amount = net; VAT of the product is added on top, total = what gets charged.
    amount: amountCents ? formatNet(amountCents) : null,
    total: price ? formatEuro(price.gross) : null,
    product: {
      name: product.name,
      description: product.description,
      image: product.imageId ? `/api/mail-images/${product.imageId}` : product.imageUrl || null,
      vatRate: product.vatRate,
      net: price ? formatNet(price.net) : null,
      vat: price ? formatEuro(price.vat) : null,
    },
  };
}

export default async (req: Request) => {
  if (isCrossSite(req)) return crossSiteError();
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith("/status") && req.method === "GET") {
      const ref = url.searchParams.get("ref") ?? "";
      if (!REF.test(ref)) return error("Ungültiger Zahlungslink.", 400);
      const [stored] = await db.select().from(registrations).where(eq(registrations.paymentRef, ref));
      if (!stored) {
        // Test purchase from "Warenkorb testen" (no registration behind it).
        const test = await getTestCheckout(ref);
        if (!test) return error("Zahlung nicht gefunden.", 404);
        const t = await reconcileTestCheckout(test).catch((err) => {
          logError("Test payment check failed", err);
          return test;
        });
        return json({ test: true, status: t.status, provider: t.provider, providers: t.status === "zahlung_angefordert" ? await testProviders() : [], ...(await cart(t.amountCents)), number: "TEST", name: `Testkauf von ${t.createdBy}` });
      }
      const row = await openRegistration(stored);
      const status = await reconcilePayment(row).catch((err) => {
        logError("Payment check failed", err);
        return row.status;
      });
      return json({
        test: false,
        status,
        provider: row.paymentProvider,
        providers: status === "zahlung_angefordert" ? await allowedProviders() : [],
        ...(await cart(row.amountCents)),
        number: formatRegistrationNumber(row.id),
        name: row.name,
      });
    }
    if (url.pathname.endsWith("/start") && req.method === "POST") {
      const body = await readJson(req);
      const ref = str(body?.ref);
      const provider = body?.provider;
      if (!REF.test(ref)) return error("Ungültiger Zahlungslink.", 400);
      const [stored] = await db.select().from(registrations).where(eq(registrations.paymentRef, ref));
      if (!stored) {
        const test = await getTestCheckout(ref);
        if (!test) return error("Zahlung nicht gefunden.", 404);
        if (!isPaymentProvider(provider) && provider !== "simulation") return error("Bitte eine Zahlungsart wählen.", 422);
        return json({ url: await startTestCheckout(test, url.origin, provider) });
      }
      if (!isPaymentProvider(provider)) return error("Bitte eine Zahlungsart wählen.", 422);
      const row = await openRegistration(stored);
      return json({ url: await startCheckout(row, url.origin, provider) });
    }
    return error("Nicht gefunden.", 404);
  } catch (err) {
    if (err instanceof PaymentError) return error(err.message, 502);
    logError("Payment request failed", err);
    return error("Die Zahlung ist gerade nicht erreichbar. Bitte später erneut versuchen.", 500);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = { path: ["/api/payments/status", "/api/payments/start"], rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] } };
