import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDateTime } from "../../lib/api";
import type { SurveyQuestion } from "../../../shared/survey";
import Alert from "../Alert";
import Button from "../Button";

type Data = Awaited<ReturnType<typeof api.surveyResults>>;

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="result-bar">
      <span className="result-label">{label}</span>
      <span className="result-track"><span style={{ width: `${pct}%` }} /></span>
      <span className="result-count">{count} · {pct} %</span>
    </div>
  );
}

function QuestionResult({ q, data }: { q: SurveyQuestion; data: Data }) {
  const values = data.responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
  const n = values.length;
  let body;
  if (q.type === "bewertung") {
    const nums = values.filter((v): v is number => typeof v === "number");
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    body = (
      <>
        <p className="result-avg">{"★".repeat(Math.round(avg))}<span>{"★".repeat(5 - Math.round(avg))}</span> <strong>{avg.toFixed(1).replace(".", ",")}</strong> / 5</p>
        {[5, 4, 3, 2, 1].map((s) => <Bar key={s} label={`${s} ★`} count={nums.filter((x) => x === s).length} total={n} />)}
      </>
    );
  } else if (q.type === "janein") {
    body = (["ja", "nein"] as const).map((o) => <Bar key={o} label={o === "ja" ? "👍 Ja" : "👎 Nein"} count={values.filter((v) => v === o).length} total={n} />);
  } else if (q.type === "einfach" || q.type === "mehrfach") {
    body = q.options.map((o) => <Bar key={o} label={o} count={values.filter((v) => (Array.isArray(v) ? v.includes(o) : v === o)).length} total={n} />);
  } else {
    const texts = values.filter((v): v is string => typeof v === "string");
    body = texts.length ? <ul className="result-texts">{texts.map((t, i) => <li key={i}>„{t}“</li>)}</ul> : <p className="muted small">Noch keine Antworten.</p>;
  }
  return (
    <section className="card result-card">
      <h3>{q.label}</h3>
      <p className="muted small">{n} Antwort{n === 1 ? "" : "en"}</p>
      {body}
    </section>
  );
}

/** Menu "Umfrage": answers of the post-event survey, aggregated per question. */
export default function SurveyResults({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.surveyResults());
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setError(e instanceof ApiError ? e.message : "Ergebnisse konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="survey-results">
      <div className="admin-heading-actions">
        <h1>📊 Umfrage</h1>
        <Button variant="secondary" size="sm" loading={loading} onClick={load}>↻ Aktualisieren</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {data && (
        <>
          <div className="checkin-stats">
            <div className="checkin-stat is-total"><span>📨 Eingeladen</span><strong>{data.sent}/{data.checkedIn}</strong></div>
            <div className="checkin-stat is-in"><span>✅ Antworten</span><strong>{data.responses.length}</strong></div>
            <div className="checkin-stat is-pending"><span>📈 Rücklauf</span><strong>{data.sent ? Math.round((data.responses.length / data.sent) * 100) : 0} %</strong></div>
          </div>
          <p className="muted">
            {data.sentAt ? `Zuletzt verschickt am ${formatDateTime(data.sentAt)}.` : "Noch nicht verschickt – Zeitpunkt und Fragen unter Einstellungen → Umfrage festlegen."}
          </p>
          <div className="result-grid">{data.survey.questions.map((q) => <QuestionResult key={q.id} q={q} data={data} />)}</div>
        </>
      )}
    </section>
  );
}
