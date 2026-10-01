import { useEffect, useRef, useState } from "react";
import { api, ApiError, type MailImage } from "../../lib/api";
import { announceEventChange, useEvent } from "../../lib/event";
import {
  BUILTIN_FIELDS,
  CHECKIN_ANIMATIONS,
  CHECKIN_BACKGROUNDS,
  CHECKIN_BLOCKS,
  FIELD_TYPES,
  INPUT_TYPES,
  isBuiltin,
  newCategoryId,
  newCheckinBlockId,
  newFieldId,
  type CheckinBlock,
  type CheckinBlockType,
  type CheckinDesign,
  type FieldType,
  type FormCategory,
  type FormField,
  type RegistrationForm,
} from "../../../shared/registration-form";
import Button from "../Button";
import Alert from "../Alert";
import CategoryCard from "../CategoryCard";
import FormFieldInput from "../FormFieldInput";
import CheckinSplash, { type SplashGuest } from "./CheckinSplash";

type Section = "categories" | "fields" | "checkin";
const HEX = /^#[0-9a-fA-F]{6}$/;
const REPEATABLE: CheckinBlockType[] = ["text", "feld"];
const MAX_IMAGE = 3 * 1024 * 1024;

function move<T>(list: T[], i: number, delta: number): T[] {
  const next = [...list];
  const [item] = next.splice(i, 1);
  next.splice(i + delta, 0, item);
  return next;
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Move / delete buttons of a Baukasten block. */
function BlockButtons({ index, count, onMove, onDelete, deleteLabel }: { index: number; count: number; onMove: (delta: number) => void; onDelete?: () => void; deleteLabel: string }) {
  return (
    <span className="block-move">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Nach oben">↑</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Nach unten">↓</button>
      {onDelete && <button type="button" onClick={onDelete} aria-label={deleteLabel}>✕</button>}
    </span>
  );
}

/** Dashboard → Anmeldung (super users only): categories, data-step Baukasten, check-in animation. */
export default function RegistrationFormSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [section, setSection] = useState<Section>("categories");
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handle = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) return onUnauthorized();
    setMessage("");
    setError(err instanceof ApiError ? err.message : fallback);
  };

  useEffect(() => {
    api.registrationForm().then((r) => { setForm(r.form); setSaved(JSON.stringify(r.form)); }).catch((e) => handle(e, "Die Anmelde-Einstellungen konnten nicht geladen werden."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return <section className="settings-panel"><h1>Anmeldung</h1>{error ? <Alert>{error}</Alert> : <p role="status">Wird geladen…</p>}</section>;

  const dirty = JSON.stringify(form) !== saved;
  const update = (patch: Partial<RegistrationForm>) => { setForm({ ...form, ...patch }); setMessage(""); setError(""); };

  const save = async () => {
    const empty = form.categories.find((c) => !c.label.trim());
    if (empty) return setError("Jede Kategorie braucht eine Überschrift.");
    const badColor = form.categories.find((c) => !HEX.test(c.color));
    if (badColor) return setError(`Bitte für „${badColor.label}“ einen gültigen Farbcode eingeben (z. B. #8b5cf6).`);
    const noOptions = form.fields.find((f) => f.enabled && f.type === "select" && !f.options.some((o) => o.trim()));
    if (noOptions) return setError(`Das Auswahlfeld „${noOptions.label || "Feld"}“ braucht mindestens eine Option.`);
    setBusy(true);
    setError("");
    try {
      const r = await api.saveRegistrationForm(form);
      setForm(r.form);
      setSaved(JSON.stringify(r.form));
      setMessage("✅ Gespeichert – die Anmeldeseite zeigt die Änderungen sofort.");
      announceEventChange();
    } catch (e) {
      handle(e, "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const saveBar = (
    <div className="settings-save regform-save">
      <Button type="button" loading={busy} disabled={!dirty} onClick={save}>Speichern</Button>
      {dirty && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setForm(JSON.parse(saved)); setError(""); }}>Verwerfen</Button>}
      {dirty ? <span className="muted small">Ungespeicherte Änderungen</span> : message && <p>{message}</p>}
    </div>
  );

  return (
    <section className="settings-panel regform-panel">
      <h1>Anmeldung</h1>
      <p className="muted">Kategorien, Formularfelder und die Check-in-Animation der Anmeldung einstellen. Nur Super User sehen diesen Bereich. Bestehende Anmeldungen bleiben beim Ändern erhalten.</p>
      <nav className="settings-tabs" aria-label="Bereiche der Anmeldung">
        {([["categories", "🙋 Wer bist du?"], ["fields", "📝 Deine Daten"], ["checkin", "🎬 Check-in-Animation"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>
      {error && <Alert>{error}</Alert>}

      {section === "categories" && <CategoriesEditor form={form} update={update} />}
      {section === "fields" && <FieldsEditor form={form} update={update} />}
      {section === "checkin" && <CheckinEditor form={form} update={update} onError={(e) => handle(e, "Bild konnte nicht hochgeladen werden.")} />}
      {saveBar}
    </section>
  );
}

/* ---------------- Kategorien ---------------- */

function CategoriesEditor({ form, update }: { form: RegistrationForm; update: (p: Partial<RegistrationForm>) => void }) {
  const [previewId, setPreviewId] = useState("");
  const set = (i: number, patch: Partial<FormCategory>) => update({ categories: form.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => update({ categories: [...form.categories, { id: newCategoryId(), icon: "✨", label: "", description: "", color: "#8b5cf6", wide: false }] });
  const remove = (i: number) => {
    const c = form.categories[i];
    if (window.confirm(`Kategorie „${c.label || "ohne Titel"}“ entfernen? Bestehende Anmeldungen behalten ihre Kategorie.`)) update({ categories: form.categories.filter((_, j) => j !== i) });
  };

  return (
    <div className="regform-section">
      <div className="settings-fields">
        <label className="settings-field">
          Überschrift
          <input className="input" maxLength={120} value={form.categoryTitle} onChange={(e) => update({ categoryTitle: e.target.value })} />
        </label>
        <label className="settings-field">
          Untertitel
          <input className="input" maxLength={500} value={form.categoryIntro} onChange={(e) => update({ categoryIntro: e.target.value })} />
        </label>
      </div>

      <h3>🧱 Kästchen</h3>
      <p className="muted small">Die Farbe bestimmt die Check-in-Animation und die Markierung bei der Auswahl.</p>
      <ol className="question-list">
        {form.categories.map((c, i) => (
          <li key={c.id} className="question-card regform-card" style={{ borderLeftColor: c.color }}>
            <div className="question-head">
              <span className="question-no">{i + 1}</span>
              <strong>{c.icon} {c.label || "Neue Kategorie"}</strong>
              <BlockButtons index={i} count={form.categories.length} onMove={(d) => update({ categories: move(form.categories, i, d) })} onDelete={form.categories.length > 1 ? () => remove(i) : undefined} deleteLabel="Kategorie entfernen" />
            </div>
            <div className="regform-grid">
              <label className="settings-field regform-emoji">
                Emoji
                <input className="input" maxLength={16} value={c.icon} onChange={(e) => set(i, { icon: e.target.value })} />
              </label>
              <label className="settings-field">
                Überschrift
                <input className="input" maxLength={40} placeholder="z. B. Künstler" value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
              </label>
              <label className="settings-field regform-color">
                Farbcode
                <span className="regform-color-row">
                  <input type="color" value={HEX.test(c.color) ? c.color : "#8b5cf6"} onChange={(e) => set(i, { color: e.target.value })} aria-label="Farbe wählen" />
                  <input className="input" maxLength={7} value={c.color} onChange={(e) => set(i, { color: e.target.value.trim() })} aria-label="Farbcode (Hex)" />
                </span>
              </label>
            </div>
            <label className="settings-field">
              Kleiner Text darunter
              <input className="input" maxLength={120} placeholder="z. B. Grafik, Maler, Tattoo, Design & mehr" value={c.description} onChange={(e) => set(i, { description: e.target.value })} />
            </label>
            <div className="question-head">
              <label className="checkbox-inline"><input type="checkbox" checked={c.wide} onChange={(e) => set(i, { wide: e.target.checked })} /> Über die ganze Breite</label>
              <button type="button" className="action-btn action-plain" onClick={() => setPreviewId(c.id)}>🎬 Check-in-Farbe ansehen</button>
            </div>
            {!HEX.test(c.color) && <p className="field-error">Bitte einen Farbcode wie #8b5cf6 eingeben.</p>}
            {previewId === c.id && <div className="regform-color-preview" style={{ background: `radial-gradient(circle at 50% 30%, ${c.color}, #020203)` }} onClick={() => setPreviewId("")}>{c.icon} {c.label}</div>}
          </li>
        ))}
      </ol>
      <div className="question-add">
        <button type="button" className="action-btn action-plain" onClick={add} disabled={form.categories.length >= 24}>+ Kästchen hinzufügen</button>
      </div>

      <h3>👀 Vorschau</h3>
      <div className="regform-preview">
        <h2 className="step-title">{form.categoryTitle}</h2>
        {form.categoryIntro && <p className="step-subtitle">{form.categoryIntro}</p>}
        <div className="category-grid" role="radiogroup" aria-label="Vorschau Kategorien">
          {form.categories.map((c, i) => <CategoryCard key={c.id} label={c.label || "Neue Kategorie"} description={c.description} icon={c.icon} color={HEX.test(c.color) ? c.color : undefined} wide={c.wide} selected={i === 0} onSelect={() => {}} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Deine Daten ---------------- */

const fieldTypeLabel = (t: FieldType) => FIELD_TYPES.find((x) => x.id === t)!.label;

function FieldsEditor({ form, update }: { form: RegistrationForm; update: (p: Partial<RegistrationForm>) => void }) {
  const [preview, setPreview] = useState<Record<string, string>>({});
  const set = (i: number, patch: Partial<FormField>) => update({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const add = (type: FieldType) =>
    update({
      fields: [...form.fields, { id: newFieldId(type), type, enabled: true, required: false, label: "", placeholder: "", hint: "", options: type === "select" ? ["Option 1", "Option 2"] : [] }],
    });

  return (
    <div className="regform-section">
      <div className="settings-fields">
        <label className="settings-field">
          Überschrift
          <input className="input" maxLength={120} value={form.detailsTitle} onChange={(e) => update({ detailsTitle: e.target.value })} />
        </label>
        <label className="settings-field">
          Untertitel
          <input className="input" maxLength={500} value={form.detailsIntro} onChange={(e) => update({ detailsIntro: e.target.value })} />
        </label>
      </div>
      <div className="info-box" role="note">
        <strong>So funktioniert der Baukasten</strong>
        <ul>
          <li>Reihenfolge mit ↑ ↓ ändern, Standardfelder ein- oder ausblenden, eigene Felder, Zwischenüberschriften und Infotexte hinzufügen.</li>
          <li><b>Künstlername</b> und <b>E-Mail</b> sind immer Pflicht – sie werden für Liste, Tickets und E-Mails gebraucht.</li>
          <li>Antworten eigener Felder werden verschlüsselt gespeichert und in der Anmeldung, im CSV-Export und in der Check-in-Animation angezeigt.</li>
        </ul>
      </div>

      <h3>🧱 Bausteine</h3>
      <ol className="question-list">
        {form.fields.map((f, i) => {
          const builtin = isBuiltin(f.id) ? BUILTIN_FIELDS[f.id] : null;
          const isInput = Boolean(builtin) || INPUT_TYPES.includes(f.type);
          return (
            <li key={f.id} className={`question-card ${f.enabled ? "" : "is-off"}`}>
              <div className="question-head">
                <span className="question-no">{i + 1}</span>
                <span className="muted small">{builtin ? `Standardfeld · ${builtin.label}` : fieldTypeLabel(f.type)}</span>
                {!builtin?.locked && <label className="checkbox-inline"><input type="checkbox" checked={f.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} /> Anzeigen</label>}
                {isInput && !builtin?.locked && <label className="checkbox-inline"><input type="checkbox" checked={f.required} disabled={!f.enabled} onChange={(e) => set(i, { required: e.target.checked })} /> Pflicht</label>}
                {builtin?.locked && <span className="user-pill">Immer Pflicht</span>}
                <BlockButtons index={i} count={form.fields.length} onMove={(d) => update({ fields: move(form.fields, i, d) })} onDelete={builtin ? undefined : () => update({ fields: form.fields.filter((_, j) => j !== i) })} deleteLabel="Baustein löschen" />
              </div>
              {f.type === "info" ? (
                <textarea className="input" rows={3} maxLength={1000} placeholder="Infotext…" value={f.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Infotext ${i + 1}`} />
              ) : (
                <input className="input" maxLength={200} placeholder={f.type === "heading" ? "Zwischenüberschrift…" : f.type === "checkbox" ? "Text neben dem Häkchen…" : "Beschriftung des Feldes…"} value={f.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Beschriftung ${i + 1}`} />
              )}
              {isInput && (
                <div className="settings-fields">
                  {f.type !== "checkbox" && f.type !== "select" && (
                    <label className="settings-field">
                      Platzhalter
                      <input className="input input-sm" maxLength={120} value={f.placeholder} onChange={(e) => set(i, { placeholder: e.target.value })} />
                    </label>
                  )}
                  <label className="settings-field">
                    Hinweis unter dem Feld
                    <input className="input input-sm" maxLength={300} value={f.hint} onChange={(e) => set(i, { hint: e.target.value })} />
                  </label>
                </div>
              )}
              {f.type === "select" && (
                <div className="question-options">
                  {f.options.map((o, k) => (
                    <span key={k} className="option-row">
                      <input className="input input-sm" value={o} maxLength={120} onChange={(e) => set(i, { options: f.options.map((x, m) => (m === k ? e.target.value : x)) })} aria-label={`Option ${k + 1}`} />
                      <button type="button" onClick={() => set(i, { options: f.options.filter((_, m) => m !== k) })} aria-label="Option entfernen">✕</button>
                    </span>
                  ))}
                  {f.options.length < 30 && <button type="button" className="action-btn action-plain" onClick={() => set(i, { options: [...f.options, `Option ${f.options.length + 1}`] })}>+ Option</button>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="question-add">
        <span className="muted small">Baustein hinzufügen:</span>
        {FIELD_TYPES.filter((t) => t.id !== "builtin").map((t) => <button key={t.id} type="button" className="action-btn action-plain" onClick={() => add(t.id)}>{t.label}</button>)}
      </div>

      <h3>👀 Vorschau</h3>
      <div className="regform-preview">
        <h2 className="step-title">{form.detailsTitle}</h2>
        {form.detailsIntro && <p className="step-subtitle">{form.detailsIntro}</p>}
        <div className="form">
          {form.fields.filter((f) => f.enabled).map((f) => (
            <FormFieldInput key={f.id} field={{ ...f, label: f.label || "(ohne Beschriftung)" }} value={preview[f.id] ?? ""} onChange={(v) => setPreview((p) => ({ ...p, [f.id]: v }))} onBlur={() => {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Check-in-Animation ---------------- */

const blockLabel = (t: CheckinBlockType) => CHECKIN_BLOCKS.find((b) => b.id === t)!.label;

function CheckinEditor({ form, update, onError }: { form: RegistrationForm; update: (p: Partial<RegistrationForm>) => void; onError: (e: unknown) => void }) {
  const design = form.checkin;
  const eventName = useEvent()?.name ?? "Artistroom";
  const [images, setImages] = useState<MailImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewCategory, setPreviewCategory] = useState(form.categories[0]?.id ?? "");
  const [previewState, setPreviewState] = useState<"ready" | "ok" | "already">("ready");
  const [play, setPlay] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const customFields = form.fields.filter((f) => !isBuiltin(f.id) && INPUT_TYPES.includes(f.type));

  useEffect(() => { api.mailImages().then((r) => setImages(r.images)).catch(() => {}); }, []);

  const setDesign = (patch: Partial<CheckinDesign>) => update({ checkin: { ...design, ...patch } });
  const setBlock = (i: number, patch: Partial<CheckinBlock>) => setDesign({ blocks: design.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addBlock = (type: CheckinBlockType) =>
    setDesign({ blocks: [...design.blocks, { id: REPEATABLE.includes(type) ? newCheckinBlockId() : type, type, enabled: true, text: type === "text" ? "" : "", fieldId: type === "feld" ? (customFields[0]?.id ?? "") : "" }] });
  const missing = CHECKIN_BLOCKS.filter((t) => REPEATABLE.includes(t.id) || !design.blocks.some((b) => b.type === t.id));

  const upload = async (file: File) => {
    if (file.size > MAX_IMAGE) return onError(new ApiError("Das Bild ist zu groß (max. 3 MB).", 422));
    setUploading(true);
    try {
      const { image } = await api.uploadMailImage(file.name, await toBase64(file));
      setImages((list) => [image, ...list]);
      setDesign({ logoImage: image.id });
    } catch (e) {
      onError(e);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const category = form.categories.find((c) => c.id === previewCategory) ?? form.categories[0];
  const sampleExtra = Object.fromEntries(customFields.map((f) => [f.id, { label: f.label || "Feld", value: f.type === "select" ? (f.options[0] ?? "Antwort") : f.type === "checkbox" ? "Ja" : "Beispiel-Antwort" }]));
  const guest: SplashGuest = { id: 42, name: "DJ Beispiel", firstName: "Alex", lastName: "Muster", city: "Hamburg", instagram: "djbeispiel", extraFields: JSON.stringify(sampleExtra), checkedInAt: new Date().toISOString() };

  return (
    <div className="regform-section">
      <div className="info-box" role="note">
        <strong>So funktioniert die Animation</strong>
        <ul>
          <li>Beim Scannen eines gültigen QR-Tickets im <b>Check-in</b> erscheint sie bildschirmfüllend in der <b>Farbe der Kategorie</b> (Farbcode unter „Wer bist du?“).</li>
          <li>Einlass direkt in der Animation bestätigen oder antippen zum Schließen. Bereits eingecheckte Tickets werden rot umrandet mit Warnung angezeigt.</li>
          <li>Platzhalter im Freitext: <code>{"{name}"}</code> <code>{"{vorname}"}</code> <code>{"{kategorie}"}</code> <code>{"{nummer}"}</code> <code>{"{event}"}</code></li>
        </ul>
      </div>
      <div className="settings-fields">
        <label className="checkbox-inline is-wide"><input type="checkbox" checked={design.enabled} onChange={(e) => setDesign({ enabled: e.target.checked })} /> Animation beim Scannen anzeigen</label>
        <span />
        <label className="settings-field">
          Animation
          <select className="input" value={design.animation} onChange={(e) => setDesign({ animation: e.target.value as CheckinDesign["animation"] })}>
            {CHECKIN_ANIMATIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="settings-field">
          Hintergrund
          <select className="input" value={design.background} onChange={(e) => setDesign({ background: e.target.value as CheckinDesign["background"] })}>
            {CHECKIN_BACKGROUNDS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="settings-field">
          Anzeigedauer (Sekunden)
          <input className="input" type="number" min={2} max={30} value={design.duration} onChange={(e) => setDesign({ duration: Math.min(30, Math.max(2, Number(e.target.value) || 5)) })} />
        </label>
        <label className="settings-field">
          Logo-Größe ({design.logoSize} px)
          <input type="range" min={48} max={320} step={4} value={design.logoSize} onChange={(e) => setDesign({ logoSize: Number(e.target.value) })} />
        </label>
        <label className="settings-field">
          Logo
          <select className="input" value={design.logoImage} onChange={(e) => setDesign({ logoImage: e.target.value })}>
            <option value="">Artistroom-Logo</option>
            {images.map((img) => <option key={img.id} value={img.id}>{img.name}</option>)}
            {design.logoImage && !images.some((i) => i.id === design.logoImage) && <option value={design.logoImage}>Aktuelles Bild</option>}
          </select>
        </label>
        <div className="settings-field">
          Eigenes Logo hochladen
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>Bild auswählen (PNG/JPG/WebP)</Button>
        </div>
      </div>

      <h3>🧱 Bausteine</h3>
      <ol className="question-list">
        {design.blocks.map((b, i) => (
          <li key={b.id} className={`question-card ${b.enabled ? "" : "is-off"}`}>
            <div className="question-head">
              <span className="question-no">{i + 1}</span>
              <strong>{blockLabel(b.type)}</strong>
              <label className="checkbox-inline"><input type="checkbox" checked={b.enabled} onChange={(e) => setBlock(i, { enabled: e.target.checked })} /> Anzeigen</label>
              <BlockButtons index={i} count={design.blocks.length} onMove={(d) => setDesign({ blocks: move(design.blocks, i, d) })} onDelete={() => setDesign({ blocks: design.blocks.filter((_, j) => j !== i) })} deleteLabel="Baustein entfernen" />
            </div>
            {b.type === "text" && <input className="input" maxLength={300} placeholder="z. B. Willkommen, {vorname}! Garderobe links 👈" value={b.text} onChange={(e) => setBlock(i, { text: e.target.value })} aria-label="Freitext" />}
            {b.type === "feld" && (
              customFields.length ? (
                <select className="input" value={b.fieldId} onChange={(e) => setBlock(i, { fieldId: e.target.value })} aria-label="Formularfeld">
                  <option value="">Feld wählen…</option>
                  {customFields.map((f) => <option key={f.id} value={f.id}>{f.label || "(ohne Beschriftung)"}</option>)}
                </select>
              ) : <p className="muted small">Lege zuerst unter „Deine Daten“ ein eigenes Feld an.</p>
            )}
          </li>
        ))}
      </ol>
      <div className="question-add">
        <span className="muted small">Baustein hinzufügen:</span>
        {missing.map((t) => <button key={t.id} type="button" className="action-btn action-plain" onClick={() => addBlock(t.id)}>{t.label}</button>)}
      </div>

      <h3>👀 Vorschau</h3>
      <div className="regform-preview-controls">
        <select className="input input-sm" value={category?.id} onChange={(e) => setPreviewCategory(e.target.value)} aria-label="Kategorie für die Vorschau">
          {form.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label || "Neue Kategorie"}</option>)}
        </select>
        <select className="input input-sm" value={previewState} onChange={(e) => setPreviewState(e.target.value as typeof previewState)} aria-label="Status für die Vorschau">
          <option value="ready">Ticket gültig</option>
          <option value="ok">Einlass OK</option>
          <option value="already">Bereits eingecheckt</option>
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={() => setPlay((n) => n + 1)}>▶ Abspielen</Button>
      </div>
      {category && (
        <CheckinSplash key={`${play}-${design.animation}-${category.id}`} preview design={design} category={{ ...category, color: HEX.test(category.color) ? category.color : "#8b5cf6" }} guest={guest} state={previewState} eventName={eventName} onClose={() => {}} />
      )}
    </div>
  );
}
