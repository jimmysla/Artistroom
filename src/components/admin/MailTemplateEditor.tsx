import { useEffect, useMemo, useState } from "react";
import MailImagesPanel from "./MailImagesPanel";
import {
  BACKGROUNDS,
  BLOCKS,
  FONTS,
  FONT_SIZES,
  PLACEHOLDERS,
  SAMPLE_VARS,
  TEMPLATE_LABELS,
  TEMPLATE_STATUSES,
  renderMail,
  type BlockId,
  type MailDesign,
  type MailTemplates,
  type TemplateStatus,
} from "../../../shared/mail-template";

interface Props {
  value: MailTemplates;
  onChange: (value: MailTemplates) => void;
  eventName: string;
  paymentUrl: string;
  /** Selected template – shared with the test-mail button. */
  active: TemplateStatus;
  onActiveChange: (status: TemplateStatus) => void;
}

const blockLabel = (id: BlockId) => BLOCKS.find((b) => b.id === id)!.label;

/** Status mail templates (subject, title, text) + design "Baukasten" with live preview. */
export default function MailTemplateEditor({ value, onChange, eventName, paymentUrl, active, onActiveChange }: Props) {
  const [qr, setQr] = useState<string>();
  const template = value.templates[active];
  const design = value.design;

  // Sample QR code for the preview (qrcode is only loaded when the editor is open).
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((m) => m.default.toDataURL("artistroom:beispiel-ticket", { width: 400, margin: 2 }))
      .then((url) => !cancelled && setQr(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setTemplate = (patch: Partial<typeof template>) =>
    onChange({ ...value, templates: { ...value.templates, [active]: { ...template, ...patch } } });
  const setDesign = (patch: Partial<MailDesign>) => onChange({ ...value, design: { ...design, ...patch } });
  const moveBlock = (index: number, delta: number) => {
    const blocks = [...design.blocks];
    const [b] = blocks.splice(index, 1);
    blocks.splice(index + delta, 0, b);
    setDesign({ blocks });
  };

  const preview = useMemo(
    () =>
      renderMail(value, active, { ...SAMPLE_VARS, event: eventName || SAMPLE_VARS.event }, {
        qrSrc: qr,
        logoUrl: `${window.location.origin}/logo-email.png`,
        imageUrl: (id) => `${window.location.origin}/api/mail-images/${id}`,
        surveyUrl: SAMPLE_VARS.umfragelink,
        paymentUrl: paymentUrl || SAMPLE_VARS.zahlungslink,
      }),
    [value, active, qr, eventName, paymentUrl],
  );

  return (
    <div className="mail-editor">
      <div className="mail-tabs" role="tablist" aria-label="E-Mail-Vorlage wählen">
        {TEMPLATE_STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={active === s} className={active === s ? "is-active" : ""} onClick={() => onActiveChange(s)}>
            {TEMPLATE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="mail-editor-grid">
        <div className="mail-editor-form">
          {active === "eingegangen" && (
            <label className="checkbox-inline mail-confirm-toggle">
              <input type="checkbox" checked={value.sendConfirmation} onChange={(e) => onChange({ ...value, sendConfirmation: e.target.checked })} />
              Diese Bestätigung automatisch nach jeder Anmeldung senden
            </label>
          )}
          <label className="settings-field">
            Betreff
            <input className="input" maxLength={200} value={template.subject} onChange={(e) => setTemplate({ subject: e.target.value })} />
          </label>
          <label className="settings-field">
            Überschrift
            <input className="input" maxLength={200} value={template.title} onChange={(e) => setTemplate({ title: e.target.value })} />
          </label>
          <label className="settings-field">
            Text
            <textarea className="input mail-body" rows={8} maxLength={5000} value={template.body} onChange={(e) => setTemplate({ body: e.target.value })} />
            <span className="field-hint">
              Platzhalter: {PLACEHOLDERS.map((p) => <code key={p.key} title={p.label}>{`{${p.key}}`}</code>)} · Formatierung: <code>**fett**</code> <code>*kursiv*</code> · Leerzeile = neuer Absatz
            </span>
          </label>

          <h3>🧱 Baukasten – Aufbau der E-Mail</h3>
          <p className="muted small">Reihenfolge mit ↑ ↓ ändern, Bausteine ein- und ausschalten. Gilt für alle Vorlagen.</p>
          <ol className="block-list">
            {design.blocks.map((b, i) => (
              <li key={b.id} className={b.enabled ? "" : "is-off"}>
                <label>
                  <input type="checkbox" checked={b.enabled} onChange={(e) => setDesign({ blocks: design.blocks.map((x) => (x.id === b.id ? { ...x, enabled: e.target.checked } : x)) })} />
                  {blockLabel(b.id)}
                </label>
                <span className="block-move">
                  <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label={`${blockLabel(b.id)} nach oben`}>↑</button>
                  <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === design.blocks.length - 1} aria-label={`${blockLabel(b.id)} nach unten`}>↓</button>
                </span>
              </li>
            ))}
          </ol>

          <MailImagesPanel design={design} onChange={setDesign} />

          <h3>🎨 Design &amp; Formatierung</h3>
          <div className="settings-fields">
            <label className="settings-field">
              Hintergrund
              <select className="input" value={design.background} onChange={(e) => setDesign({ background: e.target.value as MailDesign["background"] })}>
                {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            {design.background === "eigene" ? (
              <label className="settings-field">
                Hintergrundfarbe
                <input className="input input-color" type="color" value={design.backgroundColor} onChange={(e) => setDesign({ backgroundColor: e.target.value })} />
              </label>
            ) : (
              <span />
            )}
            <label className="settings-field">
              Akzentfarbe (Rahmen, Button)
              <input className="input input-color" type="color" value={design.accentColor} onChange={(e) => setDesign({ accentColor: e.target.value })} />
            </label>
            <label className="settings-field">
              Schriftart
              <select className="input" value={design.font} onChange={(e) => setDesign({ font: e.target.value as MailDesign["font"] })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className="settings-field">
              Schriftgröße
              <select className="input" value={design.fontSize} onChange={(e) => setDesign({ fontSize: e.target.value as MailDesign["fontSize"] })}>
                {FONT_SIZES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className="settings-field">
              Ausrichtung
              <select className="input" value={design.align} onChange={(e) => setDesign({ align: e.target.value as MailDesign["align"] })}>
                <option value="center">Zentriert</option>
                <option value="left">Linksbündig</option>
              </select>
            </label>
            <label className="settings-field">
              QR-Code-Größe: {design.qrSize} px
              <input type="range" min={120} max={360} step={10} value={design.qrSize} onChange={(e) => setDesign({ qrSize: Number(e.target.value) })} />
            </label>
            <label className="settings-field">
              Text auf dem Zahlungs-Button
              <input className="input" maxLength={60} value={design.buttonText} onChange={(e) => setDesign({ buttonText: e.target.value })} />
            </label>
            <label className="settings-field is-wide">
              Fußzeile
              <input className="input" maxLength={500} value={design.footer} onChange={(e) => setDesign({ footer: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="mail-preview">
          <p className="mail-preview-subject">
            <span className="muted">Betreff:</span> {preview.subject}
          </p>
          <iframe title="Vorschau der E-Mail" srcDoc={preview.html} sandbox="" />
          <p className="muted small">Live-Vorschau mit Beispieldaten · Änderungen gelten nach dem Speichern.</p>
        </div>
      </div>
    </div>
  );
}
