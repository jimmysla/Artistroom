import { BLOCKS, TEMPLATE_LABELS, normalizeMailTemplates, type MailTemplates } from "../../shared/mail-template.js";
import { normalizeProduct } from "../../shared/product.js";
import { normalizeSurvey } from "../../shared/survey.js";
import { normalizeRegistrationForm } from "../../shared/registration-form.js";

/*
 * Human-readable descriptions of changes to the structured settings (mail templates, survey,
 * checkout product) for the audit log – so every change of the website is traceable in detail.
 */
const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `„${s.length > 60 ? `${s.slice(0, 57)}…` : s || "–"}“`;
};
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

const DESIGN_LABELS: Record<string, string> = {
  background: "Hintergrund", backgroundColor: "Hintergrundfarbe", accentColor: "Akzentfarbe", font: "Schriftart", fontSize: "Schriftgröße",
  align: "Ausrichtung", qrSize: "QR-Größe", buttonText: "Button-Text", footer: "Fußzeile", logoImage: "Logo-Bild", logoUrl: "Logo-Link",
};

export function describeTemplateChanges(beforeRaw: unknown, afterRaw: unknown): string[] {
  const before = normalizeMailTemplates(beforeRaw);
  const after: MailTemplates = normalizeMailTemplates(afterRaw);
  const out: string[] = [];
  if (before.sendConfirmation !== after.sendConfirmation) out.push(`Eingangsbestätigung ${after.sendConfirmation ? "eingeschaltet" : "ausgeschaltet"}`);
  for (const [status, label] of Object.entries(TEMPLATE_LABELS) as [keyof MailTemplates["templates"], string][]) {
    const a = before.templates[status];
    const b = after.templates[status];
    const fields = [a.subject !== b.subject && `Betreff → ${short(b.subject)}`, a.title !== b.title && `Überschrift → ${short(b.title)}`, a.body !== b.body && "Text"].filter(Boolean);
    if (fields.length) out.push(`Vorlage ${label}: ${fields.join(", ")}`);
  }
  for (const [key, label] of Object.entries(DESIGN_LABELS)) {
    const a = (before.design as unknown as Record<string, unknown>)[key];
    const b = (after.design as unknown as Record<string, unknown>)[key];
    if (changed(a, b)) out.push(`Design ${label}: ${short(a)} → ${short(b)}`);
  }
  const blockName = (id: string) => BLOCKS.find((x) => x.id === id)?.label ?? id;
  if (changed(before.design.blocks.map((b) => b.id), after.design.blocks.map((b) => b.id))) out.push(`Baukasten-Reihenfolge: ${after.design.blocks.map((b) => blockName(b.id)).join(" › ")}`);
  for (const b of after.design.blocks) {
    const old = before.design.blocks.find((x) => x.id === b.id);
    if (old && old.enabled !== b.enabled) out.push(`Baustein ${blockName(b.id)} ${b.enabled ? "eingeschaltet" : "ausgeschaltet"}`);
  }
  for (const slot of Object.keys(after.design.images) as (keyof MailTemplates["design"]["images"])[]) {
    if (changed(before.design.images[slot], after.design.images[slot])) out.push(`${blockName(slot)} geändert`);
  }
  return out;
}

export function describeSurveyChanges(beforeRaw: unknown, afterRaw: unknown): string[] {
  const a = normalizeSurvey(beforeRaw);
  const b = normalizeSurvey(afterRaw);
  const out: string[] = [];
  if (a.enabled !== b.enabled) out.push(`Umfrage-Versand ${b.enabled ? "eingeschaltet" : "ausgeschaltet"}`);
  if (a.sendAt !== b.sendAt) out.push(`Umfrage-Versandzeit ${short(a.sendAt)} → ${short(b.sendAt)}`);
  if (a.title !== b.title) out.push(`Umfrage-Titel → ${short(b.title)}`);
  if (a.intro !== b.intro) out.push("Umfrage-Einleitung geändert");
  if (a.thanks !== b.thanks) out.push("Umfrage-Danke-Text geändert");
  const ids = (s: typeof a) => s.questions.map((q) => q.id);
  for (const q of b.questions) {
    const old = a.questions.find((x) => x.id === q.id);
    if (!old) out.push(`Frage hinzugefügt: ${short(q.label)}`);
    else if (changed(old, q)) out.push(`Frage geändert: ${short(q.label)}`);
  }
  for (const q of a.questions) if (!b.questions.some((x) => x.id === q.id)) out.push(`Frage entfernt: ${short(q.label)}`);
  const kept = ids(a).filter((id) => ids(b).includes(id));
  if (changed(kept, ids(b).filter((id) => kept.includes(id)))) out.push("Fragen umsortiert");
  return out;
}

