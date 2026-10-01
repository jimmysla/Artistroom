import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { QUESTION_TYPES, hasOptions, newQuestionId, type QuestionType, type Survey, type SurveyQuestion } from "../../../shared/survey";
import Button from "../Button";
import Alert from "../Alert";

interface Props {
  value: Survey;
  onChange: (value: Survey) => void;
  sentAt: string | null;
  /** True while there are unsaved changes – sending uses the saved config. */
  dirty: boolean;
}

const typeLabel = (t: QuestionType) => QUESTION_TYPES.find((q) => q.id === t)!.label;

/** Survey "Baukasten": questions can be added, reordered, changed and removed at any time. */
export default function SurveyEditor({ value, onChange, sentAt, dirty }: Props) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const set = (patch: Partial<Survey>) => onChange({ ...value, ...patch });
  const setQuestion = (i: number, patch: Partial<SurveyQuestion>) => set({ questions: value.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i: number, delta: number) => {
    const questions = [...value.questions];
    const [q] = questions.splice(i, 1);
    questions.splice(i + delta, 0, q);
    set({ questions });
  };
  const add = (type: QuestionType) =>
    set({ questions: [...value.questions, { id: newQuestionId(), type, label: "", required: false, options: hasOptions(type) ? ["Option 1", "Option 2"] : [] }] });

  const sendNow = async () => {
    if (!window.confirm("Umfrage jetzt an alle eingecheckten Gäste senden, die sie noch nicht bekommen haben?")) return;
    setSending(true);
    setResult({});
    try {
      const r = await api.sendSurvey();
      setResult({ ok: `📨 ${r.sent} Einladung(en) verschickt${r.failed ? `, ${r.failed} fehlgeschlagen (siehe Logging)` : ""}.` });
    } catch (e) {
      setResult({ error: e instanceof ApiError ? e.message : "Senden fehlgeschlagen." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="survey-editor">
      <div className="info-box" role="note">
        <strong>So funktioniert die Umfrage</strong>
        <ul>
          <li>Zum eingestellten Zeitpunkt bekommen <b>alle eingecheckten Gäste</b> automatisch die E-Mail „📊 Umfrage-Einladung“ (Text unter <b>E-Mail → Vorlagen</b>) mit ihrem persönlichen Link.</li>
          <li>Jede Person kann einmal antworten. Die Antworten werden verschlüsselt gespeichert und sind im Menü unter <b>Umfrage</b> einsehbar.</li>
          <li>Fragen lassen sich jederzeit ändern – bestehende Antworten bleiben erhalten.</li>
        </ul>
      </div>

      <div className="settings-fields">
        <label className="checkbox-inline is-wide survey-enable">
          <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Umfrage automatisch versenden
        </label>
        <label className="settings-field">
          Versand am (Uhrzeit Europe/Berlin)
          <input className="input" type="datetime-local" value={value.sendAt} disabled={!value.enabled} onChange={(e) => set({ sendAt: e.target.value })} />
          <span className="field-hint">{sentAt ? `✅ Zuletzt verschickt am ${new Date(sentAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}. Ein neuer Zeitpunkt verschickt sie an alle, die sie noch nicht bekommen haben.` : "Geprüft wird alle 15 Minuten."}</span>
        </label>
        <div className="settings-field survey-send-now">
          <Button type="button" variant="secondary" size="sm" loading={sending} disabled={dirty} onClick={sendNow}>Jetzt senden</Button>
          {dirty && <span className="muted small">Erst speichern</span>}
        </div>
        <label className="settings-field is-wide">
          Titel
          <input className="input" maxLength={200} value={value.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="settings-field is-wide">
          Einleitung
          <textarea className="input" rows={3} maxLength={2000} value={value.intro} onChange={(e) => set({ intro: e.target.value })} />
        </label>
        <label className="settings-field is-wide">
          Danke-Text nach dem Absenden
          <input className="input" maxLength={500} value={value.thanks} onChange={(e) => set({ thanks: e.target.value })} />
        </label>
      </div>
      {result.ok && <Alert tone="success">{result.ok}</Alert>}
      {result.error && <Alert>{result.error}</Alert>}

      <h3>🧱 Fragen</h3>
      <ol className="question-list">
        {value.questions.map((q, i) => (
          <li key={q.id} className="question-card">
            <div className="question-head">
              <span className="question-no">{i + 1}</span>
              <select className="input input-sm" value={q.type} aria-label="Fragetyp" onChange={(e) => { const type = e.target.value as QuestionType; setQuestion(i, { type, options: hasOptions(type) ? (q.options.length ? q.options : ["Option 1", "Option 2"]) : [] }); }}>
                {QUESTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <label className="checkbox-inline"><input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} /> Pflicht</label>
              <span className="block-move">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.questions.length - 1} aria-label="Nach unten">↓</button>
                <button type="button" onClick={() => set({ questions: value.questions.filter((_, j) => j !== i) })} aria-label="Frage löschen">✕</button>
              </span>
            </div>
            <input className="input" placeholder="Frage eingeben…" maxLength={300} value={q.label} onChange={(e) => setQuestion(i, { label: e.target.value })} aria-label={`Frage ${i + 1}`} />
            {hasOptions(q.type) && (
              <div className="question-options">
                {q.options.map((o, k) => (
                  <span key={k} className="option-row">
                    <input className="input input-sm" value={o} maxLength={120} onChange={(e) => setQuestion(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} aria-label={`Option ${k + 1}`} />
                    <button type="button" onClick={() => setQuestion(i, { options: q.options.filter((_, m) => m !== k) })} aria-label="Option entfernen">✕</button>
                  </span>
                ))}
                {q.options.length < 20 && <button type="button" className="action-btn action-plain" onClick={() => setQuestion(i, { options: [...q.options, `Option ${q.options.length + 1}`] })}>+ Option</button>}
              </div>
            )}
            <span className="muted small">{typeLabel(q.type)}</span>
          </li>
        ))}
      </ol>
      <div className="question-add">
        <span className="muted small">Frage hinzufügen:</span>
        {QUESTION_TYPES.map((t) => <button key={t.id} type="button" className="action-btn action-plain" onClick={() => add(t.id)}>{t.label}</button>)}
      </div>
    </div>
  );
}
