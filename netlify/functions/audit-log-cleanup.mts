import type { Config } from "@netlify/functions";
import { logAction, pruneAuditLog } from "../lib/audit.js";
import { logError } from "../lib/http.js";

// Daily: removes log entries older than 3 months (see LOG_RETENTION_DAYS).
export default async () => {
  try {
    const removed = await pruneAuditLog();
    if (removed) await logAction({ username: null, action: "log_bereinigt", details: `${removed} Log-Eintrag/-Einträge älter als 3 Monate automatisch gelöscht` });
  } catch (err) {
    logError("Audit log cleanup failed", err);
  }
};

export const config: Config = { schedule: "@daily" };
