/*
 * E-mail templates for the status mails (kostenlos, zahlung_angefordert, bezahlt, abgelehnt).
 * Shared by the server (sending) and the settings page (live preview) so both render identically.
 * Body text supports placeholders like {vorname} and simple formatting (**fett**, *kursiv*,
 * blank line = new paragraph). The design is a "Baukasten": an ordered list of blocks
 * (logo, title, text, details, QR code, payment button, footer) plus colours and typography.
 */

// "eingegangen" = confirmation right after a registration was submitted (not a stored status).
// "umfrage" = invitation to the survey after the event (sent to everyone who checked in).
// "zahlungserinnerung" = reminder sent by button while a payment is still pending.
export const TEMPLATE_STATUSES = ["eingegangen", "kostenlos", "zahlung_angefordert", "zahlungserinnerung", "bezahlt", "abgelehnt", "umfrage"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
export const isTemplateStatus = (s: string): s is TemplateStatus => (TEMPLATE_STATUSES as readonly string[]).includes(s);

export const TEMPLATE_LABELS: Record<TemplateStatus, string> = {
  eingegangen: "📨 Anmeldung eingegangen",
  kostenlos: "🎁 Kostenlos (Ticket)",
  zahlung_angefordert: "💳 Kostenpflichtig (Zahlung anfordern)",
  bezahlt: "✅ Bezahlt (Ticket)",
  abgelehnt: "❌ Abgelehnt",
  umfrage: "📊 Umfrage-Einladung",
  zahlungserinnerung: "🔔 Zahlungserinnerung",
};

export const BLOCKS = [
  { id: "logo", label: "Logo" },
  { id: "titel", label: "Überschrift" },
  { id: "text", label: "Text" },
  { id: "details", label: "Event-Details" },
  { id: "qr", label: "QR-Code (nur Ticket-Mails)" },
  { id: "zahlung", label: "Button (Zahlung / Umfrage)" },
  { id: "bild1", label: "Bild 1" },
  { id: "bild2", label: "Bild 2" },
  { id: "bild3", label: "Bild 3" },
  { id: "footer", label: "Fußzeile" },
] as const;
export type BlockId = (typeof BLOCKS)[number]["id"];

export const BACKGROUNDS = [
  { id: "dunkel", label: "Dunkel (wie die Webseite)" },
  { id: "lila", label: "Lila" },
  { id: "verlauf", label: "Lila-Verlauf" },
  { id: "graffiti", label: "Graffiti (Spray-Farben)" },
  { id: "hell", label: "Hell" },
  { id: "eigene", label: "Eigene Farbe" },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export const FONTS = [
  { id: "modern", label: "Modern (serifenlos)", css: "Helvetica, Arial, sans-serif" },
  { id: "klassisch", label: "Klassisch (Serifen)", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Schreibmaschine", css: "'Courier New', Courier, monospace" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

export const FONT_SIZES = [
  { id: "klein", label: "Klein", px: 14 },
  { id: "normal", label: "Normal", px: 16 },
  { id: "gross", label: "Groß", px: 18 },
] as const;
export type FontSizeId = (typeof FONT_SIZES)[number]["id"];

export interface MailDesign {
  blocks: { id: BlockId; enabled: boolean }[];
  background: BackgroundId;
  /** Used for background "eigene". */
  backgroundColor: string;
  accentColor: string;
  font: FontId;
  fontSize: FontSizeId;
  align: "left" | "center";
  qrSize: number;
  buttonText: string;
  footer: string;
  /** Uploaded image id used instead of the Artistroom logo ("" = default logo). */
  logoImage: string;
  /** External logo image (https URL) – used when no uploaded logo is chosen. */
  logoUrl: string;
  /** Uploaded images for the image blocks. */
  /** Uploaded image (`imageId`) or external image (`url`, https) per image block. */
  images: Record<ImageSlot, { imageId: string; url: string; width: number; link: string }>;
}

export const IMAGE_SLOTS = ["bild1", "bild2", "bild3"] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
const IMAGE_ID = /^[0-9a-f-]{36}$/;
/** Only plain https URLs (no quotes/whitespace) are accepted for links and external images. */
export const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v.trim()) ? v.trim().slice(0, 500) : "");

export interface MailTemplate {
  subject: string;
  title: string;
  body: string;
}

export interface MailTemplates {
  /** Send the "eingegangen" mail automatically after each registration. */
  sendConfirmation: boolean;
  design: MailDesign;
  templates: Record<TemplateStatus, MailTemplate>;
}

export const PLACEHOLDERS = [
  { key: "vorname", label: "Vorname (sonst Künstlername)" },
  { key: "name", label: "Künstlername" },
  { key: "nummer", label: "Anmeldenummer" },
  { key: "kategorie", label: "Kategorie" },
  { key: "event", label: "Event-Name" },
  { key: "datum", label: "Datum & Uhrzeit" },
  { key: "ort", label: "Ort" },
  { key: "betrag", label: "Betrag" },
  { key: "zahlungslink", label: "Zahlungslink" },
  { key: "umfragelink", label: "Umfrage-Link" },
] as const;
export type MailVars = Record<(typeof PLACEHOLDERS)[number]["key"], string>;

export const DEFAULT_MAIL_TEMPLATES: MailTemplates = {
  sendConfirmation: true,
  design: {
    blocks: [
      { id: "logo", enabled: true },
      { id: "titel", enabled: true },
      { id: "text", enabled: true },
      { id: "qr", enabled: true },
      { id: "zahlung", enabled: true },
      { id: "details", enabled: true },
      { id: "footer", enabled: true },
      { id: "bild1", enabled: false },
      { id: "bild2", enabled: false },
      { id: "bild3", enabled: false },
    ],
    background: "dunkel",
    backgroundColor: "#1a1033",
    accentColor: "#8b5cf6",
    font: "modern",
    fontSize: "normal",
    align: "center",
    qrSize: 220,
    buttonText: "Jetzt bezahlen",
    footer: "Bei Fragen antworte einfach auf diese E-Mail.",
    logoImage: "",
    logoUrl: "",
    images: { bild1: { imageId: "", url: "", width: 520, link: "" }, bild2: { imageId: "", url: "", width: 520, link: "" }, bild3: { imageId: "", url: "", width: 520, link: "" } },
  },
  templates: {
    eingegangen: {
      subject: "{event}: Anmeldung eingegangen · {nummer}",
      title: "Danke für deine Anmeldung!",
      body: "Hallo {vorname},\n\nwir haben deine Anmeldung **{nummer}** als **{kategorie}** erhalten. Unser Team prüft sie und meldet sich per E-Mail bei dir.\n\nBis bald bei **{event}**!",
    },
    kostenlos: {
      subject: "{event}: Dein kostenloses Ticket · {nummer}",
      title: "Du bist dabei! 🎉",
      body: "Hallo {vorname},\n\ndeine Anmeldung **{nummer}** wurde angenommen – dein Ticket ist **kostenlos**.\n\nZeige den QR-Code am Einlass vor. Er ist nur einmal gültig.",
    },
    zahlung_angefordert: {
      subject: "{event}: Bitte Ticket bezahlen · {nummer}",
      title: "Fast geschafft!",
      body: "Hallo {vorname},\n\ndeine Anmeldung **{nummer}** wurde angenommen. Bitte zahle **{betrag}** über den Button unten und gib **{nummer}** als Referenz an.\n\nSobald die Zahlung bei uns eingegangen ist, bekommst du dein Ticket per E-Mail.",
    },
    bezahlt: {
      subject: "{event}: Zahlung erhalten – dein Ticket · {nummer}",
      title: "Danke für deine Zahlung!",
      body: "Hallo {vorname},\n\nwir haben **{betrag}** erhalten. Hier ist dein Ticket für **{event}**.\n\nZeige den QR-Code am Einlass vor. Er ist nur einmal gültig.",
    },
    zahlungserinnerung: {
      subject: "{event}: Erinnerung – dein Ticket ist noch nicht bezahlt · {nummer}",
      title: "Kleine Erinnerung 🔔",
      body: "Hallo {vorname},\n\nfür deine Anmeldung **{nummer}** ist die Zahlung von **{betrag}** noch offen. Über den Button unten kommst du direkt zum Checkout – dort kannst du mit PayPal oder Karte bezahlen.\n\nSobald die Zahlung bestätigt ist, bekommst du dein QR-Ticket automatisch per E-Mail.",
    },
    umfrage: {
      subject: "{event}: Wie war's? Deine Meinung zählt",
      title: "Danke, dass du da warst! 🙌",
      body: "Hallo {vorname},\n\nschön, dass du bei **{event}** dabei warst! Hilf uns, das nächste Event noch besser zu machen – die Umfrage dauert nur ein paar Minuten.",
    },
    abgelehnt: {
      subject: "{event}: Deine Anmeldung · {nummer}",
      title: "Leider hat es nicht geklappt",
      body: "Hallo {vorname},\n\nleider können wir deine Anmeldung **{nummer}** diesmal nicht berücksichtigen. Ein bisheriges Ticket ist nicht mehr gültig.\n\nWir hoffen, dich beim nächsten Mal zu sehen!",
    },
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = <T extends string>(v: unknown, allowed: readonly { id: T }[], fallback: T): T =>
  allowed.some((a) => a.id === v) ? (v as T) : fallback;
const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fallback);

/** Validates stored/submitted templates and fills anything missing with the defaults. */
export function normalizeMailTemplates(input: unknown): MailTemplates {
  const src = (input && typeof input === "object" ? input : {}) as Partial<MailTemplates>;
  const d = (src.design ?? {}) as Partial<MailDesign>;
  const def = DEFAULT_MAIL_TEMPLATES.design;
  // Keep the admin's order, drop unknown blocks, append blocks that are missing.
  const seen = new Set<string>();
  const blocks = (Array.isArray(d.blocks) ? d.blocks : [])
    .filter((b) => b && BLOCKS.some((x) => x.id === b.id) && !seen.has(b.id) && seen.add(b.id))
    .map((b) => ({ id: b.id, enabled: b.enabled !== false }));
  for (const b of def.blocks) if (!seen.has(b.id)) blocks.push({ ...b });
  const templates = {} as Record<TemplateStatus, MailTemplate>;
  for (const s of TEMPLATE_STATUSES) {
    const t = (src.templates?.[s] ?? {}) as Partial<MailTemplate>;
    const fallback = DEFAULT_MAIL_TEMPLATES.templates[s];
    templates[s] = {
      subject: text(t.subject, fallback.subject, 200).replace(/[\r\n]+/g, " ") || fallback.subject,
      title: text(t.title, fallback.title, 200),
      body: text(t.body, fallback.body, 5000),
    };
  }
  return {
    sendConfirmation: src.sendConfirmation !== false,
    design: {
      blocks,
      background: pick(d.background, BACKGROUNDS, def.background),
      backgroundColor: typeof d.backgroundColor === "string" && HEX.test(d.backgroundColor) ? d.backgroundColor : def.backgroundColor,
      accentColor: typeof d.accentColor === "string" && HEX.test(d.accentColor) ? d.accentColor : def.accentColor,
      font: pick(d.font, FONTS, def.font),
      fontSize: pick(d.fontSize, FONT_SIZES, def.fontSize),
      align: d.align === "left" ? "left" : "center",
      qrSize: Number.isInteger(d.qrSize) && d.qrSize! >= 120 && d.qrSize! <= 360 ? d.qrSize! : def.qrSize,
      buttonText: text(d.buttonText, def.buttonText, 60) || def.buttonText,
      footer: text(d.footer, def.footer, 500),
      logoImage: typeof d.logoImage === "string" && IMAGE_ID.test(d.logoImage) ? d.logoImage : "",
      logoUrl: httpsUrl(d.logoUrl),
      images: Object.fromEntries(
        IMAGE_SLOTS.map((slot) => {
          const img = (d.images?.[slot] ?? {}) as Partial<MailDesign["images"][ImageSlot]>;
          const link = httpsUrl(img.link);
          return [slot, { imageId: typeof img.imageId === "string" && IMAGE_ID.test(img.imageId) ? img.imageId : "", url: httpsUrl(img.url), width: Number.isInteger(img.width) && img.width! >= 60 && img.width! <= 560 ? img.width! : 520, link }];
        }),
      ) as MailDesign["images"],
    },
    templates,
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (s: string, vars: MailVars) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k as keyof MailVars] : m));

/** Escapes, fills placeholders and applies **bold** / *italic*. */
const inline = (s: string, vars: MailVars) =>
  escapeHtml(fill(s, vars))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");

const plain = (s: string, vars: MailVars) => fill(s, vars).replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");

function palette(design: MailDesign) {
  switch (design.background) {
    case "hell":
      return { outer: "#f2f2f5", outerImage: "", card: "#ffffff", text: "#1b1b1f", muted: "#5d5d66", border: "#e3e3e8" };
    case "lila":
      return { outer: "#1a1033", outerImage: "", card: "#241645", text: "#f5f3ff", muted: "#c4b5fd", border: "#3b2a6b" };
    case "verlauf":
      return { outer: "#1a1033", outerImage: "linear-gradient(160deg,#4c1d95 0%,#1a1033 45%,#020203 100%)", card: "#120c22", text: "#f5f3ff", muted: "#c4b5fd", border: "#2e2152" };
    case "graffiti":
      return {
        outer: "#111111",
        outerImage:
          "radial-gradient(circle at 15% 20%,rgba(236,72,153,.45) 0,transparent 35%),radial-gradient(circle at 85% 30%,rgba(139,92,246,.5) 0,transparent 38%),radial-gradient(circle at 50% 90%,rgba(250,204,21,.35) 0,transparent 40%)",
        card: "#0b0b0d",
        text: "#ffffff",
        muted: "#d4d4d8",
        border: "#2b2b30",
      };
    case "eigene":
      return { outer: design.backgroundColor, outerImage: "", card: "#0b0b0d", text: "#f5f5f7", muted: "#a1a1a8", border: "#29292d" };
    default:
      return { outer: "#020203", outerImage: "", card: "#0f0f12", text: "#f5f5f7", muted: "#a1a1a8", border: "#29292d" };
  }
}

export interface RenderOptions {
  /** Image source for the QR code (`cid:…` when sending, data URL in the preview); omit for mails without ticket. */
  qrSrc?: string;
  /** Absolute URL of the default logo image. */
  logoUrl?: string;
  /** Absolute URL for an uploaded image id (`/api/mail-images/<id>`). */
  imageUrl?: (id: string) => string;
  /** Maps an external image URL to the src used in the mail (inline `cid:` when sending). */
  externalUrl?: (url: string) => string;
  paymentUrl?: string;
  /** Personal survey link (survey invitation). */
  surveyUrl?: string;
}

/** Renders subject, HTML and plain-text version for one status mail. */
export function renderMail(all: MailTemplates, status: TemplateStatus, vars: MailVars, opts: RenderOptions = {}) {
  const { design } = all;
  const t = all.templates[status];
  const p = palette(design);
  const font = FONTS.find((f) => f.id === design.font)!.css;
  const size = FONT_SIZES.find((f) => f.id === design.fontSize)!.px;
  const align = design.align;
  const accent = design.accentColor;
  const isTicket = status === "kostenlos" || status === "bezahlt";
  const isPayment = (status === "zahlung_angefordert" || status === "zahlungserinnerung") && Boolean(opts.paymentUrl);

  const html: string[] = [];
  const txt: string[] = [];
  for (const block of design.blocks) {
    if (!block.enabled) continue;
    switch (block.id) {
      case "logo":
        if ((design.logoImage && opts.imageUrl) || design.logoUrl) {
          const src = design.logoImage && opts.imageUrl ? opts.imageUrl(design.logoImage) : (opts.externalUrl ?? ((u: string) => u))(design.logoUrl);
          html.push(`<tr><td align="${align}" style="padding:28px 32px 4px"><img src="${escapeHtml(src)}" width="160" alt="${escapeHtml(vars.event)}" style="display:inline-block;max-width:160px;height:auto;border:0"></td></tr>`);
        } else if (opts.logoUrl)
          // Default logo sits on black, so it always gets a dark tile (also on light designs).
          html.push(`<tr><td align="${align}" style="padding:28px 32px 4px"><img src="${escapeHtml(opts.logoUrl)}" width="120" height="120" alt="${escapeHtml(vars.event)}" style="display:inline-block;width:120px;height:120px;border-radius:16px;background:#020203;border:0"></td></tr>`);
        break;
      case "titel":
        if (t.title.trim()) {
          html.push(`<tr><td align="${align}" style="padding:20px 32px 0;font-family:${font};font-size:${size + 10}px;line-height:1.25;font-weight:800;color:${p.text}">${inline(t.title, vars)}</td></tr>`);
          txt.push(plain(t.title, vars).toUpperCase());
        }
        break;
      case "text": {
        const paragraphs = t.body.split(/\n\s*\n/).filter((x) => x.trim());
        html.push(
          `<tr><td align="${align}" style="padding:16px 32px 0;font-family:${font};font-size:${size}px;line-height:1.6;color:${p.text};text-align:${align}">${paragraphs
            .map((x) => `<p style="margin:0 0 14px">${inline(x.trim(), vars)}</p>`)
            .join("")}</td></tr>`,
        );
        txt.push(...paragraphs.map((x) => plain(x.trim(), vars)));
        break;
      }
      case "details": {
        const rows = [
          ["Event", vars.event],
          ["Datum", vars.datum],
          ["Ort", vars.ort],
          ["Anmeldung", `${vars.nummer} · ${vars.kategorie}`],
          ...(status === "zahlung_angefordert" || status === "zahlungserinnerung" || status === "bezahlt" ? [["Betrag", vars.betrag]] : []),
        ].filter(([, v]) => v);
        html.push(
          `<tr><td style="padding:12px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${p.border};border-left:4px solid ${accent};border-radius:10px;font-family:${font};font-size:${size - 2}px;color:${p.text}">${rows
            .map(([k, v]) => `<tr><td style="padding:8px 14px;color:${p.muted};width:110px;vertical-align:top">${k}</td><td style="padding:8px 14px;font-weight:600">${escapeHtml(v)}</td></tr>`)
            .join("")}</table></td></tr>`,
        );
        txt.push(rows.map(([k, v]) => `${k}: ${v}`).join("\n"));
        break;
      }
      case "qr":
        if (isTicket && opts.qrSrc) {
          html.push(
            `<tr><td align="center" style="padding:20px 32px 4px"><div style="display:inline-block;padding:12px;background:#ffffff;border-radius:14px;border:3px solid ${accent}"><img src="${escapeHtml(opts.qrSrc)}" width="${design.qrSize}" height="${design.qrSize}" alt="QR-Ticket ${escapeHtml(vars.nummer)}" style="display:block;width:${design.qrSize}px;height:${design.qrSize}px;border:0"></div><div style="padding-top:8px;font-family:${font};font-size:12px;color:${p.muted}">Ticket ${escapeHtml(vars.nummer)} · nur einmal gültig</div></td></tr>`,
          );
          txt.push("Dein QR-Ticket ist in dieser E-Mail enthalten. Bitte zeige es am Einlass vor.");
        }
        break;
      case "bild1":
      case "bild2":
      case "bild3": {
        const img = design.images[block.id];
        const src = img.imageId && opts.imageUrl ? opts.imageUrl(img.imageId) : img.url ? (opts.externalUrl ?? ((u: string) => u))(img.url) : "";
        if (src) {
          const tag = `<img src="${escapeHtml(src)}" width="${img.width}" alt="" style="display:block;width:100%;max-width:${img.width}px;height:auto;border:0;border-radius:10px;margin:0 auto">`;
          html.push(`<tr><td align="center" style="padding:16px 32px 4px">${img.link ? `<a href="${escapeHtml(img.link)}">${tag}</a>` : tag}</td></tr>`);
        }
        break;
      }
      case "zahlung":
        if (status === "umfrage" && opts.surveyUrl) {
          html.push(
            `<tr><td align="${align}" style="padding:18px 32px 4px"><a href="${escapeHtml(opts.surveyUrl)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${accent};color:#ffffff;font-family:${font};font-size:${size}px;font-weight:700;text-decoration:none">📊 Zur Umfrage</a></td></tr>`,
          );
          txt.push(`Zur Umfrage: ${opts.surveyUrl}`);
        }
        if (isPayment) {
          html.push(
            `<tr><td align="${align}" style="padding:18px 32px 4px"><a href="${escapeHtml(opts.paymentUrl!)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${accent};color:#ffffff;font-family:${font};font-size:${size}px;font-weight:700;text-decoration:none">${escapeHtml(fill(design.buttonText, vars))} · ${escapeHtml(vars.betrag)}</a></td></tr>`,
          );
          txt.push(`${fill(design.buttonText, vars)} (${vars.betrag}): ${opts.paymentUrl}`);
        }
        break;
      case "footer":
        if (design.footer.trim()) {
          html.push(`<tr><td align="${align}" style="padding:20px 32px 28px;font-family:${font};font-size:12px;line-height:1.5;color:${p.muted}">${inline(design.footer, vars)}</td></tr>`);
          txt.push(plain(design.footer, vars));
        }
        break;
    }
  }
  // Ticket/payment info must never get lost, even if the admin disabled the block.
  if (isTicket && opts.qrSrc && !design.blocks.some((b) => b.id === "qr" && b.enabled)) txt.push("Dein QR-Ticket findest du im Anhang.");
  if (status === "umfrage" && opts.surveyUrl && !design.blocks.some((b) => b.id === "zahlung" && b.enabled)) {
    html.push(`<tr><td style="padding:12px 32px;font-family:${font};font-size:${size}px;color:${p.text}">Zur Umfrage: <a href="${escapeHtml(opts.surveyUrl)}" style="color:${accent}">${escapeHtml(opts.surveyUrl)}</a></td></tr>`);
    txt.push(`Zur Umfrage: ${opts.surveyUrl}`);
  }
  if (isPayment && !design.blocks.some((b) => b.id === "zahlung" && b.enabled)) {
    html.push(`<tr><td style="padding:12px 32px;font-family:${font};font-size:${size}px;color:${p.text}">Zahlungslink: <a href="${escapeHtml(opts.paymentUrl!)}" style="color:${accent}">${escapeHtml(opts.paymentUrl!)}</a></td></tr>`);
    txt.push(`Zahlungslink: ${opts.paymentUrl}`);
  }

  const outerStyle = `margin:0;padding:0;background-color:${p.outer};${p.outerImage ? `background-image:${p.outerImage};` : ""}`;
  const document = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(fill(t.subject, vars))}</title></head><body style="${outerStyle}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${outerStyle}"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${p.card};border-radius:18px;border:1px solid ${p.border};border-top:4px solid ${accent}">${html.join("")}</table></td></tr></table></body></html>`;

  return { subject: fill(t.subject, vars), html: document, text: txt.join("\n\n") };
}

/** Example values for the preview in the settings. */
export const SAMPLE_VARS: MailVars = {
  vorname: "Alex",
  name: "DJ Alex",
  nummer: "#0042",
  kategorie: "DJ",
  event: "Artistroom",
  datum: "30. Mai 2027 · 19:00 Uhr",
  ort: "Spitalerstraße 3, Hamburg",
  betrag: "22 € zzgl. Steuern",
  zahlungslink: "https://example.com/zahlung",
  umfragelink: "https://example.com/umfrage",
};
