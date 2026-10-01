import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import NoticeBar from "../components/NoticeBar";
import EventHeader from "../components/EventHeader";
import Hero from "../components/Hero";
import Stepper from "../components/Stepper";
import CategoryCard from "../components/CategoryCard";
import TextField from "../components/TextField";
import TextArea from "../components/TextArea";
import Button from "../components/Button";
import Alert from "../components/Alert";
import Footer from "../components/Footer";
import InfoBox from "../components/InfoBox";
import { api, ApiError, REGISTRATION_CHANNEL } from "../lib/api";
import { useReveal } from "../lib/useReveal";
import { EventMeta, useEvent, useForm } from "../lib/event";
import { MAX_CUSTOM_ANSWER, customFields, enabledCategories, fieldEnabled, formCategories, validateCustomAnswers, type FormConfig } from "../../shared/site";
import { eventDate, welcomeText } from "../../shared/event";
import {
  MEDIA_CONSENT_TEXT,
  categoryLabel,
  formatRegistrationNumber,
  DETAIL_FIELDS,
  normalizeInstagram,
  normalizeTiktok,
  validateDetails,
  type RegistrationInput,
} from "../../shared/registration";

const STEP_LABELS = ["Kategorie", "Deine Daten", "Überprüfen", "Bestätigung"];
const STORAGE_KEY = "artistroom-registration-draft";
// `extra` = answers to custom questions from the form builder (id → value).
type Draft = RegistrationInput & { extra: Record<string, string> };
const EMPTY: Draft = {
  category: "", firstName: "", lastName: "", stageName: "", email: "", instagram: "", tiktok: "", referredBy: "", city: "", extra: {},
};

type DetailField = (typeof DETAIL_FIELDS)[number];

// Technical input settings; labels, placeholders, hints, emojis and colours come from the form builder.
const FIELDS: Record<DetailField, { required?: boolean; type?: string; autoComplete: string; maxLength: number; raw?: boolean }> = {
  firstName: { required: true, autoComplete: "given-name", maxLength: 100 },
  lastName: { required: true, autoComplete: "family-name", maxLength: 100 },
  stageName: { required: true, autoComplete: "nickname", maxLength: 100 },
  email: { required: true, type: "email", autoComplete: "email", maxLength: 254 },
  instagram: { type: "url", autoComplete: "off", maxLength: 120, raw: true },
  tiktok: { type: "url", autoComplete: "off", maxLength: 120, raw: true },
  referredBy: { autoComplete: "off", maxLength: 150 },
  city: { required: true, autoComplete: "address-level2", maxLength: 100 },
};

/** Clears optional fields that are hidden in the form builder (e.g. leftovers from an old draft). */
const visibleData = (d: Draft, form: FormConfig): Draft => ({
  ...d,
  instagram: fieldEnabled(form, "instagram") ? d.instagram : "",
  tiktok: fieldEnabled(form, "tiktok") ? d.tiktok : "",
  referredBy: fieldEnabled(form, "referredBy") ? d.referredBy : "",
  extra: Object.fromEntries(customFields(form).map((f) => [f.id, d.extra[f.id] ?? ""])),
});

/** Review / confirmation rows; social handles are shown as profile links. */
function summaryRows(d: Draft, form: FormConfig): [string, string][] {
  const ig = normalizeInstagram(d.instagram);
  const tt = normalizeTiktok(d.tiktok);
  const rows: [string, string][] = [
    ["Vorname", d.firstName.trim()],
    ["Nachname", d.lastName.trim()],
    ["Künstlername / Stagename", d.stageName.trim()],
    ["E-Mail", d.email.trim()],
    ["Instagram", ig ? `instagram.com/${ig}` : "—"],
    ["TikTok", tt ? `tiktok.com/@${tt}` : "—"],
    ["Eingeladen / empfohlen von", d.referredBy.trim() || "—"],
    ["Stadt", d.city.trim()],
  ];
  const hidden = new Set([
    !fieldEnabled(form, "instagram") && "Instagram",
    !fieldEnabled(form, "tiktok") && "TikTok",
    !fieldEnabled(form, "referredBy") && "Eingeladen / empfohlen von",
  ]);
  return [
    ...rows.filter(([label]) => !hidden.has(label)),
    ...customFields(form).map((f): [string, string] => [f.label, d.extra[f.id]?.trim() || "—"]),
  ];
}

