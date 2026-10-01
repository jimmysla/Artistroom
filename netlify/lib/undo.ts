import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminUsers, auditLog, eventSettings, registrations, type AdminUser, type Registration } from "../../db/schema.js";
import { can, logActionLabel, type AdminIdentity, type Permission } from "../../shared/admin.js";
import type { EventSettings } from "../../shared/event.js";
import { formatNet, formatRegistrationNumber, statusLabel } from "../../shared/registration.js";
import { logAction } from "./audit.js";
import { openRegistration } from "./pii.js";
import { getEvent } from "./event.js";
import { sendStatusMail } from "./mail.js";

/*
 * Undo data stored with an audit log entry (server-only, never sent to the browser).
 * Each kind restores exactly the state before that one action.
 */
export type UndoData =
  | { kind: "status"; id: number; revision: number; before: { status: string; amountCents: number | null } }
  | { kind: "checkin"; id: number }
  | { kind: "user_created"; id: number }
  | { kind: "user_changed"; id: number; before: Partial<Pick<AdminUser, "permissions" | "isSuper" | "active" | "passwordHash">> }
  | { kind: "user_deleted"; row: AdminUser }
  | { kind: "registration_form"; before: Record<string, unknown> | null }
  | { kind: "settings"; before: Partial<EventSettings> & { mailTemplates?: Record<string, unknown> | null; survey?: Record<string, unknown> | null; product?: Record<string, unknown> | null } };

/** Permission needed to undo each kind (on top of "logging"). */
const PERMISSION: Record<UndoData["kind"], Permission | "super"> = {
  status: "status",
  checkin: "checkin",
  user_created: "super",
  user_changed: "super",
  user_deleted: "super",
  settings: "einstellungen",
  registration_form: "super",
};

/** Expected failure with a German message for the admin (HTTP status included). */
export class UndoError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

// JSON snapshots store timestamps as strings; turn them back into a Date for inserts.
const reviveUser = (u: AdminUser): AdminUser => ({ ...u, createdAt: new Date(u.createdAt) });

const berlinTime = (d: Date | string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const target = (r: Pick<Registration, "id" | "name">) => `${formatRegistrationNumber(r.id)} · ${r.name}`;
const statusText = (status: string, amountCents: number | null) =>
  statusLabel(status) + (amountCents != null && ["zahlung_angefordert", "bezahlt"].includes(status) ? ` · ${formatNet(amountCents)}` : "");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const activeSupers = async (tx: Tx) => {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(eq(adminUsers.isSuper, true), eq(adminUsers.active, true)));
  return count;
};

/**
 * Undoes one logged action. Everything (claiming the entry + restoring) runs in one
 * transaction, so an entry is undone at most once and failures leave nothing half-done.
 * Returns a short German confirmation.
 */
// Thrown at the end of a dry run to roll the transaction back.
class DryRun extends Error {}

/**
 * Checks whether an entry can be undone right now without changing anything (the undo runs
 * in a transaction that is rolled back). Returns null if fine, otherwise the conflict warning.
 */
export async function checkUndo(logId: number, admin: AdminIdentity): Promise<string | null> {
  try {
    await undoLogEntry(logId, admin, { dryRun: true });
    return null;
  } catch (err) {
    if (err instanceof UndoError) return err.message;
    throw err;
  }
}

