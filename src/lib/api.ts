import type { EventSettings, PublicEvent } from "../../shared/event";
import type { MailTemplates } from "../../shared/mail-template";
import type { Survey, SurveyAnswers } from "../../shared/survey";
import type { Product } from "../../shared/product";
import type { FieldErrors, RegistrationInput } from "../../shared/registration";
import type { AdminIdentity, Permission } from "../../shared/admin";
import type { CheckinDesign, FormConfig, Legal } from "../../shared/site";
import { SecureContextError, seal } from "./secure";
export interface SiteConfig {
  form: FormConfig;
  legal: Legal;
  checkin: CheckinDesign;
  /** Home page welcome block ({ticketpreis} placeholder, image = mail-images id). */
  home: { welcomeText: string; welcomeImage: string };
}

export interface MailImage {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export type SecretKey = "smtpPassword" | "stripeSecretKey" | "paypalClientSecret";

export interface AdminSettings {
  settings: EventSettings;
  mailTemplates: MailTemplates;
  secretsSet: Record<SecretKey, boolean>;
  survey: Survey;
  product: Product;
  surveySentAt: string | null;
  mailProvider: "smtp" | "resend" | null;
  mailConfigured: boolean;
  paymentProviders: { stripe: boolean; paypal: boolean };
}

export interface AdminAccount {
  id: number;
  username: string;
  isSuper: boolean;
  permissions: Permission[];
  active: boolean;
  createdAt: string;
}

export interface LogEntry {
  id: number;
  createdAt: string;
  username: string | null;
  action: string;
  target: string | null;
  details: string | null;
  registrationId: number | null;
  /** True when this action can still be undone (and hasn't been yet). */
  undoable: boolean;
  undoneAt: string | null;
  undoneBy: string | null;
}

export type LogFilter = Partial<Record<"action" | "user" | "from" | "to" | "q", string>>;

export interface Registration {
  id: number;
  category: string;
  /** Künstlername / Stagename. */
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  instagram: string | null;
  tiktok: string | null;
  referredBy: string | null;
  city: string | null;
  /** Answers to custom form questions (JSON, see parseExtra in shared/site.ts). */
  extra: string | null;
  status: string;
  mediaConsentAt: string | null;
  amountCents: number | null;
  createdAt: string;
  ticketToken: string | null;
  checkedInAt: string | null;
  emailSentAt: string | null;
  revision: number;
  paymentProvider: string | null;
  paymentRef: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

/**
 * Sends a JSON body encrypted end-to-end (see secure.ts) – used for everything containing
 * passwords, login or personal data. Encryption failures surface as a normal ApiError.
 */
async function sealedRequest<T>(url: string, method: string, body: Record<string, unknown>): Promise<T> {
  let sealed;
  try {
    sealed = await seal(body);
  } catch (err) {
    throw new ApiError(err instanceof SecureContextError ? err.message : "Verschlüsselung fehlgeschlagen. Bitte Seite neu laden.", 0);
  }
  return request<T>(url, { method, body: JSON.stringify({ sealed }) });
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? "Ein unerwarteter Fehler ist aufgetreten.", res.status, data.fieldErrors);
  }
  return data as T;
}

