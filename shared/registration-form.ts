/*
 * Registration form "Baukasten" (Dashboard → Anmeldung, super users only). Shared by the
 * settings editor, the public registration page, the dashboard and the server, so all agree on
 * categories, fields and validation. Stored in `event_settings.registration_form`; null = defaults.
 *
 *  - categories: the "Wer bist du?" boxes (emoji, title, text, colour)
 *  - fields: the "Deine Daten" step – built-in fields (stored in their own columns) plus custom
 *    fields, headings and info texts (answers stored sealed in `registrations.extra_fields`)
 *  - checkin: the full-screen animation shown when a ticket QR code is scanned
 */
import {
  CATEGORIES,
  normalizeInstagram,
  normalizeTiktok,
  validateCity,
  validateEmail,
  validateFirstName,
  validateInstagram,
  validateLastName,
  validateReferredBy,
  validateStageName,
  validateTiktok,
} from "./registration.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
const IMAGE_ID = /^[0-9a-f-]{36}$/;
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ---------------- Categories ("Wer bist du?") ---------------- */

export interface FormCategory {
  id: string;
  icon: string;
  label: string;
  description: string;
  /** Colour of the check-in animation for this category. */
  color: string;
  /** Box spans the full width. */
  wide: boolean;
}

const DEFAULT_COLORS: Record<string, string> = {
  teilnehmer: "#8b5cf6", musiker: "#ec4899", kuenstler: "#f59e0b", dj: "#06b6d4", taenzer: "#22c55e", presse: "#ef4444",
};

export const DEFAULT_CATEGORIES: FormCategory[] = CATEGORIES.map((c, i) => ({
  id: c.id, icon: c.icon, label: c.label, description: c.description, color: DEFAULT_COLORS[c.id] ?? "#8b5cf6", wide: i === 0,
}));

export const newCategoryId = () => `k${rid()}`;
const CATEGORY_ID = /^[a-z0-9_-]{2,30}$/;

/* ---------------- Fields ("Deine Daten") ---------------- */

export const BUILTIN_FIELDS = {
  firstName: { label: "Vorname", placeholder: "Dein Vorname", hint: "", type: "text", autoComplete: "given-name", maxLength: 100, required: true, locked: false },
  lastName: { label: "Nachname", placeholder: "Dein Nachname", hint: "", type: "text", autoComplete: "family-name", maxLength: 100, required: true, locked: false },
  stageName: {
    label: "Künstlername / Stagename", placeholder: "Dein Künstlername", type: "text", autoComplete: "nickname", maxLength: 100, required: true, locked: true,
    hint: "Kleiner Hinweis: Falls du keinen Künstlernamen nutzt, trage bitte deinen öffentlichen Namen ein.",
  },
  email: { label: "E-Mail-Adresse", placeholder: "deine@email.de", hint: "", type: "email", autoComplete: "email", maxLength: 254, required: true, locked: true },
  instagram: { label: "Instagram-Profil-URL", placeholder: "https://instagram.com/deinname", hint: "", type: "url", autoComplete: "off", maxLength: 120, required: false, locked: false },
  tiktok: { label: "TikTok-Profil-URL", placeholder: "https://tiktok.com/@deinname", hint: "", type: "url", autoComplete: "off", maxLength: 120, required: false, locked: false },
  referredBy: { label: "Von wem wurdest du eingeladen oder empfohlen?", placeholder: "Name der Person", hint: "", type: "text", autoComplete: "off", maxLength: 150, required: false, locked: false },
  city: { label: "Aus welcher Stadt bist du?", placeholder: "z. B. Hamburg", hint: "", type: "text", autoComplete: "address-level2", maxLength: 100, required: true, locked: false },
} as const;
export type BuiltinField = keyof typeof BUILTIN_FIELDS;
export const BUILTIN_IDS = Object.keys(BUILTIN_FIELDS) as BuiltinField[];
export const isBuiltin = (id: string): id is BuiltinField => (BUILTIN_IDS as string[]).includes(id);

/** Short labels for summaries, the dashboard and the CSV. */
export const BUILTIN_SHORT: Record<BuiltinField, string> = {
  firstName: "Vorname", lastName: "Nachname", stageName: "Künstlername / Stagename", email: "E-Mail",
  instagram: "Instagram", tiktok: "TikTok", referredBy: "Eingeladen / empfohlen von", city: "Stadt",
};