// Keeps a draft in sessionStorage so an accidental reload doesn't wipe the form.
function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const draft = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    return { ...draft, extra: draft.extra && typeof draft.extra === "object" ? draft.extra : {} };
  } catch {
    return EMPTY;
  }
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Draft>(loadDraft);
  // Keys: built-in field names and custom question ids.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [mediaConsent, setMediaConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [submitted, setSubmitted] = useState<(Draft & { id: number }) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [ctaRef, ctaVisible] = useReveal<HTMLElement>(0.35);
  // Returning visitors with a saved draft skip straight to the form.
  const [formOpen, setFormOpen] = useState(() => Boolean(data.category));

  const event = useEvent();
  const form = useForm();
  const categories = formCategories(form);
  const visible = visibleData(data, form);
  // A drafted category that was hidden in the meantime has to be chosen again.
  const categoryValid = enabledCategories(form).some((c) => c.id === data.category);
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

  const clientErrors: Record<string, string | undefined> = { ...validateDetails(visible), ...validateCustomAnswers(form, visible.extra).errors };
  const detailsValid = Object.values(clientErrors).every((e) => !e);
  const errorFor = (field: string) => serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);

  const update = (field: keyof RegistrationInput, value: string) => {
    setData((d) => ({ ...d, [field]: value }));
    setServerErrors((e) => ({ ...e, [field]: undefined }));
    setSubmitError(null);
  };
  const updateExtra = (id: string, value: string) => {
    setData((d) => ({ ...d, extra: { ...d.extra, [id]: value } }));
    setServerErrors((e) => ({ ...e, [id]: undefined }));
    setSubmitError(null);
  };
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const goBack = () => {
    if (step === 2 || step === 3) setStep(step - 1);
  };

  const goToReview = (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries([...DETAIL_FIELDS, ...customFields(form).map((f) => f.id)].map((f) => [f, true])));
    if (!detailsValid || !categoryValid) return;
    setSubmitError(null);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!categoryValid) return setStep(1);
    if (!detailsValid) return setStep(2);
    if (!mediaConsent) return setConsentError(true);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.register({ ...visible, mediaConsent, website: honeypot });
      setSubmitted({ ...visible, id: res.id });
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
          setServerErrors(err.fieldErrors as Record<string, string>);
          // Errors on editable fields are fixed on the data step (category on step 1).
          const { mediaConsent: consentMsg, category: categoryMsg, ...rest } = err.fieldErrors as Record<string, string | undefined>;
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
              {form.category.title}
            </h2>
            {form.category.subtitle && <p className="step-subtitle">{form.category.subtitle}</p>}
            <div className="category-grid" role="radiogroup" aria-label="Kategorie">
              {form.category.blocks.map((b) =>
                b.type === "box" ? (
                  <InfoBox key={b.id} box={b} />
                ) : b.enabled ? (
                  <CategoryCard
                    key={b.id}
                    label={b.label}
                    description={b.description}
                    icon={b.icon}
                    color={b.color}
                    wide={b.id === enabledCategories(form)[0]?.id}
                    selected={data.category === b.id}
                    onSelect={() => update("category", b.id)}
                  />
                ) : null,
              )}
            </div>
            <Button className="btn-block" disabled={!categoryValid} onClick={() => setStep(2)}>
              Weiter <span aria-hidden="true">→</span>
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="step" key="step-2">
            <h2 className="step-title" ref={headingRef} tabIndex={-1}>
              {form.details.title}
            </h2>
            {form.details.subtitle && <p className="step-subtitle">{form.details.subtitle}</p>}
            <p className="selected-chip">
              Kategorie: <strong>{categoryLabel(data.category, categories)}</strong>
              <button type="button" onClick={() => setStep(1)}>
                ändern
              </button>
            </p>
            <form className="form" onSubmit={goToReview} noValidate>
              {form.details.blocks.map((b) => {
                if (b.type === "box") return <InfoBox key={b.id} box={b} />;
                if (!b.enabled) return null;
                const style = b.color ? ({ "--field-color": b.color } as CSSProperties) : undefined;
                const label = b.icon ? `${b.icon} ${b.label}` : b.label;
                if (b.type === "custom") {
                  const props = { label, required: b.required, optional: !b.required, placeholder: b.placeholder, maxLength: MAX_CUSTOM_ANSWER, value: data.extra[b.id] ?? "", error: errorFor(b.id), onChange: (v: string) => updateExtra(b.id, v), onBlur: () => touch(b.id) };
                  return (
                    <div key={b.id} className={`form-field-group ${b.color ? "has-color" : ""}`} style={style}>
                      {b.multiline ? <TextArea {...props} /> : <TextField {...props} />}
                      {b.hint && <p className="field-hint">{b.hint}</p>}
                    </div>
                  );
                }
                const field = b.id;
                const f = FIELDS[field];
                return (
                  <div key={field} className={`form-field-group ${b.color ? "has-color" : ""}`} style={style}>
                    <TextField
                      label={label}
                      required={f.required}
                      optional={!f.required}
                      type={f.type ?? "text"}
                      inputMode={f.type === "email" ? "email" : f.type === "url" ? "url" : undefined}
                      placeholder={b.placeholder}
                      autoComplete={f.autoComplete}
                      autoCapitalize={f.raw || f.type === "email" ? "none" : undefined}
                      spellCheck={f.raw ? false : undefined}
                      maxLength={f.maxLength}
                      value={data[field]}
                      error={errorFor(field)}
                      onChange={(v) => update(field, v)}
                      onBlur={() => touch(field)}
                    />
                    {b.hint && <p className="field-hint">{b.hint}</p>}
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
                <dd>{categoryLabel(data.category, categories)}</dd>
              </div>
              {summaryRows(visible, form).map(([label, value]) => (
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
                <dd>{categoryLabel(submitted.category, categories)}</dd>
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
