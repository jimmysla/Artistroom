import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type AdminSettings, type MailImage, type SecretKey } from "../../lib/api";
import { announceEventChange } from "../../lib/event";
import { DEFAULT_WELCOME_TEXT, type EventSettings as Settings } from "../../../shared/event";
import { TEMPLATE_LABELS, type MailTemplates, type TemplateStatus } from "../../../shared/mail-template";
import Button from "../Button";
import Alert from "../Alert";
import Fold from "../Fold";
import LocationField from "./LocationField";
import MailTemplateEditor from "./MailTemplateEditor";
import SurveyEditor from "./SurveyEditor";
import type { Survey } from "../../../shared/survey";
import type { Product } from "../../../shared/product";
import ResetDialog from "./ResetDialog";

const PROVIDER_TEXT = {
  smtp: "✅ Versand über dein SMTP-Postfach aktiv.",
  resend: "✅ Versand über Resend aktiv (kein SMTP-Postfach hinterlegt).",
} as const;

type Section = "event" | "email" | "survey" | "reset";

interface Props {
  isSuper: boolean;
  registrationCount: number;
  /** Deletes all registrations (super user login required); resolves with the number deleted. */
  onReset: (confirm: string, username: string, password: string) => Promise<number>;
}

export default function EventSettings({ isSuper, registrationCount, onReset }: Props) {
  const [section, setSection] = useState<Section>("event");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<MailTemplates | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  // Product is edited in the menu "Warenkorb"; kept here so saving the settings doesn't drop it.
  const [homeImages, setHomeImages] = useState<MailImage[]>([]);
  const [surveyDirty, setSurveyDirty] = useState(false);
  const [meta, setMeta] = useState<Omit<AdminSettings, "settings" | "mailTemplates"> | null>(null);
  const [clear, setClear] = useState<Partial<Record<SecretKey, boolean>>>({});
  const clearPassword = Boolean(clear.smtpPassword);
  const [paymentTest, setPaymentTest] = useState<{ busy?: string; ok?: string; error?: string }>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<{ busy?: boolean; ok?: string; error?: string }>({});
  const [activeTemplate, setActiveTemplate] = useState<TemplateStatus>("kostenlos");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDone, setResetDone] = useState("");

  const apply = ({ settings, mailTemplates, ...rest }: AdminSettings) => {
    setSurvey(rest.survey);
    setProduct(rest.product);
    setSurveyDirty(false);
    setSettings(settings);
    setTemplates(mailTemplates);
    setMeta(rest);
    setClear({});
  };
  useEffect(() => { api.settings().then(apply).catch(e => setError(e.message)); }, []);

  const set = (key: keyof Settings, value: string) => { setSettings({ ...settings!, [key]: value }); setMessage(""); };
  const field = (key: keyof Settings, label: string, type = "text", required = false, extra: { hint?: ReactNode; placeholder?: string; autoComplete?: string; inputMode?: "decimal" | "numeric"; wide?: boolean } = {}) => (
    <label className={`settings-field ${extra.wide ? "is-wide" : ""}`}>
      {label}
      <input className="input" type={type} required={required} maxLength={1000} placeholder={extra.placeholder} autoComplete={extra.autoComplete} inputMode={extra.inputMode} value={settings![key]} onChange={e => set(key, e.target.value)} />
      {extra.hint && <span className="field-hint">{extra.hint}</span>}
    </label>
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      apply(await api.saveSettings(settings!, templates!, survey!, product!, clear));
      announceEventChange();
      setMessage("✅ Einstellungen gespeichert – die Webseite zeigt die neuen Angaben sofort an.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // Provider counts as ready if credentials are stored or currently being entered.
  const stripeReady = Boolean(meta && settings && ((meta.paymentProviders.stripe && !clear.stripeSecretKey) || settings.stripeSecretKey));
  const paypalReady = Boolean(meta && settings && settings.paypalClientId && ((meta.secretsSet.paypalClientSecret && !clear.paypalClientSecret) || settings.paypalClientSecret || meta.paymentProviders.paypal));

  const secretField = (key: SecretKey, label: string, placeholder: string) => (
    <label className="settings-field">
      {label}
      <input className="input" type="password" autoComplete="new-password" disabled={clear[key]}
        placeholder={meta!.secretsSet[key] ? "•••••••• gespeichert – leer lassen zum Behalten" : placeholder}
        value={settings![key]} onChange={e => set(key, e.target.value)} />
      {meta!.secretsSet[key] && <span className="checkbox-inline"><input type="checkbox" checked={Boolean(clear[key])} onChange={e => { setClear({ ...clear, [key]: e.target.checked }); set(key, ""); }} /> Gespeicherten Wert entfernen</span>}
    </label>
  );

  const testPayment = async (provider: "stripe" | "paypal") => {
    setPaymentTest({ busy: provider });
    try {
      const { message } = await api.testPayment(provider, settings!);
      setPaymentTest({ ok: `✅ ${message}` });
    } catch (e) {
      setPaymentTest({ error: e instanceof ApiError ? e.message : "Test fehlgeschlagen." });
    }
  };

  const sendTest = async (template?: TemplateStatus) => {
    setTestState({ busy: true });
    try {
      await api.testMail(testTo.trim(), template);
      setTestState({ ok: `Test-E-Mail${template ? ` („${TEMPLATE_LABELS[template]}“)` : ""} an ${testTo.trim()} gesendet.` });
    } catch (e) { setTestState({ error: (e as Error).message }); }
  };

  const sections: { id: Section; label: string }[] = [
    { id: "event", label: "🎪 Veranstaltung & Zahlung" },
    { id: "email", label: "✉️ E-Mail" },
    { id: "survey", label: "📊 Umfrage" },
    ...(isSuper ? [{ id: "reset" as const, label: "♻️ Reset für nächstes Event" }] : []),
  ];

  const saveBar = <div className="settings-save"><Button type="submit" loading={busy}>Einstellungen speichern</Button>{message && <p role="status">{message}</p>}</div>;

  return <section className="settings-panel"><h1>Einstellungen</h1><p className="muted">Veranstaltung, E-Mails und Vorbereitung fürs nächste Event zentral verwalten.</p>
    <nav className="settings-tabs" aria-label="Einstellungsbereiche">
      {sections.map(s => <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} className={s.id === "reset" ? "is-danger" : ""} onClick={() => { setSection(s.id); setMessage(""); }}>{s.label}</button>)}
    </nav>
    {error && <Alert>{error}</Alert>}
    {section === "reset" ? (
      <div className="settings-reset">
        <h2>♻️ Reset für das nächste Event</h2>
        <p className="muted">
          Bereitet das System auf das nächste Event vor: <strong>alle Anmeldungen und Tickets</strong> (inklusive QR-Codes und Check-ins) sowie <strong>alle Umfrage-Antworten</strong> werden aus dem System gelöscht, die Umfrage wird für das nächste Event wieder scharf geschaltet und die Anmeldenummern beginnen wieder bei <strong>#0001</strong>.
          Einstellungen, E-Mail-Vorlagen, Konten und das Logging bleiben erhalten – passe danach Name, Datum und Ort für das nächste Event an.
        </p>
        <ul className="reset-facts">
          <li>📋 Aktuell <strong>{registrationCount}</strong> Anmeldung{registrationCount === 1 ? "" : "en"} im System</li>
          <li>🔐 Nur mit Login eines Super Users</li>
          <li>↩️ 3 Monate lang im Logging rückgängig machbar (solange keine neuen Anmeldungen dieselben Nummern belegen)</li>
        </ul>
        {resetDone && <Alert tone="success">{resetDone}</Alert>}
        <Button variant="danger" size="md" onClick={() => { setResetDone(""); setResetOpen(true); }}>Alle Anmeldungen & Tickets löschen</Button>
        {resetOpen && <ResetDialog count={registrationCount} onCancel={() => setResetOpen(false)} onConfirm={async (confirm, username, password) => {
          const deleted = await onReset(confirm, username, password);
          setResetOpen(false);
          setResetDone(`${deleted} Anmeldung${deleted === 1 ? "" : "en"} gelöscht · Nummerierung beginnt wieder bei #0001. Jetzt unter „Veranstaltung“ die Daten fürs nächste Event eintragen.`);
        }} />}
      </div>
    ) : !settings || !meta || !templates ? (!error && <p role="status">Einstellungen werden geladen…</p>) : <form onSubmit={save}>
      {section === "event" && <>
        <Fold title="Veranstaltung"><div className="settings-fields">{field("name", "Veranstaltungsname", "text", true, { wide: true })}{field("date", "Datum", "date", true)}{field("time", "Uhrzeit (Europe/Berlin)", "time")}<LocationField value={settings.location} onChange={(v) => set("location", v)} /></div></Fold>

        <Fold title="Startseite">
        <p className="muted small">Bild und Text stehen auf der Startseite unter dem Scroll-Hinweis, direkt über dem Button „Zur Anmeldung“. Das Bild steht links und passt sich der Bildschirmgröße an.</p>
        <div className="settings-fields">
          <label className="settings-field">
            Bild (hochgeladen unter E-Mail → Bilder &amp; Logos)
            <select className="input" value={settings.welcomeImage} onFocus={() => !homeImages.length && api.mailImages().then(r => setHomeImages(r.images)).catch(() => {})} onChange={e => set("welcomeImage", e.target.value)}>
              <option value="">– kein Bild –</option>
              {homeImages.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              {settings.welcomeImage && !homeImages.some(i => i.id === settings.welcomeImage) && <option value={settings.welcomeImage}>Aktuelles Bild</option>}
            </select>
          </label>
          {settings.welcomeImage ? <img className="welcome-thumb" src={`/api/mail-images/${settings.welcomeImage}`} alt="Vorschau Startseiten-Bild" /> : <span />}
          <label className="settings-field is-wide">
            Text
            <textarea className="input" rows={8} maxLength={5000} placeholder={DEFAULT_WELCOME_TEXT} value={settings.welcomeText} onChange={e => set("welcomeText", e.target.value)} />
            <span className="field-hint">Leer lassen = Standardtext. Erste Zeile = Überschrift, jede weitere Zeile ein Absatz. <code>{"{ticketpreis}"}</code> wird durch den Ticketpreis ersetzt (z. B. „22 € zzgl. Steuern“).</span>
          </label>
        </div>
        </Fold>

        <Fold title="Ticketpreis">
        <div className="settings-fields">
          {field("ticketPrice", "Ticketpreis in € (netto, zzgl. Steuern)", "text", false, {
            placeholder: "z. B. 15",
            inputMode: "decimal",
            hint: <>💡 Hinweis: Nur die Zahl eintragen (z. B. <strong>15</strong> oder <strong>12,50</strong>), ohne €-Zeichen. Der Betrag wird unter „Anmeldungen verwalten“ beim Anfordern einer Zahlung automatisch vorausgefüllt.</>,
          })}
        </div></Fold>

        <Fold title="Zahlung">
        <div className="settings-fields">
          <label className="settings-field is-wide">
            Zahlungsart für kostenpflichtige Tickets
            <select className="input" value={settings.paymentProvider === "link" ? "online" : settings.paymentProvider} onChange={e => set("paymentProvider", e.target.value)}>
              <option value="stripe" disabled={!stripeReady}>💳 Stripe – erkennt Zahlungen automatisch{stripeReady ? "" : " (Zugangsdaten unten eintragen)"}</option>
              <option value="paypal" disabled={!paypalReady}>🅿️ PayPal – erkennt Zahlungen automatisch{paypalReady ? "" : " (Zugangsdaten unten eintragen)"}</option>
              <option value="online" disabled={!stripeReady && !paypalReady}>🛒 Stripe + PayPal – Gast wählt im Checkout{stripeReady || paypalReady ? "" : " (Zugangsdaten unten eintragen)"}</option>
            </select>
            <span className="field-hint">
              {`Standard-Zahlungslink ist immer die Checkout-Seite (Menü „Warenkorb“). Die E-Mail enthält den Link dorthin. Dort wird über ${settings.paymentProvider === "stripe" ? "Stripe" : settings.paymentProvider === "paypal" ? "PayPal" : "Stripe oder PayPal"} bezahlt und die Seite wartet auf die serverseitige Bestätigung. Danach wird die Anmeldung automatisch auf „Bezahlt“ gesetzt und das Ticket verschickt. Bis dahin steht der Status auf „Zahlung ausstehend“ – manuelles Markieren als bezahlt gibt es nicht.`}
</span>
          </label>
        </div>


        <h3 className="settings-sub">💳 Stripe</h3>
        <p className="muted small">Secret Key aus dem Stripe-Dashboard → Entwickler → API-Schlüssel (<code>sk_live_…</code> oder zum Testen <code>sk_test_…</code>). Wird verschlüsselt gespeichert.</p>
        <div className="settings-fields">
          {secretField("stripeSecretKey", "Stripe Secret Key", "sk_live_…")}
          <div className="settings-field payment-test"><Button type="button" variant="secondary" size="sm" loading={paymentTest.busy === "stripe"} disabled={!stripeReady} onClick={() => testPayment("stripe")}>Verbindung testen</Button></div>
        </div>
        <h3 className="settings-sub">🅿️ PayPal</h3>
        <p className="muted small">Client-ID und Secret aus dem PayPal-Developer-Dashboard → Apps &amp; Credentials. Das Secret wird verschlüsselt gespeichert.</p>
        <div className="settings-fields">
          {field("paypalClientId", "PayPal Client-ID", "text", false, { autoComplete: "off" })}
          {secretField("paypalClientSecret", "PayPal Secret", "Secret")}
          <label className="settings-field">
            Modus
            <select className="input" value={settings.paypalMode} onChange={e => set("paypalMode", e.target.value)}>
              <option value="live">Live (echte Zahlungen)</option>
              <option value="sandbox">Sandbox (Testzahlungen)</option>
            </select>
          </label>
          <div className="settings-field payment-test"><Button type="button" variant="secondary" size="sm" loading={paymentTest.busy === "paypal"} disabled={!paypalReady} onClick={() => testPayment("paypal")}>Verbindung testen</Button></div>
        </div>
        {paymentTest.ok && <Alert tone="success">{paymentTest.ok}</Alert>}
        {paymentTest.error && <Alert>{paymentTest.error}</Alert>}</Fold>
        {saveBar}
      </>}

      {section === "survey" && survey && <>
        <Fold title="📊 Umfrage nach dem Event">
        <SurveyEditor value={survey} onChange={(v) => { setSurvey(v); setSurveyDirty(true); setMessage(""); }} sentAt={meta.surveySentAt} dirty={surveyDirty} /></Fold>
        {saveBar}
      </>}

      {section === "email" && <>
        <Fold title="Postfach & Absender">
        <p className="muted">
          {meta.mailConfigured && meta.mailProvider ? PROVIDER_TEXT[meta.mailProvider] : "⚠️ Noch nicht aktiv: Absenderadresse und SMTP-Postfach eintragen."}{" "}
          Trage hier das Postfach ein, über das die E-Mails an die Teilnehmenden verschickt werden. Die Zugangsdaten findest du bei deinem Mail-Anbieter (z. B. IONOS, Strato, Google Workspace, Outlook). Das Passwort wird verschlüsselt übertragen und verschlüsselt gespeichert.
        </p>
        <div className="settings-fields">
          {field("senderName", "Absendername", "text", true)}
          {field("senderEmail", "Absenderadresse", "email", false, { placeholder: "info@deine-domain.de" })}
          {field("smtpHost", "SMTP-Server", "text", false, { placeholder: "smtp.deine-domain.de", autoComplete: "off" })}
          <div className="settings-fields settings-fields-inner">
            {field("smtpPort", "Port", "text", false, { placeholder: "587", inputMode: "numeric" })}
            <label className="settings-field">
              Verschlüsselung
              <select className="input" value={settings.smtpSecurity} onChange={e => {
                const v = e.target.value;
                // Switch to the usual port for the chosen mode if the default is still set.
                setSettings({ ...settings, smtpSecurity: v, smtpPort: v === "ssl" && settings.smtpPort === "587" ? "465" : v === "starttls" && settings.smtpPort === "465" ? "587" : settings.smtpPort });
                setMessage("");
              }}>
                <option value="starttls">STARTTLS (meist Port 587)</option>
                <option value="ssl">SSL/TLS (meist Port 465)</option>
              </select>
            </label>
          </div>
          {field("smtpUser", "Benutzername (meist die E-Mail-Adresse)", "text", false, { autoComplete: "off" })}
          <label className="settings-field">
            Passwort
            <input className="input" type="password" autoComplete="new-password" disabled={clearPassword}
              placeholder={meta.secretsSet.smtpPassword ? "•••••••• gespeichert – leer lassen zum Behalten" : "Passwort des Postfachs"}
              value={settings.smtpPassword} onChange={e => set("smtpPassword", e.target.value)} />
            {meta.secretsSet.smtpPassword && <span className="checkbox-inline"><input type="checkbox" checked={clearPassword} onChange={e => { setClear({ ...clear, smtpPassword: e.target.checked }); set("smtpPassword", ""); }} /> Gespeichertes Passwort entfernen</span>}
          </label>
        </div></Fold>

        <Fold title="E-Mail-Vorlagen">
        <p className="muted">Betreff und Text für jede Status-E-Mail vorkonfigurieren. Im Baukasten legst du fest, wo der QR-Code steht, welches Design im Hintergrund liegt und wie formatiert wird.</p>
        <MailTemplateEditor value={templates} onChange={(t) => { setTemplates(t); setMessage(""); }} eventName={settings.name} paymentUrl={settings.paymentUrl} active={activeTemplate} onActiveChange={setActiveTemplate} /></Fold>
        {saveBar}

        <Fold title="Test-E-Mail">
        <p className="muted">Prüft die gespeicherten Einstellungen – vorher speichern. „Vorlage testen“ verschickt die gerade gewählte Vorlage mit Beispieldaten und Beispiel-QR-Code.</p>
        <div className="test-mail">
          <input className="input" type="email" placeholder="empfaenger@example.de" value={testTo} onChange={e => { setTestTo(e.target.value); setTestState({}); }} aria-label="Empfänger der Test-E-Mail" />
          <Button type="button" variant="secondary" loading={testState.busy} disabled={!testTo.trim()} onClick={() => sendTest()}>Verbindung testen</Button>
          <Button type="button" variant="secondary" loading={testState.busy} disabled={!testTo.trim()} onClick={() => sendTest(activeTemplate)}>Vorlage testen</Button>
        </div>
        {testState.ok && <Alert tone="success">{testState.ok}</Alert>}
        {testState.error && <Alert>{testState.error}</Alert>}</Fold>
      </>}
    </form>}
  </section>;
}
