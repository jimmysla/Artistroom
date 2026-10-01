import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLog, eventSettings, registrations, surveyResponses } from "../../db/schema.js";
import { encryptionSource, isSealed, open, seal } from "./crypto.js";
import { PII_FIELDS } from "./pii.js";

/*
 * Once PASSWORD_ENCRYPTION_KEY is set, values sealed earlier with the database key are
 * re-encrypted with it – otherwise the old data would stay readable with the database alone.
 * Every update only applies if the value is still unchanged, so concurrent writes win.
 * Password hashes are handled on the next login (`resealHashes` in auth.ts), so nobody is
 * logged out by this.
 */

/** New sealed value if `v` is sealed with an older key, otherwise undefined. */
async function reseal(v: unknown): Promise<string | undefined> {
  if (!isSealed(v)) return undefined;
  const opened = await open(v);
  return opened && !opened.current ? seal(opened.plain) : undefined;
}

/** Re-seals every sealed string inside a JSON value (undo snapshots). */
async function resealDeep(v: unknown): Promise<{ value: unknown; changed: boolean }> {
  if (typeof v === "string") {
    const next = await reseal(v);
    return next ? { value: next, changed: true } : { value: v, changed: false };
  }
  if (!v || typeof v !== "object") return { value: v, changed: false };
  let changed = false;
  const resealAll = async (items: unknown[]) => {
    const out: unknown[] = [];
    for (const x of items) {
      const r = await resealDeep(x);
      out.push(r.value);
      changed ||= r.changed;
    }
    return out;
  };
  const value = Array.isArray(v)
    ? await resealAll(v)
    : Object.fromEntries((await resealAll(Object.values(v))).map((x, i) => [Object.keys(v)[i], x]));
  return { value, changed };
}

// Per function instance: after one complete pass everything new is sealed with the env key anyway.
let finished = false;

/** Re-encrypts all stored values with PASSWORD_ENCRYPTION_KEY. Returns the number of updated rows. */
export async function rekeyAll(): Promise<number> {
  if (finished || (await encryptionSource()) !== "env") return 0;
  let count = 0;

  for (const row of await db.select().from(registrations)) {
    const set: Record<string, string> = {};
    const where: SQL[] = [eq(registrations.id, row.id)];
    for (const f of PII_FIELDS) {
      const next = await reseal(row[f]);
      if (next) {
        set[f] = next;
        where.push(eq(registrations[f], row[f] as string));
      }
    }
    if (Object.keys(set).length && (await db.update(registrations).set(set).where(and(...where)).returning({ id: registrations.id })).length) count++;
  }

  for (const row of await db.select({ id: auditLog.id, target: auditLog.target, details: auditLog.details, undo: auditLog.undo }).from(auditLog)) {
    const target = await reseal(row.target);
    const details = await reseal(row.details);
    const undo = await resealDeep(row.undo);
    if (!target && !details && !undo.changed) continue;
    await db
      .update(auditLog)
      .set({ ...(target ? { target } : {}), ...(details ? { details } : {}) })
      .where(eq(auditLog.id, row.id));
    // Never write a snapshot back onto an entry that was undone meanwhile.
    if (undo.changed) await db.update(auditLog).set({ undo: undo.value as Record<string, unknown> }).where(and(eq(auditLog.id, row.id), isNull(auditLog.undoneAt)));
    count++;
  }

  const [settings] = await db.select().from(eventSettings).where(eq(eventSettings.id, 1));
  if (settings) {
    for (const key of ["smtpPassword", "stripeSecretKey", "paypalClientSecret"] as const) {
      const next = await reseal(settings[key]);
      if (next && (await db.update(eventSettings).set({ [key]: next }).where(and(eq(eventSettings.id, 1), eq(eventSettings[key], settings[key]))).returning({ id: eventSettings.id })).length) count++;
    }
  }

  for (const row of await db.select({ id: surveyResponses.id, answers: surveyResponses.answers }).from(surveyResponses)) {
    const next = await reseal(row.answers);
    if (next && (await db.update(surveyResponses).set({ answers: next }).where(and(eq(surveyResponses.id, row.id), eq(surveyResponses.answers, row.answers))).returning({ id: surveyResponses.id })).length) count++;
  }

  finished = true;
  return count;
}
