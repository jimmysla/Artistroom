import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLog, registrations } from "../../db/schema.js";
import type { UndoData } from "./undo.js";
import { open, seal } from "./crypto.js";

/** Decrypts target/details of a log row (plain legacy entries pass through). */
export async function openLogText(v: string | null): Promise<string | null> {
  return v ? ((await open(v))?.plain ?? "[nicht entschlüsselbar]") : null;
}
import { logError } from "./http.js";

/** Log entries (incl. their undo snapshots) are kept for 3 months. */
export const LOG_RETENTION_DAYS = 90;

interface Entry {
  username: string | null;
  action: string;
  target?: string | null;
  details?: string | null;
  registrationId?: number | null;
  /** Previous state so the action can be undone from the log (see undo.ts). */
  undo?: UndoData;
}

/** Writes an audit log entry. Never throws – logging must not break the actual action. */
export async function logAction(entry: Entry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      username: entry.username,
      action: entry.action,
      // Targets/details contain names and e-mail addresses → stored encrypted.
      target: entry.target ? await seal(entry.target.slice(0, 300)) : null,
      details: entry.details ? await seal(entry.details.slice(0, 1000)) : null,
      registrationId: entry.registrationId ?? null,
      undo: (entry.undo as Record<string, unknown> | undefined) ?? null,
    });
  } catch (err) {
    logError("Audit log write failed", err);
  }
}

/**
 * Deleted people must vanish from the log completely: removes every entry about the given
 * registration (or, without id, about any registration – used by the reset).
 */
export async function purgeRegistrationLog(id?: number): Promise<number> {
  const removed = await db
    .delete(auditLog)
    .where(id === undefined ? isNotNull(auditLog.registrationId) : eq(auditLog.registrationId, id))
    .returning({ id: auditLog.id });
  return removed.length;
}

/**
 * Deletes log entries older than the retention period, plus leftovers of deleted registrations
 * (entries of registrations that no longer exist and old undo snapshots of deleted rows).
 * Returns the number of entries removed because of their age.
 */
export async function pruneAuditLog(): Promise<number> {
  const removed = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, sql`now() - make_interval(days => ${LOG_RETENTION_DAYS})`))
    .returning({ id: auditLog.id });
  await db
    .delete(auditLog)
    .where(and(isNotNull(auditLog.registrationId), sql`not exists (select 1 from ${registrations} where ${registrations.id} = ${auditLog.registrationId})`));
  await db
    .update(auditLog)
    .set({ undo: null })
    .where(and(isNotNull(auditLog.undo), inArray(sql`${auditLog.undo}->>'kind'`, ["registration_deleted", "all_registrations_deleted"])));
  return removed.length;
}
