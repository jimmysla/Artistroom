import { useEffect, useRef, useState, type FormEvent } from "react";
import NoticeBar from "../components/NoticeBar";
import EventHeader from "../components/EventHeader";
import Hero from "../components/Hero";
import Stepper from "../components/Stepper";
import CategoryCard from "../components/CategoryCard";
import TextField from "../components/TextField";
import Button from "../components/Button";
import Alert from "../components/Alert";
import Footer from "../components/Footer";
import { api, ApiError, REGISTRATION_CHANNEL } from "../lib/api";
import { useReveal } from "../lib/useReveal";
import { EventMeta, useEvent } from "../lib/event";
import { eventDate, welcomeText } from "../../shared/event";
import {
  CATEGORIES,
  MEDIA_CONSENT_TEXT,
  categoryLabel,
  formatRegistrationNumber,
  DETAIL_FIELDS,
  normalizeInstagram,
  normalizeTiktok,
  validateDetails,
  type FieldErrors,
  type RegistrationInput,
} from "../../shared/registration";

const STEP_LABELS = ["Kategorie", "Deine Daten", "Überprüfen", "Bestätigung"];
const STORAGE_KEY = "artistroom-registration-draft";
const EMPTY: RegistrationInput = {
  category: "", firstName: "", lastName: "", stageName: "", email: "", instagram: "", tiktok: "", referredBy: "", city: "",
};

type DetailField = (typeof DETAIL_FIELDS)[number];

const FIELDS: Record<DetailField, { label: string; placeholder: string; required?: boolean; type?: string; autoComplete: string; maxLength: number; hint?: string; raw?: boolean }> = {
  firstName: { label: "Vorname", placeholder: "Dein Vorname", required: true, autoComplete: "given-name", maxLength: 100 },
  lastName: { label: "Nachname", placeholder: "Dein Nachname", required: true, autoComplete: "family-name", maxLength: 100 },
  stageName: {
    label: "Künstlername / Stagename",
    placeholder: "Dein Künstlername",
    required: true,
    autoComplete: "nickname",
    maxLength: 100,
    hint: "Kleiner Hinweis: Falls du keinen Künstlernamen nutzt, trage bitte deinen öffentlichen Namen ein.",
  },
  email: { label: "E-Mail-Adresse", placeholder: "deine@email.de", required: true, type: "email", autoComplete: "email", maxLength: 254 },
  instagram: { label: "Instagram-Profil-URL", placeholder: "https://instagram.com/deinname", type: "url", autoComplete: "off", maxLength: 120, raw: true },
  tiktok: { label: "TikTok-Profil-URL", placeholder: "https://tiktok.com/@deinname", type: "url", autoComplete: "off", maxLength: 120, raw: true },
  referredBy: { label: "Von wem wurdest du eingeladen oder empfohlen?", placeholder: "Name der Person", autoComplete: "off", maxLength: 150 },
  city: { label: "Aus welcher Stadt bist du?", placeholder: "z. B. Hamburg", required: true, autoComplete: "address-level2", maxLength: 100 },
};

/** Review / confirmation rows; social handles are shown as profile links. */
function summaryRows(d: RegistrationInput): [string, string][] {
  const ig = normalizeInstagram(d.instagram);
  const tt = normalizeTiktok(d.tiktok);
  return [
    ["Vorname", d.firstName.trim()],
    ["Nachname", d.lastName.trim()],
    ["Künstlername / Stagename", d.stageName.trim()],
    ["E-Mail", d.email.trim()],
    ["Instagram", ig ? `instagram.com/${ig}` : "—"],
    ["TikTok", tt ? `tiktok.com/@${tt}` : "—"],
    ["Eingeladen / empfohlen von", d.referredBy.trim() || "—"],
    ["Stadt", d.city.trim()],
  ];
}

