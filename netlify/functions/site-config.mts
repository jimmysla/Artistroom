import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { eventSettings } from "../../db/schema.js";
import { DEFAULT_EVENT } from "../../shared/event.js";
import { LEGAL_PAGES, normalizeCheckin, normalizeForm, normalizeLegal, validateForm, type LegalPage } from "../../shared/site.js";
import { requireAdmin } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { getEvent } from "../lib/event.js";
import { error, json, logError, readJson } from "../lib/http.js";

/*
 * Site configuration (Dashboard → Gestaltung): form builder, Impressum / Datenschutz and the
 * check-in scan screen. Public: GET /api/legal/:page. Admin: GET (any admin – the check-in tab
 * needs the scan design), PUT super users only.
 */
const SECTIONS = {
  formConfig: { label: "Anmeldeformular", normalize: normalizeForm },
  legal: { label: "Impressum & Datenschutz", normalize: normalizeLegal },
  checkinDesign: { label: "Check-in-Bildschirm", normalize: normalizeCheckin },
} as const;
type Section = keyof typeof SECTIONS;

const stored = (s: object, key: Section) => (key in s ? ((s as Record<string, unknown>)[key] ?? null) : null) as Record<string, unknown> | null;
const forAdmin = (s: object) => ({
  form: normalizeForm(stored(s, "formConfig")),
  legal: normalizeLegal(stored(s, "legal")),
  checkin: normalizeCheckin(stored(s, "checkinDesign")),
});

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  try {
    if (path.startsWith("/api/legal/")) {
      if (req.method !== "GET") return error("Methode nicht erlaubt.", 405);
      const page = path.split("/").pop() as LegalPage;
      if (!(page in LEGAL_PAGES)) return error("Nicht gefunden.", 404);
      const s = await getEvent();
      return json({ title: LEGAL_PAGES[page], text: normalizeLegal(stored(s, "legal"))[page], event: s.name });
    }

    const session = await requireAdmin(req, ...(req.method === "GET" ? [] : (["super"] as const)));
    if (session instanceof Response) return session;
    if (req.method === "GET") return json(forAdmin(await getEvent()));
    if (req.method !== "PUT") return error("Methode nicht erlaubt.", 405);

    const body = await readJson(req);
    if (!body) return error("Ungültige Anfrage.", 400);
    const before = await getEvent();
    const values: Partial<Record<Section, Record<string, unknown>>> = {};
    const previous: Partial<Record<Section, Record<string, unknown> | null>> = {};
    const changes: string[] = [];
    const incoming: Record<Section, unknown> = { formConfig: body.form, legal: body.legal, checkinDesign: body.checkin };
    for (const key of Object.keys(SECTIONS) as Section[]) {
      if (incoming[key] === undefined) continue;
      const next = SECTIONS[key].normalize(incoming[key]);
      if (key === "formConfig") {
        const problem = validateForm(next as ReturnType<typeof normalizeForm>);
        if (problem) return error(problem, 422);
      }
      if (JSON.stringify(next) === JSON.stringify(SECTIONS[key].normalize(stored(before, key)))) continue;
      values[key] = next as unknown as Record<string, unknown>;
      previous[key] = stored(before, key);
      changes.push(`${SECTIONS[key].label} geändert`);
    }
    if (!changes.length) return json(forAdmin(before));

    // Defaults only matter on the very first save (settings row doesn't exist yet).
    await db.insert(eventSettings).values({ id: 1, ...DEFAULT_EVENT, ...values }).onConflictDoUpdate({ target: eventSettings.id, set: values });
    await logAction({ username: session.username, action: "gestaltung_geaendert", details: changes.join("; "), undo: { kind: "settings", before: previous } });
    return json(forAdmin(await getEvent()));
  } catch (err) {
    logError("Site config error", err);
    return error("Die Gestaltung konnte nicht geladen oder gespeichert werden.", 500);
  }
};

export const config: Config = {
  path: ["/api/admin/site", "/api/legal/:page"],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
