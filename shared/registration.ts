// Shared between the browser and Netlify Functions so client and server validate identically.

export const CATEGORIES = [
  { id: "teilnehmer", label: "Teilnehmer", description: "Ich möchte dabei sein", icon: "🎟️" },
  { id: "musiker", label: "Musiker", description: "Ich mache Musik", icon: "🎤" },
  { id: "kuenstler", label: "Künstler", description: "Grafik, Maler, Tattoo, Design & mehr", icon: "🎨" },
  { id: "dj", label: "DJ", description: "Ich lege auf", icon: "🎧" },
  { id: "taenzer", label: "Tänzer", description: "Ich tanze", icon: "💃" },
  { id: "presse", label: "Presse", description: "Medien & Berichterstattung", icon: "📸" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const STATUSES = [
  { id: "ausstehend", label: "Ausstehend", icon: "⏳" },
  { id: "kostenlos", label: "Kostenlos", icon: "🎁" },
  { id: "zahlung_angefordert", label: "Zahlung ausstehend", icon: "💳" },
  { id: "bezahlt", label: "Bezahlt", icon: "✅" },
  { id: "abgelehnt", label: "Abgelehnt", icon: "❌" },
] as const;

/** Emoji for a status (or the "angenommen" filter group) – dashboard only, never in e-mails. */
export const ACCEPTED_ICON = "👍";

export const DEFAULT_STATUS = "ausstehend";

/** Statuses that count as "angenommen" (accepted) in the dashboard. */
export const ACCEPTED_STATUSES = ["kostenlos", "zahlung_angefordert", "bezahlt"] as const;

/** Status filter check; the pseudo filter "angenommen" matches every accepted status. */
export const matchesStatus = (status: string, filter: string) =>
  !filter || (filter === "angenommen" ? (ACCEPTED_STATUSES as readonly string[]).includes(status) : status === filter);

/** Statuses with an issued ticket – the status is then locked in the dashboard (undo only via the log). */
export const TICKET_STATUSES = ["kostenlos", "bezahlt"] as const;
export const hasTicket = (status: string) => (TICKET_STATUSES as readonly string[]).includes(status);
/** Final statuses (ticket issued or rejected): no more buttons in the dashboard, only details. */
export const isFinalStatus = (status: string) => hasTicket(status) || status === "abgelehnt";

/** Largest amount (in cents) that can be requested from a registrant. */
export const MAX_AMOUNT_CENTS = 1_000_000;

export type StatusId = (typeof STATUSES)[number]["id"];

/** Label for a category id; pass the configured categories (form builder) where available. */
export const categoryLabel = (id: string, categories: readonly { id: string; label: string }[] = CATEGORIES) =>
  categories.find((c) => c.id === id)?.label ?? CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;
export const statusIcon = (id: string): string =>
  id === "angenommen" ? ACCEPTED_ICON : (STATUSES.find((s) => s.id === id)?.icon ?? "•");

export const isCategory = (v: unknown): v is CategoryId =>
  typeof v === "string" && CATEGORIES.some((c) => c.id === v);
export const isStatus = (v: unknown): v is StatusId =>
  typeof v === "string" && STATUSES.some((s) => s.id === v);

export interface RegistrationInput {
  category: string;
  firstName: string;
  lastName: string;
  /** Künstlername / Stagename – or the public name if the person has none. Stored in `name`. */
  stageName: string;
  email: string;
  instagram: string;
  tiktok: string;
  referredBy: string;
  city: string;
}

export type FieldErrors = Partial<Record<keyof RegistrationInput | "mediaConsent", string>>;

/** Fields a person fills in on the data step, in form order. */
export const DETAIL_FIELDS = ["firstName", "lastName", "stageName", "email", "instagram", "tiktok", "referredBy", "city"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INSTAGRAM_RE = /^[a-zA-Z0-9._]{1,30}$/;
const TIKTOK_RE = /^[a-zA-Z0-9._]{2,24}$/;

/** Accepts a profile URL, "@handle" or bare handle and returns the bare Instagram handle. */
export function normalizeInstagram(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/)?(www\.|m\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "");
}

/** Accepts a profile URL ("tiktok.com/@handle"), "@handle" or bare handle and returns the bare TikTok handle. */
export function normalizeTiktok(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/)?(www\.|m\.)?tiktok\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}`;
export const tiktokUrl = (handle: string) => `https://www.tiktok.com/@${handle}`;

function validateText(value: string, empty: string, label: string, max = 100): string | undefined {
  const v = value.trim();
  if (!v) return empty;
  if (v.length < 2) return `${label} ist zu kurz.`;
  if (v.length > max) return `${label} darf maximal ${max} Zeichen lang sein.`;
}

export const validateFirstName = (v: string) => validateText(v, "Bitte gib deinen Vornamen ein.", "Der Vorname");
export const validateLastName = (v: string) => validateText(v, "Bitte gib deinen Nachnamen ein.", "Der Nachname");
export const validateStageName = (v: string) => validateText(v, "Bitte gib deinen Künstlernamen oder öffentlichen Namen ein.", "Der Name");
export const validateCity = (v: string) => validateText(v, "Bitte gib deine Stadt ein.", "Die Stadt");

export function validateReferredBy(value: string): string | undefined {
  if (value.trim().length > 150) return "Maximal 150 Zeichen.";
}

export function validateEmail(email: string): string | undefined {
  const v = email.trim();
  if (!v) return "Bitte gib deine E-Mail-Adresse ein.";
  if (v.length > 254 || !EMAIL_RE.test(v)) return "Bitte gib eine gültige E-Mail-Adresse ein.";
}

export function validateInstagram(instagram: string): string | undefined {
  const v = normalizeInstagram(instagram);
  if (!v) return;
  if (!INSTAGRAM_RE.test(v)) return "Bitte gib eine gültige Instagram-Profil-URL ein, z. B. instagram.com/deinname.";
}

export function validateTiktok(tiktok: string): string | undefined {
  const v = normalizeTiktok(tiktok);
  if (!v) return;
  if (!TIKTOK_RE.test(v)) return "Bitte gib eine gültige TikTok-Profil-URL ein, z. B. tiktok.com/@deinname.";
}

/** Validates the data-step fields only (without category). */
export function validateDetails(input: RegistrationInput): FieldErrors {
  const checks: Record<(typeof DETAIL_FIELDS)[number], string | undefined> = {
    firstName: validateFirstName(input.firstName),
    lastName: validateLastName(input.lastName),
    stageName: validateStageName(input.stageName),
    email: validateEmail(input.email),
    instagram: validateInstagram(input.instagram),
    tiktok: validateTiktok(input.tiktok),
    referredBy: validateReferredBy(input.referredBy),
    city: validateCity(input.city),
  };
  return Object.fromEntries(Object.entries(checks).filter(([, v]) => v)) as FieldErrors;
}

export function validateRegistration(input: RegistrationInput): FieldErrors {
  const errors = validateDetails(input);
  if (!isCategory(input.category)) errors.category = "Bitte wähle eine Kategorie.";
  return errors;
}

/** Human-facing registration number, e.g. 7 → "#0007". Derived from the auto-incrementing DB id. */
export const formatRegistrationNumber = (id: number) => `#${String(id).padStart(4, "0")}`;

export const MEDIA_CONSENT_TEXT =
  "Ich nehme zur Kenntnis, dass auf dem Event Foto- und Videoaufnahmen gemacht werden, auf denen ich zu sehen sein kann.";

/** Parses a German-style euro input ("25", "25,50", "25.50 €") into cents, or null if invalid. */
export function parseEuroToCents(value: string): number | null {
  const v = value.replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const cents = Math.round(Number(v) * 100);
  return cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );

/** All requested amounts are net prices – shown everywhere with this note. */
export const NET_NOTE = "zzgl. Steuern";
export const formatNet = (cents: number) => `${formatEuro(cents)} ${NET_NOTE}`;