export const FIELD_TYPES = [
  { id: "builtin", label: "Standardfeld" },
  { id: "text", label: "✏️ Kurzer Text" },
  { id: "textarea", label: "📝 Langer Text" },
  { id: "select", label: "🔘 Auswahl" },
  { id: "checkbox", label: "☑️ Häkchen" },
  { id: "heading", label: "🔠 Zwischenüberschrift" },
  { id: "info", label: "ℹ️ Infotext" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["id"];
/** Block types a person actually fills in (custom fields). */
export const INPUT_TYPES: FieldType[] = ["text", "textarea", "select", "checkbox"];

export interface FormField {
  /** Built-in field key, or `f…` (custom input) / `h…` (heading / info text). */
  id: string;
  type: FieldType;
  enabled: boolean;
  required: boolean;
  /** Label (or heading / info text). */
  label: string;
  placeholder: string;
  hint: string;
  /** Choices for "select". */
  options: string[];
}

const CUSTOM_ID = /^[fh][a-z0-9]{3,24}$/;
export const newFieldId = (type: FieldType) => `${type === "heading" || type === "info" ? "h" : "f"}${rid()}`;

export const DEFAULT_FIELDS: FormField[] = BUILTIN_IDS.map((id) => ({
  id, type: "builtin", enabled: true, required: BUILTIN_FIELDS[id].required,
  label: BUILTIN_FIELDS[id].label, placeholder: BUILTIN_FIELDS[id].placeholder, hint: BUILTIN_FIELDS[id].hint, options: [],
}));

/* ---------------- Check-in animation ---------------- */

export const CHECKIN_BLOCKS = [
  { id: "logo", label: "🖼️ Logo" },
  { id: "status", label: "✅ Einlass-Status" },
  { id: "emoji", label: "😀 Kategorie-Emoji" },
  { id: "kategorie", label: "🏷️ Kategorie" },
  { id: "name", label: "⭐ Künstlername" },
  { id: "realname", label: "👤 Vor- und Nachname" },
  { id: "nummer", label: "#️⃣ Anmeldenummer" },
  { id: "stadt", label: "📍 Stadt" },
  { id: "instagram", label: "📸 Instagram" },
  { id: "zeit", label: "🕒 Uhrzeit" },
  { id: "text", label: "📝 Freitext" },
  { id: "feld", label: "🧩 Eigenes Formularfeld" },
] as const;
export type CheckinBlockType = (typeof CHECKIN_BLOCKS)[number]["id"];
/** Types that can appear several times; all others at most once. */
const REPEATABLE: CheckinBlockType[] = ["text", "feld"];

export interface CheckinBlock {
  id: string;
  type: CheckinBlockType;
  enabled: boolean;
  /** Free text ("text"), placeholders {name} {vorname} {kategorie} {nummer} {event}. */
  text: string;
  /** Custom form field shown by a "feld" block. */
  fieldId: string;
}

export const CHECKIN_ANIMATIONS = [
  { id: "pulse", label: "Pulsieren" },
  { id: "zoom", label: "Hineinzoomen" },
  { id: "slide", label: "Von unten einfahren" },
  { id: "burst", label: "Farbexplosion" },
] as const;
export const CHECKIN_BACKGROUNDS = [
  { id: "kategorie", label: "Kategorie-Farbe (voll)" },
  { id: "verlauf", label: "Verlauf aus Kategorie-Farbe" },
  { id: "dunkel", label: "Dunkel mit farbigem Leuchten" },
] as const;

export interface CheckinDesign {
  enabled: boolean;
  animation: (typeof CHECKIN_ANIMATIONS)[number]["id"];
  background: (typeof CHECKIN_BACKGROUNDS)[number]["id"];
  /** Seconds until the animation closes by itself. */
  duration: number;
  /** mail-images id; "" = Artistroom logo. */
  logoImage: string;
  logoSize: number;
  blocks: CheckinBlock[];
}

export const newCheckinBlockId = () => `c${rid()}`;

export const DEFAULT_CHECKIN: CheckinDesign = {
  enabled: true,
  animation: "burst",
  background: "verlauf",
  duration: 5,
  logoImage: "",
  logoSize: 120,
  blocks: [
    { id: "logo", type: "logo", enabled: true, text: "", fieldId: "" },
    { id: "status", type: "status", enabled: true, text: "", fieldId: "" },
    { id: "emoji", type: "emoji", enabled: true, text: "", fieldId: "" },
    { id: "kategorie", type: "kategorie", enabled: true, text: "", fieldId: "" },
    { id: "name", type: "name", enabled: true, text: "", fieldId: "" },
    { id: "realname", type: "realname", enabled: true, text: "", fieldId: "" },
    { id: "nummer", type: "nummer", enabled: true, text: "", fieldId: "" },
    { id: "stadt", type: "stadt", enabled: false, text: "", fieldId: "" },
    { id: "instagram", type: "instagram", enabled: false, text: "", fieldId: "" },
    { id: "zeit", type: "zeit", enabled: false, text: "", fieldId: "" },
    { id: "cwillkommen", type: "text", enabled: true, text: "Willkommen bei {event}, {vorname}! 🎉", fieldId: "" },
  ],
};

/* ---------------- Whole form ---------------- */

export interface RegistrationForm {
  categoryTitle: string;
  categoryIntro: string;
  detailsTitle: string;
  detailsIntro: string;
  categories: FormCategory[];
  fields: FormField[];
  checkin: CheckinDesign;
}

export const DEFAULT_REGISTRATION_FORM: RegistrationForm = {
  categoryTitle: "Wer bist du?",
  categoryIntro: "Wähle deine Kategorie aus.",
  detailsTitle: "Deine Daten",
  detailsIntro: "Erzähl uns kurz, wer du bist und wie wir dich erreichen.",
  categories: DEFAULT_CATEGORIES,
  fields: DEFAULT_FIELDS,
  checkin: DEFAULT_CHECKIN,
};

/** What the public registration page needs (no check-in design). */
export type PublicRegistrationForm = Omit<RegistrationForm, "checkin">;
export const publicForm = ({ checkin: _checkin, ...form }: RegistrationForm): PublicRegistrationForm => form;

function normalizeCategories(input: unknown): FormCategory[] {
  if (!Array.isArray(input)) return DEFAULT_CATEGORIES;
  const seen = new Set<string>();
  const list = input
    .slice(0, 24)
    .map((c) => (c && typeof c === "object" ? c : {}) as Partial<FormCategory>)
    .filter((c) => typeof c.id === "string" && CATEGORY_ID.test(c.id) && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({
      id: c.id!,
      icon: str(c.icon, 16).trim() || "🎟️",
      label: str(c.label, 40).trim() || "Kategorie",
      description: str(c.description, 120).trim(),
      color: typeof c.color === "string" && HEX.test(c.color) ? c.color.toLowerCase() : "#8b5cf6",
      wide: c.wide === true,
    }));
  return list.length ? list : DEFAULT_CATEGORIES;
}

function normalizeFields(input: unknown): FormField[] {
  const src = Array.isArray(input) ? input : DEFAULT_FIELDS;
  const seen = new Set<string>();
  const fields: FormField[] = src
    .slice(0, 60)
    .map((f) => (f && typeof f === "object" ? f : {}) as Partial<FormField>)
    .filter((f) => {
      if (typeof f.id !== "string" || seen.has(f.id)) return false;
      const ok = isBuiltin(f.id) ? true : CUSTOM_ID.test(f.id) && FIELD_TYPES.some((t) => t.id === f.type && t.id !== "builtin");
      if (ok) seen.add(f.id);
      return ok;
    })
    .map((f) => {
      const builtin = isBuiltin(f.id!) ? BUILTIN_FIELDS[f.id as BuiltinField] : null;
      const type: FieldType = builtin ? "builtin" : f.type!;
      const input = builtin || INPUT_TYPES.includes(type);
      return {
        id: f.id!,
        type,
        // Stage name and e-mail are needed everywhere (display name, mails) → always on and required.
        enabled: builtin?.locked ? true : f.enabled !== false,
        required: builtin?.locked ? true : input ? f.required === true : false,
        label: str(f.label, type === "info" ? 1000 : 200).trim() || (builtin ? builtin.label : type === "heading" ? "Überschrift" : type === "info" ? "Infotext" : "Feld"),
        placeholder: input && type !== "checkbox" && type !== "select" ? str(f.placeholder, 120) : "",
        hint: input ? str(f.hint, 300) : "",
        options: type === "select" ? (Array.isArray(f.options) ? f.options : []).map((o) => str(o, 120).trim()).filter(Boolean).slice(0, 30) : [],
      };
    });
  // Every built-in field exists exactly once (missing ones are appended hidden; locked ones visible).
  for (const id of BUILTIN_IDS) {
    if (!seen.has(id)) fields.push({ ...DEFAULT_FIELDS.find((f) => f.id === id)!, enabled: BUILTIN_FIELDS[id].locked });
  }
  return fields;
}

function normalizeCheckin(input: unknown): CheckinDesign {
  const src = (input && typeof input === "object" ? input : {}) as Partial<CheckinDesign>;
  const seen = new Set<string>();
  const once = new Set<string>();
  const blocks = (Array.isArray(src.blocks) ? src.blocks : DEFAULT_CHECKIN.blocks)
    .slice(0, 40)
    .map((b) => (b && typeof b === "object" ? b : {}) as Partial<CheckinBlock>)
    .filter((b) => {
      if (typeof b.id !== "string" || !/^[a-z0-9]{2,30}$/.test(b.id) || seen.has(b.id) || !CHECKIN_BLOCKS.some((t) => t.id === b.type)) return false;
      if (!REPEATABLE.includes(b.type!)) {
        if (once.has(b.type!)) return false;
        once.add(b.type!);
      }
      seen.add(b.id);
      return true;
    })
    .map((b) => ({
      id: b.id!,
      type: b.type!,
      enabled: b.enabled !== false,
      text: b.type === "text" ? str(b.text, 300) : "",
      fieldId: b.type === "feld" && typeof b.fieldId === "string" && CUSTOM_ID.test(b.fieldId) ? b.fieldId : "",
    }));
  const pick = <T extends string>(v: unknown, list: readonly { id: T }[], fallback: T): T => (list.some((x) => x.id === v) ? (v as T) : fallback);
  const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
  return {
    enabled: src.enabled !== false,
    animation: pick(src.animation, CHECKIN_ANIMATIONS, DEFAULT_CHECKIN.animation),
    background: pick(src.background, CHECKIN_BACKGROUNDS, DEFAULT_CHECKIN.background),
    duration: num(src.duration, 2, 30, DEFAULT_CHECKIN.duration),
    logoImage: typeof src.logoImage === "string" && IMAGE_ID.test(src.logoImage) ? src.logoImage : "",
    logoSize: num(src.logoSize, 48, 320, DEFAULT_CHECKIN.logoSize),
    blocks,
  };
}

/** Validates a stored/submitted form config and fills missing parts with defaults. */
export function normalizeRegistrationForm(input: unknown): RegistrationForm {
  const src = (input && typeof input === "object" ? input : {}) as Partial<RegistrationForm>;
  const d = DEFAULT_REGISTRATION_FORM;
  return {
    categoryTitle: str(src.categoryTitle, 120).trim() || d.categoryTitle,
    categoryIntro: str(src.categoryIntro, 500, d.categoryIntro),
    detailsTitle: str(src.detailsTitle, 120).trim() || d.detailsTitle,
    detailsIntro: str(src.detailsIntro, 500, d.detailsIntro),
    categories: normalizeCategories(src.categories),
    fields: normalizeFields(src.fields),
    checkin: normalizeCheckin(src.checkin),
  };
}

/* ---------------- Lookups ---------------- */

/** Category of a registration – configured one, else a built-in default (old rows), else a placeholder. */
export function findCategory(id: string, categories: FormCategory[]): FormCategory {
  return categories.find((c) => c.id === id) ?? DEFAULT_CATEGORIES.find((c) => c.id === id) ?? { id, icon: "🎟️", label: id, description: "", color: "#8b5cf6", wide: false };
}
export const categoryName = (id: string, categories: FormCategory[]) => findCategory(id, categories).label;

/* ---------------- Input + validation ---------------- */

export interface RegistrationValues {
  category: string;
  firstName: string;
  lastName: string;
  /** Künstlername / Stagename – stored in `name`. */
  stageName: string;
  email: string;
  instagram: string;
  tiktok: string;
  referredBy: string;
  city: string;
  /** Custom fields by block id ("ja" / "" for checkboxes). */
  extra: Record<string, string>;
}

export const EMPTY_VALUES: RegistrationValues = {
  category: "", firstName: "", lastName: "", stageName: "", email: "", instagram: "", tiktok: "", referredBy: "", city: "", extra: {},
};

export type FormErrors = Record<string, string | undefined>;

/** Custom answer as stored: label snapshot (stays readable after config changes) + value. */
export type ExtraAnswers = Record<string, { label: string; value: string }>;

export const parseExtra = (raw: string | null | undefined): ExtraAnswers => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as ExtraAnswers) : {};
  } catch {
    return {};
  }
};

