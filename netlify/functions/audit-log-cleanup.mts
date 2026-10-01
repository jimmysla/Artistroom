import type { Config } from "@netlify/functions";
import { logAction, pruneAuditLog } from "../lib/audit.js";
import { logError } from "../lib/http.js";
import { rekeyAll } from "../lib/rekey.js";

// Daily: removes log entries older than 3 months (see LOG_RETENTION_DAYS) and re-encrypts old
// data once PASSWORD_ENCRYPTION_KEY is set.
export default async () => {
  try {
    const removed = await pruneAuditLog();
    if (removed) await logAction({ username: null, action: "log_bereinigt", details: `${removed} Log-Eintrag/-Einträge älter als 3 Monate automatisch gelöscht` });
  } catch (err) {
    logError("Audit log cleanup failed", err);
  }
  try {
    const rekeyed = await rekeyAll();
    if (rekeyed) await logAction({ username: null, action: "daten_verschluesselt", details: `${rekeyed} Datensatz/Datensätze mit PASSWORD_ENCRYPTION_KEY neu verschlüsselt` });
  } catch (err) {
    logError("Re-encryption failed", err);
  }
};

export const config: Config = { schedule: "@daily" };
