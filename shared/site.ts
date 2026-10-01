// Site configuration edited by super users (Dashboard → Gestaltung), shared by browser and functions:
// registration form builder ("Baukasten"), Impressum / Datenschutz and the check-in scan screen.
import { CATEGORIES, DETAIL_FIELDS } from "./registration.js";

export type DetailField = (typeof DETAIL_FIELDS)[number];

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[a-z0-9_-]{1,40}$/;
const IMAGE_RE = /^[0-9a-f-]{36}$/;
const MAX_BLOCKS = 40;

/** Info box between categories / fields: emoji, title, text, colour. */
export interface BoxBlock { type: "box"; id: string; icon: string; title: string; text: string; color: string }
export interface CategoryBlock { type: "category"; id: string; label: string; description: string; icon: string; color: string; enabled: boolean }
/** Built-in data field (validation fixed in shared/registration.ts; only optional ones can be hidden). */
export interface FieldBlock { type: "field"; id: DetailField; label: string; placeholder: string; hint: string; icon: string; color: string; enabled: boolean }
/** Own question added by a super user; the answer is stored encrypted in `registrations.extra`. */
export interface CustomBlock { type: "custom"; id: string; label: string; placeholder: string; hint: string; icon: string; color: string; required: boolean; multiline: boolean; enabled: boolean }

export interface FormConfig {
  category: { title: string; subtitle: string; blocks: (CategoryBlock | BoxBlock)[] };
  details: { title: string; subtitle: string; blocks: (FieldBlock | CustomBlock | BoxBlock)[] };
}

/** Built-in fields that must always be asked (server validation requires them). */
export const REQUIRED_FIELDS: readonly DetailField[] = ["firstName", "lastName", "stageName", "email", "city"];

export const FIELD_DEFAULTS: Record<DetailField, { label: string; placeholder: string; hint: string }> = {
  firstName: { label: "Vorname", placeholder: "Dein Vorname", hint: "" },
  lastName: { label: "Nachname", placeholder: "Dein Nachname", hint: "" },
  stageName: { label: "Künstlername / Stagename", placeholder: "Dein Künstlername", hint: "Kleiner Hinweis: Falls du keinen Künstlernamen nutzt, trage bitte deinen öffentlichen Namen ein." },
  email: { label: "E-Mail-Adresse", placeholder: "deine@email.de", hint: "" },
  instagram: { label: "Instagram-Profil-URL", placeholder: "https://instagram.com/deinname", hint: "" },
  tiktok: { label: "TikTok-Profil-URL", placeholder: "https://tiktok.com/@deinname", hint: "" },
  referredBy: { label: "Von wem wurdest du eingeladen oder empfohlen?", placeholder: "Name der Person", hint: "" },
  city: { label: "Aus welcher Stadt bist du?", placeholder: "z. B. Hamburg", hint: "" },
};

const defaultCategory = (c: (typeof CATEGORIES)[number]): CategoryBlock => ({ type: "category", id: c.id, label: c.label, description: c.description, icon: c.icon, color: "", enabled: true });
const defaultField = (id: DetailField): FieldBlock => ({ type: "field", id, ...FIELD_DEFAULTS[id], icon: "", color: "", enabled: true });

export const DEFAULT_FORM: FormConfig = {
  category: { title: "Wer bist du?", subtitle: "Wähle deine Kategorie aus.", blocks: CATEGORIES.map(defaultCategory) },
  details: { title: "Deine Daten", subtitle: "Erzähl uns kurz, wer du bist und wie wir dich erreichen.", blocks: DETAIL_FIELDS.map(defaultField) },
};

const text = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const color = (v: unknown, fallback = "") => (typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : fallback);
const icon = (v: unknown) => text(v, 16);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function box(b: Record<string, unknown>): BoxBlock {
  return { type: "box", id: String(b.id), icon: icon(b.icon), title: text(b.title, 120), text: text(b.text, 2000), color: color(b.color) };
}

