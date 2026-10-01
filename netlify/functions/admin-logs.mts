import type { Config, Context } from "@netlify/functions";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLog } from "../../db/schema.js";
import { requireAdmin } from "../lib/auth.js";
import { LOG_RETENTION_DAYS, logAction, openLogText, pruneAuditLog } from "../lib/audit.js";
import { MailError } from "../lib/mail.js";
import { UndoError, checkUndo, undoLogEntry } from "../lib/undo.js";
import { error, json, readJson, logError } from "../lib/http.js";

const MAX_ENTRIES = 1000;
const SEARCH_WINDOW = 10000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Local event day, so "from"/"to" match what admins see in the list.
const berlinDay = sql`(${auditLog.createdAt} at time zone 'Europe/Berlin')::date`;

// Everything the list needs – undo snapshots stay on the server.
const columns = {
  id: auditLog.id,
  createdAt: auditLog.createdAt,
  username: auditLog.username,
  action: auditLog.action,
  target: auditLog.target,
  details: auditLog.details,
  registrationId: auditLog.registrationId,
  undoable: sql<boolean>`(${auditLog.undo} is not null and ${auditLog.undoneAt} is null)`,
  undoneAt: auditLog.undoneAt,
  undoneBy: auditLog.undoneBy,
};

export default async (req: Request, context: Context) => {
  const session = await requireAdmin(req, "logging");
  if (session instanceof Response) return session;

  if (context.params?.id) {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) return error("Ungültige ID.", 400);
    // GET = dry run: tells the dialog up front about conflicts (e.g. person already checked in).
    if (req.method === "GET") {
      try {
        const warning = await checkUndo(id, session);
        return json({ ok: !warning, warning });
      } catch (err) {
        logError("Undo check failed", err);
        return error("Die Prüfung ist fehlgeschlagen.", 500);
      }
    }
    if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);
    try {
      const message = await undoLogEntry(id, session, { notify: (await readJson(req))?.notify === true });
      return json({ ok: true, message });
    } catch (err) {
      if (err instanceof UndoError) return error(err.message, err.status);
      if (err instanceof MailError) return error(`${err.message.replace(" Der Status wurde nicht geändert.", "")} Es wurde nichts rückgängig gemacht.`, 502);
      logError("Undo failed", err);
      return error("Die Aktion konnte nicht rückgängig gemacht werden.", 500);
    }
  }
  if (req.method !== "GET") return error("Methode nicht erlaubt.", 405);

  const p = new URL(req.url).searchParams;
  const where: SQL[] = [];
  const action = p.get("action");
  const user = p.get("user");
  const from = p.get("from");
  const to = p.get("to");
  const q = p.get("q")?.trim().slice(0, 100);
  if (action) where.push(eq(auditLog.action, action));
  // "-" = actions without an admin (public registrations, failed logins).
  if (user) where.push(user === "-" ? isNull(auditLog.username) : eq(auditLog.username, user));
  if (from && DAY_RE.test(from)) where.push(sql`${berlinDay} >= ${from}::date`);
  if (to && DAY_RE.test(to)) where.push(sql`${berlinDay} <= ${to}::date`);
  try {
    // The daily cleanup function also does this; here it keeps the list correct in between.
    const removed = await pruneAuditLog();
    if (removed) await logAction({ username: null, action: "log_bereinigt", details: `${removed} Log-Eintrag/-Einträge älter als 3 Monate automatisch gelöscht` });
    const [entries, users] = await Promise.all([
      // Free-text search runs after decryption, so scan a larger window when searching.
      db.select(columns).from(auditLog).where(and(...where)).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(q ? SEARCH_WINDOW : MAX_ENTRIES + 1),
      db.selectDistinct({ username: auditLog.username }).from(auditLog).orderBy(auditLog.username),
    ]);
    const needle = q?.toLowerCase();
    const opened = (await Promise.all(entries.map(async (e) => ({ ...e, target: await openLogText(e.target), details: await openLogText(e.details) })))).filter(
      (e) => !needle || [e.target, e.details, e.username].some((v) => v?.toLowerCase().includes(needle)),
    );
    return json({
      entries: opened.slice(0, MAX_ENTRIES),
      truncated: opened.length > MAX_ENTRIES || (Boolean(q) && entries.length === SEARCH_WINDOW),
      users: users.map((u) => u.username).filter((u): u is string => Boolean(u)),
      retentionDays: LOG_RETENTION_DAYS,
    });
  } catch (err) {
    logError("Audit log query failed", err);
    return error("Das Protokoll konnte nicht geladen werden.", 500);
  }
};

export const config: Config = { path: ["/api/admin/logs", "/api/admin/logs/:id/undo"] };