export async function undoLogEntry(logId: number, admin: AdminIdentity, options: { notify?: boolean; dryRun?: boolean } = {}): Promise<string> {
  const [entry] = await db.select().from(auditLog).where(eq(auditLog.id, logId));
  if (!entry) throw new UndoError("Logeintrag nicht gefunden.", 404);
  if (entry.undoneAt) throw new UndoError(`Diese Aktion wurde bereits von ${entry.undoneBy ?? "jemandem"} rückgängig gemacht.`);
  const undo = entry.undo as UndoData | null;
  if (!undo) throw new UndoError("Diese Aktion kann nicht rückgängig gemacht werden.", 422);
  // Deleted registrations can't be restored (they are erased from the log entirely).
  if (!(undo.kind in PERMISSION)) throw new UndoError("Diese Aktion kann nicht rückgängig gemacht werden.", 422);
  const permission = PERMISSION[undo.kind];
  if (permission === "super" ? !admin.isSuper : !can(admin, permission)) throw new UndoError("Dafür fehlt dir die Berechtigung.", 403);

  const data = undo;
  let result: { target: string | null; registrationId: number | null; details: string; message: string };
  try {
    result = await db.transaction(async (tx) => {
      const r = await perform(tx, data);
      if (options.dryRun) throw new DryRun();
      return r;
    });
  } catch (err) {
    if (err instanceof DryRun) return "ok";
    throw err;
  }

  async function perform(tx: Tx, undo: UndoData) {
    // Claim the entry first; a concurrent undo of the same entry finds nothing to claim.
    const [claimed] = await tx
      .update(auditLog)
      .set({ undoneAt: new Date(), undoneBy: admin.username, undo: null })
      .where(and(eq(auditLog.id, logId), isNull(auditLog.undoneAt), isNotNull(auditLog.undo)))
      .returning({ id: auditLog.id });
    if (!claimed) throw new UndoError("Diese Aktion wurde bereits rückgängig gemacht.");

    switch (undo.kind) {
      case "status": {
        const [locked] = await tx.select().from(registrations).where(eq(registrations.id, undo.id)).for("update");
        const row = locked && (await openRegistration(locked));
        if (!row) throw new UndoError("Die Anmeldung existiert nicht mehr.");
        if (row.revision !== undo.revision) throw new UndoError("Die Anmeldung wurde seitdem erneut geändert. Bitte zuerst die neuere Aktion rückgängig machen.");
        if (row.checkedInAt) throw new UndoError(`Konflikt: ${target(row)} ist bereits eingecheckt (seit ${berlinTime(row.checkedInAt)} Uhr). Zuerst den Check-in rückgängig machen.`);
        const next = { ...row, status: undo.before.status, amountCents: undo.before.amountCents, revision: row.revision + 1 };
        if (options.notify && !options.dryRun) await sendStatusMail(next, await getEvent());
        const [updatedRow] = await tx
          .update(registrations)
          .set({ status: next.status, amountCents: next.amountCents, revision: next.revision, ...(options.notify ? { emailSentAt: new Date() } : {}) })
          .where(eq(registrations.id, row.id))
          .returning();
        const updated = await openRegistration(updatedRow);
        return {
          target: target(updated),
          registrationId: updated.id,
          details: `Status ${statusText(row.status, row.amountCents)} → ${statusText(updated.status, updated.amountCents)}${options.notify ? ` · E-Mail an ${updated.email}` : " · ohne E-Mail"}`,
          message: `Status von ${target(updated)} auf „${statusLabel(updated.status)}“ zurückgesetzt.`,
        };
      }
      case "checkin": {
        const [row] = await tx.update(registrations).set({ checkedInAt: null }).where(and(eq(registrations.id, undo.id), isNotNull(registrations.checkedInAt))).returning();
        if (!row) throw new UndoError("Die Anmeldung existiert nicht mehr oder ist nicht eingecheckt.");
        const shown = target(await openRegistration(row));
        return { target: shown, registrationId: row.id, details: "Check-in zurückgenommen", message: `Check-in von ${shown} zurückgenommen.` };
      }
      case "user_created": {
        const [user] = await tx.select().from(adminUsers).where(eq(adminUsers.id, undo.id));
        if (!user) throw new UndoError("Das Konto existiert nicht mehr.");
        if (user.username === admin.username) throw new UndoError("Du kannst dein eigenes Konto nicht entfernen.");
        await tx.delete(adminUsers).where(eq(adminUsers.id, user.id));
        if ((await activeSupers(tx)) === 0) throw new UndoError("Mindestens ein aktiver Super User muss bestehen bleiben.");
        return { target: user.username, registrationId: null, details: "Erstelltes Konto wieder entfernt", message: `Konto „${user.username}“ entfernt.` };
      }
      case "user_changed": {
        const [user] = await tx
          .update(adminUsers)
          .set(undo.before)
          .where(eq(adminUsers.id, undo.id))
          .returning();
        if (!user) throw new UndoError("Das Konto existiert nicht mehr.");
        if ((await activeSupers(tx)) === 0) throw new UndoError("Mindestens ein aktiver Super User muss bestehen bleiben.");
        if (user.username === admin.username && undo.before.active === false) throw new UndoError("Du kannst dein eigenes Konto nicht deaktivieren.");
        return { target: user.username, registrationId: null, details: "Kontoänderung zurückgenommen", message: `Änderung an „${user.username}“ zurückgenommen.` };
      }
      case "user_deleted": {
        const row = reviveUser(undo.row);
        const [taken] = await tx
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(sql`lower(${adminUsers.username}) = ${row.username.toLowerCase()} or ${adminUsers.id} = ${row.id}`);
        if (taken) throw new UndoError(`Der Benutzername „${row.username}“ ist inzwischen neu vergeben.`);
        await tx.insert(adminUsers).values(row);
        await tx.execute(sql`select setval(pg_get_serial_sequence('admin_users', 'id'), greatest((select max(id) from admin_users), (select last_value from admin_users_id_seq)))`);
        return { target: row.username, registrationId: null, details: "Gelöschtes Konto wiederhergestellt", message: `Konto „${row.username}“ wiederhergestellt.` };
      }
      case "registration_form": {
        await tx.update(eventSettings).set({ registrationForm: undo.before }).where(eq(eventSettings.id, 1));
        return { target: null, registrationId: null, details: "Anmeldeformular auf den vorherigen Stand zurückgesetzt", message: "Anmeldeformular zurückgesetzt – die Anmeldeseite zeigt wieder die vorherigen Kategorien und Felder." };
      }
      case "settings": {
        await tx.update(eventSettings).set(undo.before).where(eq(eventSettings.id, 1));
        const fields = Object.keys(undo.before).length;
        return { target: null, registrationId: null, details: `${fields} Einstellung(en) auf den vorherigen Wert zurückgesetzt`, message: "Einstellungen zurückgesetzt – die Webseite zeigt die vorherigen Angaben." };
      }
    }
  }

  await logAction({
    username: admin.username,
    action: "aktion_rueckgaengig",
    target: result.target,
    registrationId: result.registrationId,
    details: `„${logActionLabel(entry.action)}“ vom ${entry.createdAt.toISOString().slice(0, 10)} rückgängig gemacht · ${result.details}`,
  });
  return result.message;
}