const REQUIRED_MESSAGE = "Bitte fülle dieses Feld aus.";

function validateBuiltin(id: BuiltinField, value: string, required: boolean): string | undefined {
  const empty = !(id === "instagram" ? normalizeInstagram(value) : id === "tiktok" ? normalizeTiktok(value) : value.trim());
  if (empty) {
    if (id === "email") return validateEmail(value);
    if (id === "stageName") return validateStageName(value);
    if (!required) return;
    if (id === "firstName") return validateFirstName(value);
    if (id === "lastName") return validateLastName(value);
    if (id === "city") return validateCity(value);
    return REQUIRED_MESSAGE;
  }
  switch (id) {
    case "firstName": return validateFirstName(value);
    case "lastName": return validateLastName(value);
    case "stageName": return validateStageName(value);
    case "email": return validateEmail(value);
    case "instagram": return validateInstagram(value);
    case "tiktok": return validateTiktok(value);
    case "referredBy": return validateReferredBy(value);
    case "city": return validateCity(value);
  }
}

const EXTRA_MAX = { text: 300, textarea: 3000 } as const;

function validateCustom(f: FormField, value: string): string | undefined {
  const v = value.trim();
  if (f.type === "checkbox") return f.required && v !== "ja" ? "Bitte bestätige das Häkchen." : undefined;
  if (!v) return f.required ? (f.type === "select" ? "Bitte wähle eine Option." : REQUIRED_MESSAGE) : undefined;
  if (f.type === "select") return f.options.includes(v) ? undefined : "Bitte wähle eine der Optionen.";
  const max = f.type === "textarea" ? EXTRA_MAX.textarea : EXTRA_MAX.text;
  if (v.length > max) return `Maximal ${max} Zeichen.`;
}

