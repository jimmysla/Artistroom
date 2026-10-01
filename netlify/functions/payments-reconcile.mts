import type { Config } from "@netlify/functions";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations } from "../../db/schema.js";
import { logError } from "../lib/http.js";
import { reconcilePayment } from "../lib/payments.js";

// Every 10 minutes: confirms paid Stripe/PayPal checkouts even if the payer closed the page early.
export default async () => {
  const pending = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.status, "zahlung_angefordert"), isNotNull(registrations.paymentCheckout)));
  for (const row of pending) {
    await reconcilePayment(row).catch((err) => logError(`Payment reconcile #${row.id} failed`, err));
  }
};

export const config: Config = { schedule: "*/10 * * * *" };
