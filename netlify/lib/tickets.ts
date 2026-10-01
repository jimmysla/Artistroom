import { inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { eventSettings, registrations } from "../../db/schema.js";
import { maxTicketsOf } from "../../shared/event.js";
import { ACCEPTED_STATUSES } from "../../shared/registration.js";

/*
 * Ticket limit (Einstellungen → Tickets): every accepted registration (kostenlos, Zahlung
 * ausstehend, bezahlt) holds one of `maxTickets` places. Once all are taken the registration
 * form shows „Ausverkauft“ and nobody else can be approved.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Queryable = Pick<Tx, "select">;

// Key of the Postgres advisory lock that serialises all approvals (two admins can never
// hand out the last ticket twice). Held until the surrounding transaction ends.
const TICKET_LOCK = 482_017_301;

export const isAccepted = (status: string) => (ACCEPTED_STATUSES as readonly string[]).includes(status);

/** Number of places taken (accepted registrations). */
export async function ticketsTaken(q: Queryable = db): Promise<number> {
  const [{ count }] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .where(inArray(registrations.status, [...ACCEPTED_STATUSES]));
  return count;
}

/** Current limit, taken places and whether the event is sold out. */
export async function ticketAvailability(settings: { maxTickets?: string }, q: Queryable = db) {
  const max = maxTicketsOf({ maxTickets: settings.maxTickets ?? "" });
  if (max == null) return { max, taken: null, soldOut: false };
  const taken = await ticketsTaken(q);
  return { max, taken, soldOut: taken >= max };
}

export class SoldOutError extends Error {
  constructor(public max: number, public taken: number) {
    super(
      `Ausverkauft: ${taken} von ${max} Tickets sind vergeben (kostenlos + zahlungspflichtig) – es kann niemand mehr genehmigt werden. Zuerst unter Einstellungen → Tickets die maximale Ticketanzahl erhöhen oder einen Platz freigeben.`,
    );
  }
}

/** Waits for the ticket lock (released when the transaction ends; re-acquiring is fine). */
export const lockTickets = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(${TICKET_LOCK})`);

/**
 * Inside a transaction: waits for the ticket lock, then checks that `adding` more places fit
 * under the limit (read fresh from the DB). Throws SoldOutError otherwise.
 */
export async function reserveTickets(tx: Tx, adding = 1) {
  if (adding <= 0) return;
  await lockTickets(tx);
  const [row] = await tx.select({ maxTickets: eventSettings.maxTickets }).from(eventSettings).limit(1);
  const { max, taken } = await ticketAvailability(row ?? {}, tx);
  if (max != null && taken! + adding > max) throw new SoldOutError(max, taken!);
}