/** Fields of the data step a person fills in (enabled built-ins + custom inputs), in form order. */
export const inputFields = (form: Pick<RegistrationForm, "fields">) =>
  form.fields.filter((f) => f.enabled && (f.type === "builtin" || INPUT_TYPES.includes(f.type)));

/** Validates the data step (without category). Keys: built-in field name or custom block id. */
export function validateDetails(values: RegistrationValues, form: Pick<RegistrationForm, "fields">): FormErrors {
  const errors: FormErrors = {};
  for (const f of inputFields(form)) {
    const msg = isBuiltin(f.id) ? validateBuiltin(f.id, values[f.id] ?? "", f.required) : validateCustom(f, values.extra?.[f.id] ?? "");
    if (msg) errors[f.id] = msg;
  }
  return errors;
}

export function validateRegistration(values: RegistrationValues, form: Pick<RegistrationForm, "fields" | "categories">): FormErrors {
  const errors = validateDetails(values, form);
  if (!form.categories.some((c) => c.id === values.category)) errors.category = "Bitte wähle eine Kategorie.";
  return errors;
}

/** Cleaned custom answers for storage (only enabled custom inputs with a value). */
export function collectExtra(values: RegistrationValues, form: Pick<RegistrationForm, "fields">): ExtraAnswers {
  const out: ExtraAnswers = {};
  for (const f of inputFields(form)) {
    if (isBuiltin(f.id)) continue;
    const v = (values.extra?.[f.id] ?? "").trim();
    if (!v) continue;
    out[f.id] = { label: f.label, value: f.type === "checkbox" ? (v === "ja" ? "Ja" : "") : v.slice(0, f.type === "textarea" ? EXTRA_MAX.textarea : EXTRA_MAX.text) };
    if (!out[f.id].value) delete out[f.id];
  }
  return out;
}

/** Built-in values that are hidden in the form are not stored. */
export const builtinEnabled = (form: Pick<RegistrationForm, "fields">, id: BuiltinField) => form.fields.some((f) => f.id === id && f.enabled);

/** Text with check-in placeholders filled in. */
export const fillCheckinText = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** Configured categories plus those still used by registrations (removed or old categories). */
export function categoriesInUse(categories: FormCategory[], usedIds: string[]): FormCategory[] {
  const extra = [...new Set(usedIds)].filter((id) => !categories.some((c) => c.id === id)).map((id) => findCategory(id, categories));
  return [...categories, ...extra];
}