export const api = {
  event: () => request<{ settings: PublicEvent }>("/api/event"),
  settings: () => request<AdminSettings>("/api/admin/settings"),
  saveSettings: (settings: EventSettings, mailTemplates: MailTemplates, survey: Survey, product: Product, clear: Partial<Record<SecretKey, boolean>> = {}) =>
    sealedRequest<AdminSettings>("/api/admin/settings", "PUT", {
      ...settings,
      mailTemplates,
      survey,
      product,
      ...Object.fromEntries(Object.entries(clear).map(([k, v]) => [`${k}Clear`, v])),
    }),
  testPayment: (provider: "stripe" | "paypal", settings: Pick<EventSettings, "stripeSecretKey" | "paypalClientId" | "paypalClientSecret" | "paypalMode">) =>
    sealedRequest<{ ok: true; message: string }>("/api/admin/settings/test-payment", "POST", { provider, ...settings }),
  testMail: (to: string, template?: string) => sealedRequest<{ ok: true }>("/api/admin/settings/test-mail", "POST", { to, template }),
  checkin: (ticket: string, confirm = false) => request<{ registration: Registration; alreadyCheckedIn: boolean }>("/api/admin/checkin", { method: "POST", body: JSON.stringify({ ticket, confirm }) }),
  siteConfig: () => request<SiteConfig>("/api/admin/site"),
  saveSiteConfig: (config: Partial<SiteConfig>) => request<SiteConfig>("/api/admin/site", { method: "PUT", body: JSON.stringify(config) }),
  legal: (page: string) => request<{ title: string; text: string; event: string }>(`/api/legal/${encodeURIComponent(page)}`),
  register: (input: RegistrationInput & { extra: Record<string, string>; mediaConsent: boolean; website?: string }) =>
    sealedRequest<{ ok: true; id: number }>("/api/registrations", "POST", { ...input }),

  session: () => request<{ authenticated: boolean; user?: AdminIdentity }>("/api/admin/session"),
  login: (username: string, password: string) => sealedRequest<{ ok: true; user: AdminIdentity }>("/api/admin/login", "POST", { username, password }),
  logout: () => request<{ ok: true }>("/api/admin/logout", { method: "POST" }),

  listRegistrations: () => request<{ registrations: Registration[] }>("/api/admin/registrations"),
  updateStatus: (id: number, revision: number, status: string, amountCents?: number) =>
    request<{ registration: Registration }>(`/api/admin/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, amountCents, revision, confirmEmail: true }),
    }),
  sendPaymentReminder: (id: number) => request<{ ok: true }>(`/api/admin/registrations/${id}/reminder`, { method: "POST" }),
  deleteRegistration: (id: number) =>
    request<{ ok: true }>(`/api/admin/registrations/${id}`, { method: "DELETE" }),

  /** Requires the credentials of a super user (re-authentication), sent encrypted. */
  resetRegistrations: (confirm: string, username: string, password: string) =>
    sealedRequest<{ ok: true; deleted: number }>("/api/admin/registrations/reset", "POST", { confirm, username, password }),

  listUsers: () => request<{ users: AdminAccount[]; encryption: "env" | "db" }>("/api/admin/users"),
  createUser: (input: { username: string; password: string; passwordConfirm: string; permissions: Permission[]; isSuper: boolean }) =>
    sealedRequest<{ user: AdminAccount }>("/api/admin/users", "POST", input),
  updateUser: (id: number, patch: Partial<{ permissions: Permission[]; isSuper: boolean; active: boolean; password: string; passwordConfirm: string }>) =>
    sealedRequest<{ user: AdminAccount }>(`/api/admin/users/${id}`, "PATCH", patch),
  deleteUser: (id: number) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  logs: (filter: LogFilter) => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
    return request<{ entries: LogEntry[]; truncated: boolean; users: string[]; retentionDays: number }>(`/api/admin/logs${qs ? `?${qs}` : ""}`);
  },
  paymentStatus: (ref: string) =>
    request<{
      test: boolean;
      status: string;
      provider: string | null;
      providers: ("stripe" | "paypal" | "simulation")[];
      amount: string | null;
      total: string | null;
      number: string;
      name: string;
      event: string;
      product: { name: string; description: string; image: string | null; vatRate: number; net: string | null; vat: string | null };
    }>(`/api/payments/status?ref=${encodeURIComponent(ref)}`),
  createTestCheckout: () => request<{ url: string }>("/api/admin/settings/test-checkout", { method: "POST" }),
  startPayment: (ref: string, provider: "stripe" | "paypal" | "simulation") => request<{ url: string }>("/api/payments/start", { method: "POST", body: JSON.stringify({ ref, provider }) }),
  mailImages: () => request<{ images: MailImage[] }>("/api/admin/mail-images"),
  uploadMailImage: (name: string, data: string) => sealedRequest<{ image: MailImage }>("/api/admin/mail-images", "POST", { name, data }),
  deleteMailImage: (id: string) => request<{ ok: true }>(`/api/admin/mail-images/${id}`, { method: "DELETE" }),
  surveyResults: () =>
    request<{ survey: Survey; sentAt: string | null; sent: number; checkedIn: number; responses: { id: number; createdAt: string; answers: SurveyAnswers }[] }>("/api/admin/survey/results"),
  sendSurvey: () => request<{ ok: true; sent: number; failed: number }>("/api/admin/survey/send", { method: "POST" }),
  publicSurvey: (t: string) =>
    request<{ event: string; title: string; intro: string; thanks: string; questions: Survey["questions"]; answered: boolean }>(`/api/survey?t=${encodeURIComponent(t)}`),
  submitSurvey: (t: string, answers: SurveyAnswers) => sealedRequest<{ ok: true; thanks: string }>("/api/survey", "POST", { t, answers }),
  checkUndo: (id: number) => request<{ ok: boolean; warning: string | null }>(`/api/admin/logs/${id}/undo`),
  undoLog: (id: number, notify = false) =>
    request<{ ok: true; message: string }>(`/api/admin/logs/${id}/undo`, { method: "POST", body: JSON.stringify({ notify }) }),

  async exportCsv(): Promise<void> {
    const res = await fetch("/api/admin/registrations?format=csv", { credentials: "same-origin" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.error ?? "Export fehlgeschlagen.", res.status);
    }
    const blob = await res.blob();
    const name =
      res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "artistroom-anmeldungen.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Lets an open admin tab refresh immediately when a registration is submitted in the same browser.
export const REGISTRATION_CHANNEL = "artistroom-registrations";
// Lets open public pages pick up saved event settings immediately (same browser); others poll.
export const EVENT_CHANNEL = "artistroom-event";

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));
}
