import type { Config } from "@netlify/functions";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, type Registration } from "../../db/schema.js";
import { categoryLabel, formatRegistrationNumber, statusLabel } from "../../shared/registration.js";
import { requireAdmin } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { openRegistration } from "../lib/pii.js";
import type { UndoData } from "../lib/undo.js";
import { error, json, readJson } from "../lib/http.js";
// Rows are stored with encrypted personal data – decrypt before showing or logging.
const first = async (q: Promise<Registration[]>) => {
  const [row] = await q;
  return row ? openRegistration(row) : undefined;
};
const target = (r: Registration) => `${formatRegistrationNumber(r.id)} · ${r.name}`;
export default async (req: Request) => {
  const session = await requireAdmin(req, "checkin");
  if (session instanceof Response) return session;
  const log = (action: string, r: Registration | null, details: string, undo?: UndoData) =>
    logAction({ username: session.username, action, target: r ? target(r) : null, details, registrationId: r?.id, undo });
  try {
    if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);
    const body = await readJson(req);
    if (typeof body?.ticket !== "string" || !/^artistroom:[0-9a-f-]{36}$/.test(body.ticket)) {
      await log("qr_ungueltig", null, "Kein gültiges Artistroom-Ticket");
      return error("Kein gültiges Artistroom-Ticket.", 422);
    }
    const token = body.ticket.slice(11);
    const found = await first(db.select().from(registrations).where(eq(registrations.ticketToken, token)));
    if (!found) {
      await log("qr_ungueltig", null, "Ticket nicht gefunden");
      return error("Ticket nicht gefunden.", 404);
    }
    if (!["kostenlos", "bezahlt"].includes(found.status)) {
      await log("qr_ungueltig", found, `Nicht freigegeben (Status: ${statusLabel(found.status)})`);
      return error("Dieses Ticket ist nicht für den Einlass freigegeben.", 409);
    }
    if (body.confirm !== true) {
      await log("qr_gescannt", found, `${categoryLabel(found.category)} · ${found.checkedInAt ? "bereits eingecheckt" : "noch nicht eingecheckt"}`);
      return json({ registration: found, alreadyCheckedIn: Boolean(found.checkedInAt) });
    }
    const updated = await first(db.update(registrations).set({ checkedInAt: new Date() }).where(and(eq(registrations.ticketToken, token), isNull(registrations.checkedInAt), inArray(registrations.status, ["kostenlos", "bezahlt"]))).returning());
    if (updated) {
      await log("checkin_bestaetigt", updated, categoryLabel(updated.category), { kind: "checkin", id: updated.id });
      return json({ registration: updated, alreadyCheckedIn: false });
    }
    const current = await first(db.select().from(registrations).where(eq(registrations.ticketToken, token)));
    if (!current || !["kostenlos", "bezahlt"].includes(current.status)) return error("Ticket ist nicht mehr freigegeben.", 409);
    return json({ registration: current, alreadyCheckedIn: true });
  } catch { return error("Check-in konnte nicht verarbeitet werden.", 500); }
};
export const config: Config = { path: "/api/admin/checkin" };