/** Completes / sanitises a stored form config; built-in categories and fields are always present. */
export function normalizeForm(raw: unknown): FormConfig {
  const r = obj(raw);
  const cat = obj(r.category);
  const det = obj(r.details);
  const seen = new Set<string>();
  const blocks = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map(obj)
      .filter((b) => typeof b.id === "string" && ID_RE.test(b.id) && !seen.has(b.id) && seen.add(b.id))
      .slice(0, MAX_BLOCKS);

  const categoryBlocks: (CategoryBlock | BoxBlock)[] = [];
  for (const b of blocks(cat.blocks)) {
    if (b.type === "box") categoryBlocks.push(box(b));
    else if (b.type === "category") {
      const base = CATEGORIES.find((c) => c.id === b.id);
      categoryBlocks.push({
        type: "category", id: String(b.id),
        label: text(b.label, 80) || base?.label || String(b.id),
        // Missing keys (not empty strings) fall back to the built-in texts.
        description: text(b.description, 200, base?.description ?? ""), icon: b.icon === undefined ? (base?.icon ?? "") : icon(b.icon),
        color: color(b.color), enabled: bool(b.enabled, true),
      });
    }
  }
  for (const c of CATEGORIES) if (!categoryBlocks.some((b) => b.id === c.id)) categoryBlocks.push(defaultCategory(c));

  seen.clear();
  const detailBlocks: (FieldBlock | CustomBlock | BoxBlock)[] = [];
  for (const b of blocks(det.blocks)) {
    if (b.type === "box") detailBlocks.push(box(b));
    else if (b.type === "field" && (DETAIL_FIELDS as readonly string[]).includes(String(b.id))) {
      const id = b.id as DetailField;
      detailBlocks.push({
        type: "field", id,
        label: text(b.label, 120) || FIELD_DEFAULTS[id].label,
        placeholder: text(b.placeholder, 120), hint: text(b.hint, 300), icon: icon(b.icon), color: color(b.color),
        enabled: REQUIRED_FIELDS.includes(id) ? true : bool(b.enabled, true),
      });
    } else if (b.type === "custom" && !(DETAIL_FIELDS as readonly string[]).includes(String(b.id))) {
      detailBlocks.push({
        type: "custom", id: String(b.id),
        label: text(b.label, 120) || "Eigene Frage",
        placeholder: text(b.placeholder, 120), hint: text(b.hint, 300), icon: icon(b.icon), color: color(b.color),
        required: bool(b.required, false), multiline: bool(b.multiline, false), enabled: bool(b.enabled, true),
      });
    }
  }
  for (const f of DETAIL_FIELDS) if (!detailBlocks.some((b) => b.type === "field" && b.id === f)) detailBlocks.push(defaultField(f));

  return {
    category: { title: text(cat.title, 120) || DEFAULT_FORM.category.title, subtitle: text(cat.subtitle, 300, DEFAULT_FORM.category.subtitle), blocks: categoryBlocks },
    details: { title: text(det.title, 120) || DEFAULT_FORM.details.title, subtitle: text(det.subtitle, 300, DEFAULT_FORM.details.subtitle), blocks: detailBlocks },
  };
}

/** Problems that block saving (e.g. no selectable category left). */
export function validateForm(form: FormConfig): string | null {
  if (!enabledCategories(form).length) return "Mindestens eine Kategorie muss sichtbar sein.";
  return null;
}

/** All categories incl. hidden ones (labels for existing registrations). */
export const formCategories = (form: FormConfig) => form.category.blocks.filter((b): b is CategoryBlock => b.type === "category");
export const enabledCategories = (form: FormConfig) => formCategories(form).filter((c) => c.enabled);
export const customFields = (form: FormConfig) => form.details.blocks.filter((b): b is CustomBlock => b.type === "custom" && b.enabled);
export const fieldEnabled = (form: FormConfig, id: DetailField) =>
  form.details.blocks.some((b) => b.type === "field" && b.id === id && b.enabled);

/** Answers to custom questions, stored as a label snapshot so they stay readable after config changes. */
export interface ExtraAnswer { id: string; label: string; value: string }
export const MAX_CUSTOM_ANSWER = 1000;

export function validateCustomAnswers(form: FormConfig, answers: Record<string, unknown>): { errors: Record<string, string>; values: ExtraAnswer[] } {
  const errors: Record<string, string> = {};
  const values: ExtraAnswer[] = [];
  for (const f of customFields(form)) {
    const v = typeof answers[f.id] === "string" ? (answers[f.id] as string).trim() : "";
    if (f.required && !v) errors[f.id] = "Bitte fülle dieses Feld aus.";
    else if (v.length > MAX_CUSTOM_ANSWER) errors[f.id] = `Maximal ${MAX_CUSTOM_ANSWER} Zeichen.`;
    else if (v) values.push({ id: f.id, label: f.label, value: v });
  }
  return { errors, values };
}

