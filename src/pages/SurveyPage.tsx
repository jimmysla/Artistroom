import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import Button from "../components/Button";
import Alert from "../components/Alert";
import type { SurveyAnswer, SurveyAnswers } from "../../shared/survey";

type Data = Awaited<ReturnType<typeof api.publicSurvey>>;

/** /umfrage?t=… – personal survey link from the invitation mail. */
export default function SurveyPage() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    document.title = "Umfrage";
    api.publicSurvey(token).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Die Umfrage konnte nicht geladen werden."));
  }, [token]);

  const set = (id: string, v: SurveyAnswer | undefined) => {
    setAnswers((a) => {
      const next = { ...a };
      if (v === undefined || (Array.isArray(v) && !v.length)) delete next[id];
      else next[id] = v;
      return next;
    });
    setErrors((e) => ({ ...e, [id]: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const missing = Object.fromEntries(data.questions.filter((q) => q.required && answers[q.id] === undefined).map((q) => [q.id, "Bitte beantworte diese Frage."]));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.submitSurvey(token, answers);
      setDone(r.thanks);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors as Record<string, string>);
      setError(err instanceof ApiError ? err.message : "Absenden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <main className="container survey-page">
        <img className="login-logo" src="/logo-640.webp" alt="" width="120" height="120" />
        {error && !data && <Alert>{error}</Alert>}
        {!data && !error && <p role="status">Umfrage wird geladen…</p>}
        {data && (done || data.answered) && (
          <section className="card survey-card survey-done">
            <h1>💜 Danke!</h1>
            <p>{done || "Dieser Einmal-Link wurde bereits verwendet – die Umfrage ist beantwortet. Danke für dein Feedback!"}</p>
          </section>
        )}
        {data && !done && !data.answered && (
          <form className="card survey-card" onSubmit={submit} noValidate>
            <p className="eyebrow">{data.event}</p>
            <h1>{data.title}</h1>
            {data.intro && <p className="muted">{data.intro}</p>}
            {data.questions.map((q, i) => {
              const v = answers[q.id];
              return (
                <fieldset key={q.id} className={`survey-question ${errors[q.id] ? "has-error" : ""}`}>
                  <legend>
                    {i + 1}. {q.label}
                    {q.required && <span className="field-required"> *</span>}
                  </legend>
                  {q.type === "bewertung" && (
                    <div className="stars" role="radiogroup" aria-label={q.label}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} von 5 Sternen`} className={typeof v === "number" && n <= v ? "is-on" : ""} onClick={() => set(q.id, n)}>★</button>
                      ))}
                    </div>
                  )}
                  {q.type === "janein" && (
                    <div className="choice-row">
                      {(["ja", "nein"] as const).map((o) => (
                        <label key={o} className={`choice ${v === o ? "is-on" : ""}`}><input type="radio" name={q.id} checked={v === o} onChange={() => set(q.id, o)} /> {o === "ja" ? "👍 Ja" : "👎 Nein"}</label>
                      ))}
                    </div>
                  )}
                  {q.type === "einfach" && (
                    <div className="choice-col">
                      {q.options.map((o) => (
                        <label key={o} className={`choice ${v === o ? "is-on" : ""}`}><input type="radio" name={q.id} checked={v === o} onChange={() => set(q.id, o)} /> {o}</label>
                      ))}
                    </div>
                  )}
                  {q.type === "mehrfach" && (
                    <div className="choice-col">
                      {q.options.map((o) => {
                        const list = Array.isArray(v) ? v : [];
                        const on = list.includes(o);
                        return <label key={o} className={`choice ${on ? "is-on" : ""}`}><input type="checkbox" checked={on} onChange={() => set(q.id, on ? list.filter((x) => x !== o) : [...list, o])} /> {o}</label>;
                      })}
                    </div>
                  )}
                  {q.type === "kurz" && <input className="input" maxLength={300} value={typeof v === "string" ? v : ""} onChange={(e) => set(q.id, e.target.value || undefined)} />}
                  {q.type === "lang" && <textarea className="input" rows={4} maxLength={5000} value={typeof v === "string" ? v : ""} onChange={(e) => set(q.id, e.target.value || undefined)} />}
                  {errors[q.id] && <p className="field-error">{errors[q.id]}</p>}
                </fieldset>
              );
            })}
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="btn-block" loading={busy}>Absenden</Button>
            <p className="muted small">Deine Antworten werden verschlüsselt übertragen und gespeichert.</p>
          </form>
        )}
      </main>
    </div>
  );
}
