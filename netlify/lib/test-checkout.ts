import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { formatNet, parseEuroToCents } from "../../shared/registration.js";
import { logAction } from "./audit.js";
import { getEvent } from "./event.js";
import {
  PAYMENT_PROVIDERS,
  PaymentError,
  createProviderCheckout,
  grossAmount,
  paymentCredentials,
  paymentPageUrl,
  providerConfigured,
  verifyProviderCheckout,
  type PaymentProvider,
} from "./payments.js";

/*
 * Test purchases for the checkout page ("Warenkorb testen" in the settings). They run the real
 * flow – cart → redirect to Stripe/PayPal → loading screen → server-side verification – but are
 * stored in Netlify Blobs instead of a registration, so no ticket, mail or statistic is touched.
 * "simulation" works without any provider keys and confirms after a few seconds.
 * Use Stripe test keys / PayPal sandbox – with live keys a test purchase is a real payment.
 */
export type TestProvider = PaymentProvider | "simulation";

export interface TestCheckout {
  ref: string;
  amountCents: number;
  /** Gross amount charged (net + VAT), fixed when the checkout starts. */
  chargeCents?: number;
  createdBy: string;
  createdAt: string;
  status: "zahlung_angefordert" | "bezahlt";
  provider: TestProvider | null;
  checkout: string | null;
  startedAt: string | null;
}

const store = () => getStore("test-checkouts");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SIMULATION_DELAY_MS = 4000;

export async function getTestCheckout(ref: string): Promise<TestCheckout | null> {
  const t = (await store().get(ref, { type: "json" })) as TestCheckout | null;
  return t && Date.now() - Date.parse(t.createdAt) < MAX_AGE_MS ? t : null;
}

const save = (t: TestCheckout) => store().setJSON(t.ref, t);

/** Providers usable for a test: every configured one, plus the simulation. */
export async function testProviders(): Promise<TestProvider[]> {
  const c = await paymentCredentials();
  return [...PAYMENT_PROVIDERS.filter((p) => providerConfigured(p, c)), "simulation"];
}

export async function createTestCheckout(admin: string, origin: string): Promise<string> {
  const event = await getEvent();
  const t: TestCheckout = {
    ref: randomUUID(),
    amountCents: parseEuroToCents(event.ticketPrice) ?? 100,
    createdBy: admin,
    createdAt: new Date().toISOString(),
    status: "zahlung_angefordert",
    provider: null,
    checkout: null,
    startedAt: null,
  };
  await save(t);
  await logAction({ username: admin, action: "testkauf_gestartet", details: `Test-Warenkorb über ${formatNet(t.amountCents)} erstellt` });
  return paymentPageUrl(origin, t.ref);
}

export async function startTestCheckout(t: TestCheckout, origin: string, provider: TestProvider): Promise<string> {
  if (t.status !== "zahlung_angefordert") throw new PaymentError("Dieser Testkauf ist bereits bezahlt.");
  if (!(await testProviders()).includes(provider)) throw new PaymentError("Diese Zahlungsart ist nicht eingerichtet.");
  const back = paymentPageUrl(origin, t.ref);
  if (provider === "simulation") {
    await save({ ...t, provider, checkout: "simulation", startedAt: new Date().toISOString() });
    return `${back}&zurueck=1`;
  }
  const event = await getEvent();
  const chargeCents = await grossAmount(t.amountCents);
  const { id, url } = await createProviderCheckout(await paymentCredentials(event), provider, {
    reference: `test-${t.ref.slice(0, 8)}`,
    amountCents: chargeCents,
    description: `TEST – ${event.name} Ticket`,
    back,
  });
  await save({ ...t, provider, checkout: id, chargeCents, startedAt: new Date().toISOString() });
  return url;
}

/** Verifies a test purchase exactly like a real one (simulation: confirmed after a short delay). */
export async function reconcileTestCheckout(t: TestCheckout): Promise<TestCheckout> {
  if (t.status !== "zahlung_angefordert" || !t.provider || !t.checkout || !t.startedAt) return t;
  const paid =
    t.provider === "simulation"
      ? Date.now() - Date.parse(t.startedAt) >= SIMULATION_DELAY_MS
      : await verifyProviderCheckout(await paymentCredentials(), t.provider, t.checkout, t.chargeCents ?? t.amountCents, `test-${t.ref.slice(0, 8)}`);
  if (!paid) return t;
  const done: TestCheckout = { ...t, status: "bezahlt" };
  await save(done);
  await logAction({ username: t.createdBy, action: "testkauf_bestaetigt", details: `Testkauf per ${t.provider === "simulation" ? "Simulation" : t.provider === "stripe" ? "Stripe" : "PayPal"} serverseitig bestätigt (${t.checkout}) – kein Ticket verschickt` });
  return done;
}