/** Parses the decrypted `registrations.extra` JSON. */
export function parseExtra(raw: string | null | undefined): ExtraAnswer[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((a) => a && typeof a.label === "string" && typeof a.value === "string") : [];
  } catch {
    return [];
  }
}

/* ---------- Impressum / Datenschutz ---------- */

export interface Legal { impressum: string; datenschutz: string }
export const LEGAL_PAGES = { impressum: "Impressum", datenschutz: "Datenschutzerklärung" } as const;
export type LegalPage = keyof typeof LEGAL_PAGES;
export const normalizeLegal = (raw: unknown): Legal => {
  const r = obj(raw);
  return { impressum: text(r.impressum, 30000), datenschutz: text(r.datenschutz, 80000) };
};

/* ---------- Check-in scan screen ---------- */

export const SCAN_ANIMATIONS = { pulse: "Puls-Ringe", zoom: "Logo-Zoom", spin: "Dreh-Effekt", none: "Keine Animation" } as const;
export type ScanAnimation = keyof typeof SCAN_ANIMATIONS;
export type ScanState = "ready" | "ok" | "already" | "invalid";

/* Result layout: which element is shown where (above / in the card), in which form and how big. */
export const SCAN_ELEMENTS = {
  logo: "Logo", icon: "Status-Symbol", title: "Überschrift", number: "Anmeldenummer", category: "Kategorie",
  name: "Künstlername", realName: "Vor- und Nachname", city: "Stadt", instagram: "Instagram", note: "Hinweis (Uhrzeit / Fehler)",
} as const;
export type ScanElementId = keyof typeof SCAN_ELEMENTS;
export const SCAN_SIZES = { s: "Klein", m: "Mittel", l: "Groß", xl: "Sehr groß" } as const;
export type ScanSize = keyof typeof SCAN_SIZES;
export const SCAN_ALIGNS = { left: "Links", center: "Mitte", right: "Rechts" } as const;
export type ScanAlign = keyof typeof SCAN_ALIGNS;
export const SCAN_PLACES = { above: "Über der Karte", card: "In der Karte", below: "Unter der Karte" } as const;
export type ScanPlace = keyof typeof SCAN_PLACES;
/** "Form" per element type: shapes for logo / icon, text styles for everything else. */
export const SCAN_STYLES = {
  logo: { plain: "Original", round: "Rund", rounded: "Abgerundet" },
  icon: { circle: "Kreis", square: "Quadrat", plain: "Ohne Hintergrund" },
  text: { text: "Normal", bold: "Fett", upper: "GROSSBUCHSTABEN", badge: "Badge", italic: "Kursiv" },
} as const;
export const scanStyleGroup = (id: ScanElementId) => (id === "logo" ? "logo" : id === "icon" ? "icon" : "text");
export interface ScanElement { id: ScanElementId; visible: boolean; place: ScanPlace; align: ScanAlign; size: ScanSize; style: string }
export const CARD_SHAPES = { rounded: "Abgerundet", square: "Eckig", soft: "Stark abgerundet", none: "Ohne Karte" } as const;
export type CardShape = keyof typeof CARD_SHAPES;
export const CARD_WIDTHS = { s: "Schmal", m: "Mittel", l: "Breit" } as const;
export type CardWidth = keyof typeof CARD_WIDTHS;

const el = (id: ScanElementId, size: ScanSize, style: string, place: ScanPlace = "card"): ScanElement => ({ id, visible: true, place, align: "center", size, style });
export const DEFAULT_SCAN_LAYOUT: ScanElement[] = [
  el("logo", "l", "plain", "above"), el("icon", "m", "circle"), el("title", "m", "bold"), el("number", "s", "text"), el("category", "s", "badge"),
  el("name", "l", "bold"), el("realName", "m", "text"), el("city", "m", "text"), el("instagram", "s", "text"), el("note", "m", "bold"),
];

export interface CheckinDesign {
  background: string;
  /** Valid tickets (ready / ok) use the configured colour of the guest's category, if it has one. */
  categoryColor: boolean;
  layout: ScanElement[];
  cardShape: CardShape;
  cardWidth: CardWidth;
  /** Tint the background with the result colour (green / orange / red). */
  tintBackground: boolean;
  textColor: string;
  accentColor: string;
  okColor: string;
  warnColor: string;
  errorColor: string;
  /** mail-images id; "" = Artistroom logo. */
  logoImage: string;
  animation: ScanAnimation;
  /** Length of the intro animation in ms before the result is shown. */
  durationMs: number;
  titles: Record<ScanState, string>;
}

