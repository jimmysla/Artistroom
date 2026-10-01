import { useEffect, useRef, useState } from "react";
import { api, ApiError, type MailImage, type SiteConfig } from "../../lib/api";
import { announceEventChange } from "../../lib/event";
import Alert from "../Alert";
import Button from "../Button";
import Fold from "../Fold";
import RichText from "../RichText";
import FormBuilder, { ColorField } from "./FormBuilder";
import ScanOverlay from "./ScanOverlay";
import { MAX_BYTES, toBase64 } from "./MailImagesPanel";
import { LEGAL_PAGES, SCAN_ANIMATIONS, type CheckinDesign, type LegalPage, type ScanAnimation, type ScanState } from "../../../shared/site";

type Section = "form" | "checkin" | "legal";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "form", label: "📝 Anmeldung (Baukasten)" },
  { id: "checkin", label: "🎟️ Check-in-Bildschirm" },
  { id: "legal", label: "⚖️ Impressum & Datenschutz" },
];
const SAVE_KEY: Record<Section, keyof SiteConfig> = { form: "form", checkin: "checkin", legal: "legal" };

/** Dashboard → Gestaltung (super users): form builder, check-in scan screen, legal pages. */
export default function SiteSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [section, setSection] = useState<Section>("form");
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [dirty, setDirty] = useState<Partial<Record<Section, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError && e.status === 401) return onUnauthorized();
    setError(e instanceof ApiError ? e.message : fallback);
  };
  useEffect(() => { api.siteConfig().then(setConfig).catch((e) => fail(e, "Gestaltung konnte nicht geladen werden.")); }, []);

  const change = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K], s: Section) => {
    setConfig((c) => c && { ...c, [key]: value });
    setDirty((d) => ({ ...d, [s]: true }));
    setMessage("");
  };

  const save = async () => {
    if (!config) return;
    const key = SAVE_KEY[section];
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api.saveSiteConfig({ [key]: config[key] });
      setConfig((c) => c && { ...c, [key]: saved[key] });
      setDirty((d) => ({ ...d, [section]: false }));
      announceEventChange();
      setMessage("✅ Gespeichert – die Webseite zeigt die Änderungen sofort an.");
    } catch (e) {
      fail(e, "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-panel">
      <h1>Gestaltung</h1>
      <p className="muted">Nur für Super User: Anmeldeformular als Baukasten, Check-in-Bildschirm nach dem QR-Scan sowie Impressum und Datenschutzerklärung.</p>
      <nav className="settings-tabs" aria-label="Gestaltungsbereiche">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} onClick={() => { setSection(s.id); setMessage(""); setError(""); }}>
            {s.label}{dirty[s.id] ? " •" : ""}
          </button>
        ))}
      </nav>
      {error && <Alert>{error}</Alert>}
      {!config ? (!error && <p role="status">Wird geladen…</p>) : (
        <>
          {section === "form" && <FormBuilder value={config.form} onChange={(v) => change("form", v, "form")} />}
          {section === "checkin" && <CheckinDesigner value={config.checkin} onChange={(v) => change("checkin", v, "checkin")} onError={setError} />}
          {section === "legal" && <LegalEditor value={config.legal} onChange={(v) => change("legal", v, "legal")} />}
          <div className="settings-save">
            <Button type="button" loading={busy} onClick={save}>Speichern</Button>
            {section === "form" && <a className="muted small" href="/" target="_blank" rel="noopener">Startseite in neuem Tab öffnen ↗</a>}
            {message && <p role="status">{message}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function LegalEditor({ value, onChange }: { value: SiteConfig["legal"]; onChange: (v: SiteConfig["legal"]) => void }) {
  const [preview, setPreview] = useState<LegalPage | null>(null);
  return (
    <>
      <p className="muted small">
        Die Texte erscheinen unter <a href="/impressum" target="_blank" rel="noopener">/impressum</a> und <a href="/datenschutz" target="_blank" rel="noopener">/datenschutz</a> und werden im Footer verlinkt, sobald sie ausgefüllt sind.
        Formatierung: <code># Überschrift</code>, <code>## Unterüberschrift</code>, Leerzeile = neuer Absatz, <code>**fett**</code>; Links (https://…) und E-Mail-Adressen werden automatisch klickbar.
      </p>
      {(Object.keys(LEGAL_PAGES) as LegalPage[]).map((page) => (
        <Fold key={page} title={LEGAL_PAGES[page]}>
          <label className="settings-field">
            Text
            <textarea className="input legal-input" rows={14} maxLength={page === "impressum" ? 30000 : 80000} value={value[page]} onChange={(e) => onChange({ ...value, [page]: e.target.value })} />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPreview(preview === page ? null : page)}>{preview === page ? "Vorschau schließen" : "Vorschau"}</Button>
          {preview === page && <div className="legal-preview">{value[page].trim() ? <RichText text={value[page]} /> : <p className="muted">Noch kein Text.</p>}</div>}
        </Fold>
      ))}
    </>
  );
}

const SAMPLE = { name: "DJ Beispiel", number: "#0042", category: "DJ", realName: "Alex Muster", city: "Hamburg", instagram: "djbeispiel" };
const STATE_LABELS: Record<ScanState, string> = { ready: "Ticket gültig", ok: "Einlass OK", already: "Bereits eingecheckt", invalid: "Ungültig" };

function CheckinDesigner({ value: d, onChange, onError }: { value: CheckinDesign; onChange: (v: CheckinDesign) => void; onError: (msg: string) => void }) {
  const set = (patch: Partial<CheckinDesign>) => onChange({ ...d, ...patch });
  const [images, setImages] = useState<MailImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<ScanState>("ready");
  const [replay, setReplay] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.mailImages().then((r) => setImages(r.images)).catch(() => {}); }, []);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) throw new Error("Nur PNG, JPG, GIF oder WebP.");
      if (f.size > MAX_BYTES) throw new Error("Bild ist zu groß (max. 3 MB).");
      const { image } = await api.uploadMailImage(f.name, await toBase64(f));
      setImages((list) => [image, ...list]);
      set({ logoImage: image.id, showLogo: true });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const toggle = (key: "tintBackground" | "showLogo" | "showCategory" | "showRealName" | "showCity" | "showInstagram", label: string) => (
    <label className="checkbox-inline"><input type="checkbox" checked={d[key]} onChange={(e) => set({ [key]: e.target.checked })} /> {label}</label>
  );

  const note = state === "invalid" ? "Ticket nicht gefunden." : state === "already" ? "Wurde bereits eingelassen um 20:15 Uhr – nicht erneut einlassen!" : state === "ok" ? "Eingelassen um 20:15 Uhr" : "Noch nicht eingecheckt";

  return (
    <div className="checkin-designer">
      <div>
        <Fold title="Farben">
          <div className="settings-fields">
            <ColorField label="Hintergrund" value={d.background} onChange={(v) => set({ background: v })} allowEmpty={false} />
            <ColorField label="Textfarbe" value={d.textColor} onChange={(v) => set({ textColor: v })} allowEmpty={false} />
            <ColorField label="Akzent (Animation / Ticket gültig)" value={d.accentColor} onChange={(v) => set({ accentColor: v })} allowEmpty={false} />
            <ColorField label="Einlass OK" value={d.okColor} onChange={(v) => set({ okColor: v })} allowEmpty={false} />
            <ColorField label="Bereits eingecheckt" value={d.warnColor} onChange={(v) => set({ warnColor: v })} allowEmpty={false} />
            <ColorField label="Ungültig / kein Einlass" value={d.errorColor} onChange={(v) => set({ errorColor: v })} allowEmpty={false} />
          </div>
          {toggle("tintBackground", "Hintergrund nach dem Scan in der Ergebnisfarbe einfärben")}
        </Fold>
        <Fold title="Logo & Animation">
          <div className="settings-fields">
            <label className="settings-field">
              Logo
              <select className="input" value={d.logoImage} onChange={(e) => set({ logoImage: e.target.value })}>
                <option value="">Artistroom-Logo (Standard)</option>
                {images.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                {d.logoImage && !images.some((i) => i.id === d.logoImage) && <option value={d.logoImage}>Aktuelles Logo</option>}
              </select>
            </label>
            <div className="settings-field">
              Eigenes Logo hochladen
              <label className={`btn btn-secondary btn-sm upload-btn ${uploading ? "is-busy" : ""}`}>
                {uploading ? "Wird hochgeladen…" : "🖼️ Bild auswählen"}
                <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              <span className="field-hint">PNG mit transparentem Hintergrund sieht am besten aus. Bilder landen auch unter E-Mail → Bilder &amp; Logos.</span>
            </div>
            <label className="settings-field">
              Animation
              <select className="input" value={d.animation} onChange={(e) => { set({ animation: e.target.value as ScanAnimation }); setReplay((r) => r + 1); }}>
                {(Object.keys(SCAN_ANIMATIONS) as ScanAnimation[]).map((a) => <option key={a} value={a}>{SCAN_ANIMATIONS[a]}</option>)}
              </select>
            </label>
            <label className="settings-field">
              Dauer der Animation: {(d.durationMs / 1000).toFixed(1)} s
              <input type="range" min={0} max={4000} step={100} value={d.durationMs} onChange={(e) => set({ durationMs: Number(e.target.value) })} onMouseUp={() => setReplay((r) => r + 1)} onTouchEnd={() => setReplay((r) => r + 1)} />
            </label>
          </div>
          {toggle("showLogo", "Logo anzeigen")}
        </Fold>
        <Fold title="Texte & Infos">
          <div className="settings-fields">
            {(Object.keys(STATE_LABELS) as ScanState[]).map((k) => (
              <label key={k} className="settings-field">
                Überschrift „{STATE_LABELS[k]}“
                <input className="input" maxLength={80} value={d.titles[k]} onChange={(e) => set({ titles: { ...d.titles, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
          <div className="builder-toggles">
            {toggle("showCategory", "Kategorie")}
            {toggle("showRealName", "Vor- und Nachname")}
            {toggle("showCity", "Stadt")}
            {toggle("showInstagram", "Instagram")}
          </div>
        </Fold>
      </div>
      <div className="checkin-preview">
        <h3>Vorschau</h3>
        <div className="mail-tabs">
          {(Object.keys(STATE_LABELS) as ScanState[]).map((k) => (
            <button key={k} type="button" className={state === k ? "is-active" : ""} onClick={() => { setState(k); setReplay((r) => r + 1); }}>{STATE_LABELS[k]}</button>
          ))}
          <button type="button" onClick={() => setReplay((r) => r + 1)}>▶ Abspielen</button>
        </div>
        <ScanOverlay preview design={d} state={state} replay={replay} info={state === "invalid" ? { ...SAMPLE, name: "", number: "", category: "", realName: "", city: "", instagram: "", note } : { ...SAMPLE, note }}
          actions={state === "ready" ? <Button size="sm">✅ Einlass bestätigen</Button> : <Button size="sm">📷 Nächstes Ticket scannen</Button>} />
      </div>
    </div>
  );
}