export function describeProductChanges(beforeRaw: unknown, afterRaw: unknown): string[] {
  const a = normalizeProduct(beforeRaw);
  const b = normalizeProduct(afterRaw);
  const labels: Record<string, string> = { name: "Produktname", description: "Produktbeschreibung", imageId: "Produktbild", imageUrl: "Produktbild-Link", vatRate: "MwSt." };
  return Object.entries(labels)
    .filter(([k]) => changed((a as unknown as Record<string, unknown>)[k], (b as unknown as Record<string, unknown>)[k]))
    .map(([k, label]) => `${label}: ${short((a as unknown as Record<string, unknown>)[k])} → ${short((b as unknown as Record<string, unknown>)[k])}`);
}

export function describeRegistrationFormChanges(beforeRaw: unknown, afterRaw: unknown): string[] {
  const before = normalizeRegistrationForm(beforeRaw);
  const after = normalizeRegistrationForm(afterRaw);
  const out: string[] = [];
  const texts: [keyof typeof before, string][] = [["categoryTitle", "Überschrift Kategorie"], ["categoryIntro", "Untertitel Kategorie"], ["detailsTitle", "Überschrift Daten"], ["detailsIntro", "Untertitel Daten"]];
  for (const [key, label] of texts) if (changed(before[key], after[key])) out.push(`${label} → ${short(after[key])}`);

  for (const c of after.categories) {
    const old = before.categories.find((x) => x.id === c.id);
    if (!old) out.push(`Kategorie hinzugefügt: ${c.icon} ${c.label}`);
    else {
      const fields = [old.icon !== c.icon && `Emoji ${c.icon}`, old.label !== c.label && `Titel ${short(c.label)}`, old.description !== c.description && "Text", old.color !== c.color && `Farbe ${c.color}`, old.wide !== c.wide && (c.wide ? "breit" : "normal")].filter(Boolean);
      if (fields.length) out.push(`Kategorie ${old.label}: ${fields.join(", ")}`);
    }
  }
  for (const c of before.categories) if (!after.categories.some((x) => x.id === c.id)) out.push(`Kategorie entfernt: ${c.icon} ${c.label}`);
  if (changed(before.categories.filter((c) => after.categories.some((x) => x.id === c.id)).map((c) => c.id), after.categories.filter((c) => before.categories.some((x) => x.id === c.id)).map((c) => c.id))) out.push("Reihenfolge der Kategorien geändert");

  for (const f of after.fields) {
    const old = before.fields.find((x) => x.id === f.id);
    if (!old) out.push(`Feld hinzugefügt: ${short(f.label)}`);
    else if (changed(old, f)) {
      const fields = [old.enabled !== f.enabled && (f.enabled ? "eingeblendet" : "ausgeblendet"), old.required !== f.required && (f.required ? "Pflicht" : "optional"), old.label !== f.label && `Text ${short(f.label)}`, (old.placeholder !== f.placeholder || old.hint !== f.hint || changed(old.options, f.options)) && "Details"].filter(Boolean);
      if (fields.length) out.push(`Feld ${short(old.label)}: ${fields.join(", ")}`);
    }
  }
  for (const f of before.fields) if (!after.fields.some((x) => x.id === f.id)) out.push(`Feld entfernt: ${short(f.label)}`);
  if (changed(before.fields.filter((f) => after.fields.some((x) => x.id === f.id)).map((f) => f.id), after.fields.filter((f) => before.fields.some((x) => x.id === f.id)).map((f) => f.id))) out.push("Reihenfolge der Felder geändert");

  if (changed(before.checkin, after.checkin)) out.push("Check-in-Animation geändert");
  return out;
}