export const DEFAULT_CHECKIN: CheckinDesign = {
  background: "#0b0b12",
  categoryColor: true,
  layout: DEFAULT_SCAN_LAYOUT,
  cardShape: "rounded",
  cardWidth: "m",
  tintBackground: true,
  textColor: "#ffffff",
  accentColor: "#8b5cf6",
  okColor: "#22c55e",
  warnColor: "#f59e0b",
  errorColor: "#ef4444",
  logoImage: "",
  animation: "pulse",
  durationMs: 1200,
  titles: { ready: "🎟️ TICKET GÜLTIG", ok: "✅ EINLASS OK", already: "⚠️ BEREITS EINGECHECKT", invalid: "⛔ KEIN EINLASS" },
};

export function normalizeCheckin(raw: unknown): CheckinDesign {
  const r = obj(raw);
  const d = DEFAULT_CHECKIN;
  const t = obj(r.titles);
  const duration = Number(r.durationMs);
  return {
    background: color(r.background, d.background),
    categoryColor: bool(r.categoryColor, d.categoryColor),
    layout: normalizeLayout(r),
    cardShape: typeof r.cardShape === "string" && r.cardShape in CARD_SHAPES ? (r.cardShape as CardShape) : d.cardShape,
    cardWidth: typeof r.cardWidth === "string" && r.cardWidth in CARD_WIDTHS ? (r.cardWidth as CardWidth) : d.cardWidth,
    tintBackground: bool(r.tintBackground, d.tintBackground),
    textColor: color(r.textColor, d.textColor),
    accentColor: color(r.accentColor, d.accentColor),
    okColor: color(r.okColor, d.okColor),
    warnColor: color(r.warnColor, d.warnColor),
    errorColor: color(r.errorColor, d.errorColor),
    logoImage: typeof r.logoImage === "string" && IMAGE_RE.test(r.logoImage) ? r.logoImage : "",
    animation: typeof r.animation === "string" && r.animation in SCAN_ANIMATIONS ? (r.animation as ScanAnimation) : d.animation,
    durationMs: Number.isFinite(duration) ? Math.min(4000, Math.max(0, Math.round(duration))) : d.durationMs,
    titles: Object.fromEntries((Object.keys(d.titles) as ScanState[]).map((k) => [k, text(t[k], 80) || d.titles[k]])) as Record<ScanState, string>,
  };
}

/** Layout list: known elements once each, in stored order; missing ones appended (old show* toggles respected). */
function normalizeLayout(r: Record<string, unknown>): ScanElement[] {
  const legacy: Partial<Record<ScanElementId, unknown>> = { logo: r.showLogo, category: r.showCategory, realName: r.showRealName, city: r.showCity, instagram: r.showInstagram };
  const seen = new Set<string>();
  const out: ScanElement[] = [];
  for (const raw of Array.isArray(r.layout) ? r.layout : []) {
    const e = obj(raw);
    const id = e.id as ScanElementId;
    if (typeof id !== "string" || !(id in SCAN_ELEMENTS) || seen.has(id)) continue;
    seen.add(id);
    const base = DEFAULT_SCAN_LAYOUT.find((x) => x.id === id)!;
    const styles = SCAN_STYLES[scanStyleGroup(id)] as Record<string, string>;
    out.push({
      id,
      visible: bool(e.visible, true),
      place: typeof e.place === "string" && e.place in SCAN_PLACES ? (e.place as ScanPlace) : base.place,
      align: typeof e.align === "string" && e.align in SCAN_ALIGNS ? (e.align as ScanAlign) : base.align,
      size: typeof e.size === "string" && e.size in SCAN_SIZES ? (e.size as ScanSize) : base.size,
      style: typeof e.style === "string" && e.style in styles ? e.style : base.style,
    });
  }
  for (const base of DEFAULT_SCAN_LAYOUT) if (!seen.has(base.id)) out.push({ ...base, visible: bool(legacy[base.id], true) });
  return out;
}

/** New random block id with a type prefix (c = category, f = custom field, b = box). */
export const newBlockId = (prefix: "c" | "f" | "b") => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
