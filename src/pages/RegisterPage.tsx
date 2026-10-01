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
import { EventMeta, useEvent, useRegistrationForm } from "../lib/event";
import { eventDate, welcomeText } from "../../shared/event";
import { MEDIA_CONSENT_TEXT, formatRegistrationNumber, normalizeInstagram, normalizeTiktok } from "../../shared/registration";
import {
  BUILTIN_SHORT,
  EMPTY_VALUES,
  categoryName,
  inputFields,
  isBuiltin,
  validateDetails,
  type FormErrors,
  type RegistrationForm,
  type RegistrationValues,
} from "../../shared/registration-form";
import FormFieldInput from "../components/FormFieldInput";

const STEP_LABELS = ["Kategorie", "Deine Daten", "Überprüfen", "Bestätigung"];
const STORAGE_KEY = "artistroom-registration-draft";

/** Review / confirmation rows in form order; social handles are shown as profile links. */
function summaryRows(d: RegistrationValues, form: Pick<RegistrationForm, "fields">): [string, string][] {
  return inputFields(form).map((f): [string, string] => {
    if (!isBuiltin(f.id)) {
      const v = (d.extra[f.id] ?? "").trim();
      return [f.label, f.type === "checkbox" ? (v === "ja" ? "Ja" : "Nein") : v || "—"];
    }
    const v = d[f.id].trim();
    if (f.id === "instagram") return [BUILTIN_SHORT.instagram, normalizeInstagram(v) ? `instagram.com/${normalizeInstagram(v)}` : "—"];
    if (f.id === "tiktok") return [BUILTIN_SHORT.tiktok, normalizeTiktok(v) ? `tiktok.com/@${normalizeTiktok(v)}` : "—"];
    return [BUILTIN_SHORT[f.id], v || "—"];
  });
}

// Keeps a draft in sessionStorage so an accidental reload doesn't wipe the form.
function loadDraft(): RegistrationValues {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_VALUES;
    const draft = JSON.parse(raw);
    return { ...EMPTY_VALUES, ...draft, extra: draft.extra && typeof draft.extra === "object" ? draft.extra : {} };
  } catch {
    return EMPTY_VALUES;
  }
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<RegistrationValues>(loadDraft);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [mediaConsent, setMediaConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [submitted, setSubmitted] = useState<(RegistrationValues & { id: number }) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [ctaRef, ctaVisible] = useReveal<HTMLElement>(0.35);
  // Returning visitors with a saved draft skip straight to the form.
  const [formOpen, setFormOpen] = useState(() => Boolean(data.category));

  const event = useEvent();
  const form = useRegistrationForm();
  // A drafted category that was removed in the meantime counts as not chosen.
  const category = form.categories.some((c) => c.id === data.category) ? data.category : "";
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

  const clientErrors = validateDetails(data, form);
  const detailsValid = !Object.values(clientErrors).some(Boolean);
  const errorFor = (field: string) => serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);

  const update = (field: string, value: string) => {
    setData((d) => (isBuiltin(field) || field === "category" ? { ...d, [field]: value } : { ...d, extra: { ...d.extra, [field]: value } }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
    setSubmitError(null);
  };
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const goBack = () => {
    if (step === 2 || step === 3) setStep(step - 1);
  };

  const goToReview = (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(inputFields(form).map((f) => [f.id, true])));
    if (!detailsValid || !category) return;
    setSubmitError(null);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!category) return setStep(1);
    if (!detailsValid) return setStep(2);
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
          const { mediaConsent: consentMsg, category: categoryMsg, ...rest } = err.fieldErrors;
          if (categoryMsg) setStep(1);
          else if (Object.values(rest).some(Boolean)) setStep(2);
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
    setData(EMPTY_VALUES);
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
              {form.categoryTitle}
            </h2>
            {form.categoryIntro && <p className="step-subtitle">{form.categoryIntro}</p>}
            <div className="category-grid" role="radiogroup" aria-label="Kategorie">
              {form.categories.map((c) => (
                <CategoryCard
                  key={c.id}
                  label={c.label}
                  description={c.description}
                  icon={c.icon}
                  color={c.color}
                  wide={c.wide}
                  selected={category === c.id}
                  onSelect={() => update("category", c.id)}
                />
              ))}
            </div>
            <Button className="btn-block" disabled={!category} onClick={() => setStep(2)}>
              Weiter <span aria-hidden="true">→</span>
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="step" key="step-2">
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              {form.detailsTitle}
            </h2>
            {form.detailsIntro && <p className="step-subtitle">{form.detailsIntro}</p>}
            <p className="selected-chip">
              Kategorie: <strong>{categoryName(category, form.categories)}</strong>
              <button type="button" onClick={() => setStep(1)}>
                ändern
              </button>
            </p>
            <form className="form" onSubmit={goToReview} noValidate>
              {form.fields.filter((f) => f.enabled).map((f) => (
                <FormFieldInput
                  key={f.id}
                  field={f}
                  value={isBuiltin(f.id) ? data[f.id] : (data.extra[f.id] ?? "")}
                  error={errorFor(f.id)}
                  onChange={(v) => update(f.id, v)}
                  onBlur={() => touch(f.id)}
                />
              ))}
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
                <dd>{categoryName(category, form.categories)}</dd>
              </div>
              {summaryRows(data, form).map(([label, value]) => (
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
                <dd>{categoryName(submitted.category, form.categories)}</dd>
              </div>
              {summaryRows(submitted, form).filter(([, value]) => value !== "—").map(([label, value]) => (
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