// Keeps a draft in sessionStorage so an accidental reload doesn't wipe the form.
function loadDraft(): RegistrationInput {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<RegistrationInput>(loadDraft);
  const [touched, setTouched] = useState<Partial<Record<keyof RegistrationInput, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [mediaConsent, setMediaConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [submitted, setSubmitted] = useState<(RegistrationInput & { id: number }) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [ctaRef, ctaVisible] = useReveal<HTMLElement>(0.35);
  // Returning visitors with a saved draft skip straight to the form.
  const [formOpen, setFormOpen] = useState(() => Boolean(data.category));

  const event = useEvent();
  useEffect(() => {
    if (event) document.title = `${event.name} – Anmeldung · ${eventDate(event)}, ${event.location}`;
  }, [event]);

  useEffect(() => {
    if (step < 4) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, step]);

  // Move focus to the step heading so screen-reader and keyboard users follow the flow.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const openForm = () => {
    setFormOpen(true);
    // Wait for the form to mount before scrolling to it.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      headingRef.current?.focus({ preventScroll: true });
    });
  };

  const clientErrors: FieldErrors = validateDetails(data);
  const detailsValid = Object.keys(clientErrors).length === 0;
  const errorFor = (field: keyof RegistrationInput) =>
    serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);

  const update = (field: keyof RegistrationInput, value: string) => {
    setData((d) => ({ ...d, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
    setSubmitError(null);
  };
  const touch = (field: keyof RegistrationInput) => setTouched((t) => ({ ...t, [field]: true }));

  const goBack = () => {
    if (step === 2 || step === 3) setStep(step - 1);
  };

  const goToReview = (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(DETAIL_FIELDS.map((f) => [f, true])));
    if (!detailsValid || !data.category) return;
    setSubmitError(null);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!detailsValid || !data.category) return setStep(2);
    if (!mediaConsent) return setConsentError(true);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.register({ ...data, mediaConsent, website: honeypot });
      setSubmitted({ ...data, id: res.id });
      sessionStorage.removeItem(STORAGE_KEY);
      try {
        const channel = new BroadcastChannel(REGISTRATION_CHANNEL);
        channel.postMessage("created");
        channel.close();
      } catch {
        /* BroadcastChannel unsupported – the dashboard also polls */
      }
      setStep(4);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        if (err.fieldErrors) {
          setServerErrors(err.fieldErrors);
          // Errors on editable fields are fixed on the data step.
          const { mediaConsent: consentMsg, ...rest } = err.fieldErrors;
          if (Object.values(rest).some(Boolean)) setStep(2);
          else if (consentMsg) setConsentError(true);
        }
      } else {
        setSubmitError("Ein unerwarteter Fehler ist aufgetreten.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setData(EMPTY);
    setTouched({});
    setServerErrors({});
    setSubmitted(null);
    setMediaConsent(false);
    setConsentError(false);
    setStep(1);
  };

  return (
    <div className="page">
      <NoticeBar />
      <Hero onScrollDown={() => ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />

      <section ref={ctaRef} className={`cta-section ${ctaVisible ? "is-visible" : ""}`} aria-labelledby="cta-heading">
        <Welcome />
        <Button className="cta-button" onClick={openForm}>
          Zur Anmeldung
        </Button>
      </section>

      {formOpen && (
      <main className="container form-section" ref={formRef} id="anmeldung">
        <EventHeader onBack={step === 2 || step === 3 ? goBack : undefined} />
        <Stepper current={step} labels={STEP_LABELS} />

        {step === 1 && (
          <section className="step" key="step-1">
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              Wer bist du?
            </h2>
            <p className="step-subtitle">Wähle deine Kategorie aus.</p>
            <div className="category-grid" role="radiogroup" aria-label="Kategorie">
              {CATEGORIES.map((c, i) => (
                <CategoryCard
                  key={c.id}
                  label={c.label}
                  description={c.description}
                  icon={c.icon}
                  wide={i === 0}
                  selected={data.category === c.id}
                  onSelect={() => update("category", c.id)}
                />
              ))}
            </div>
            <Button className="btn-block" disabled={!data.category} onClick={() => setStep(2)}>
              Weiter <span aria-hidden="true">→</span>
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="step" key="step-2">
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              Deine Daten
            </h2>
            <p className="step-subtitle">Erzähl uns kurz, wer du bist und wie wir dich erreichen.</p>
            <p className="selected-chip">
              Kategorie: <strong>{categoryLabel(data.category)}</strong>
              <button type="button" onClick={() => setStep(1)}>
                ändern
              </button>
            </p>
            <form className="form" onSubmit={goToReview} noValidate>
              {DETAIL_FIELDS.map((field) => {
                const f = FIELDS[field];
                return (
                  <div key={field} className="form-field-group">
                    <TextField
                      label={f.label}
                      required={f.required}
                      optional={!f.required}
                      type={f.type ?? "text"}
                      inputMode={f.type === "email" ? "email" : f.type === "url" ? "url" : undefined}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      autoCapitalize={f.raw || f.type === "email" ? "none" : undefined}
                      spellCheck={f.raw ? false : undefined}
                      maxLength={f.maxLength}
                      value={data[field]}
                      error={errorFor(field)}
                      onChange={(v) => update(field, v)}
                      onBlur={() => touch(field)}
                    />
                    {f.hint && <p className="field-hint">{f.hint}</p>}
                  </div>
                );
              })}
              {/* Honeypot – hidden from humans and assistive tech */}
              <input
                className="hp-field"
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />

              {submitError && <Alert>{submitError}</Alert>}

              <div className="form-actions">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                  <span aria-hidden="true">←</span> Zurück
                </Button>
                <Button type="submit" disabled={!detailsValid}>
                  Weiter <span aria-hidden="true">→</span>
                </Button>
              </div>
            </form>
          </section>
        )}

        {step === 3 && (
          <section className="step" key="step-3">
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              Daten überprüfen
            </h2>
            <p className="step-subtitle">Bitte kontrolliere deine Angaben, bevor du die Anmeldung abschickst.</p>
            <dl className="summary">
              <div>
                <dt>Kategorie</dt>
                <dd>{categoryLabel(data.category)}</dd>
              </div>
              {summaryRows(data).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="review-edit">
              Etwas falsch?{" "}
              <button type="button" onClick={() => setStep(2)} disabled={submitting}>
                Daten bearbeiten
              </button>
            </p>

            <label className={`consent-box ${consentError ? "has-error" : ""} ${mediaConsent ? "is-checked" : ""}`}>
              <input
                type="checkbox"
                checked={mediaConsent}
                required
                aria-invalid={consentError || undefined}
                aria-describedby={consentError ? "consent-error" : undefined}
                onChange={(e) => {
                  setMediaConsent(e.target.checked);
                  setConsentError(false);
                  setSubmitError(null);
                }}
              />
              <span>
                <strong>Einwilligung Foto- &amp; Videoaufnahmen</strong>
                {MEDIA_CONSENT_TEXT}
              </span>
            </label>
            {consentError && (
              <p className="field-error consent-error" id="consent-error" role="alert">
                Ohne diese Einwilligung kann die Anmeldung nicht abgeschickt werden.
              </p>
            )}

            {submitError && <Alert>{submitError}</Alert>}

            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={submitting}>
                <span aria-hidden="true">←</span> Zurück
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={!mediaConsent} loading={submitting}>
                {submitting ? "Wird gesendet…" : "Anmeldung abschicken"}
              </Button>
            </div>
          </section>
        )}

        {step === 4 && submitted && (
          <section className="step step-success" key="step-4">
            <div className="success-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              Vielen Dank für deine Anmeldung!
            </h2>
            <p className="step-subtitle">
              Wir haben deine Daten erhalten und melden uns per E-Mail bei dir. Wir sehen uns bei {event?.name ?? "Artistroom"}: <EventMeta />.
            </p>
            <dl className="summary">
              <div>
                <dt>Anmeldenummer</dt>
                <dd className="reg-number">{formatRegistrationNumber(submitted.id)}</dd>
              </div>
              <div>
                <dt>Kategorie</dt>
                <dd>{categoryLabel(submitted.category)}</dd>
              </div>
              {summaryRows(submitted).filter(([, value]) => value !== "—").map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Button className="btn-block" variant="secondary" onClick={restart}>
              Zur Startseite
            </Button>
          </section>
        )}
      </main>
      )}
      <Footer />
    </div>
  );
}

/** Welcome block above the sign-up button: image on the left (if configured), text flush left. */
function Welcome() {
  const event = useEvent();
  if (!event) return <div className="welcome welcome-loading" aria-hidden="true" />;
  const [lead, ...rest] = welcomeText(event).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className="welcome has-image">
      {/* Uploaded image if configured, otherwise the two event photos as a collage. */}
      {event.welcomeImage ? (
        <img className="welcome-image" src={`/api/mail-images/${event.welcomeImage}`} alt="" loading="lazy" />
      ) : (
        <div className="welcome-collage" aria-hidden="true">
          <img className="welcome-photo" src="/welcome-stage.webp" alt="" width="640" height="892" loading="lazy" />
          <img className="welcome-photo" src="/welcome-dj.webp" alt="" width="520" height="730" loading="lazy" />
          <img className="welcome-photo" src="/welcome-mic.webp" alt="" width="520" height="752" loading="lazy" />
          <img className="welcome-photo" src="/welcome-shots.webp" alt="" width="520" height="709" loading="lazy" />
        </div>
      )}
      <div className="welcome-text">
        <h2 id="cta-heading" className="welcome-lead">
          {lead.split(/(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\p{Extended_Pictographic}]*)/u).map((part, i) => (i % 2 ? <span key={i} className="emoji">{part}</span> : part))}
        </h2>
        {rest.map((p, i) => (
          // Paragraphs fade in one after another; the price line is highlighted.
          <p key={i} className={/ticketpreis|€/i.test(p) ? "welcome-price" : ""} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            {highlight(p)}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Emphasises key phrases of the welcome text. */
function highlight(text: string) {
  const parts = text.split(/(\d+(?:,\d+)? € zzgl\. Steuern|eingeladene und empfohlene Gäste|Commitment|Artist Room)/g);
  return parts.map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
