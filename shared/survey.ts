/*
 * Survey ("Umfrage") after the event. Built like a construction kit in the settings: an ordered
 * list of questions of different types. Shared by the settings builder, the public survey page
 * and the server (validation), so all three agree on the rules.
 */

export const QUESTION_TYPES = [
  { id: "bewertung", label: "⭐ Bewertung (1–5 Sterne)" },
  { id: "janein", label: "👍 Ja / Nein" },
  { id: "einfach", label: "🔘 Auswahl (eine Antwort)" },
  { id: "mehrfach", label: "☑️ Mehrfachauswahl" },
  { id: "kurz", label: "✏️ Kurze Antwort" },
  { id: "lang", label: "📝 Lange Antwort" },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]["id"];

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  /** Choices for "einfach" / "mehrfach". */
  options: string[];
}

export interface Survey {
  enabled: boolean;
  /** Berlin wall-clock time "YYYY-MM-DDTHH:MM" when the invitation goes out ("" = only manually). */
  sendAt: string;
  title: string;
  intro: string;
  thanks: string;
  questions: SurveyQuestion[];
}

export type SurveyAnswer = string | string[] | number;
export type SurveyAnswers = Record<string, SurveyAnswer>;

export const hasOptions = (t: QuestionType) => t === "einfach" || t === "mehrfach";

export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const DEFAULT_SURVEY: Survey = {
  enabled: false,
  sendAt: "",
  title: "Wie war das Event?",
  intro: "Danke, dass du dabei warst! Deine Antworten helfen uns, das nächste Event noch besser zu machen.",
  thanks: "Danke für dein Feedback! 💜",
  questions: [
    { id: "gesamt", type: "bewertung", label: "Wie hat dir das Event insgesamt gefallen?", required: true, options: [] },
    { id: "highlight", type: "einfach", label: "Was war dein Highlight?", required: false, options: ["Musik / DJs", "Künstler & Kunst", "Location", "Leute & Atmosphäre"] },
    { id: "wieder", type: "janein", label: "Würdest du wiederkommen?", required: true, options: [] },
    { id: "feedback", type: "lang", label: "Was können wir besser machen?", required: false, options: [] },
  ],
};

const QID = /^[a-z0-9]{1,24}$/;
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);

/** Validates stored/submitted survey config and fills missing parts with defaults. */
export function normalizeSurvey(input: unknown): Survey {
  const src = (input && typeof input === "object" ? input : {}) as Partial<Survey>;
  const seen = new Set<string>();
  const questions = (Array.isArray(src.questions) ? src.questions : DEFAULT_SURVEY.questions)
    .slice(0, 50)
    .map((q) => q as Partial<SurveyQuestion>)
    .filter((q) => typeof q.id === "string" && QID.test(q.id) && !seen.has(q.id) && seen.add(q.id) && QUESTION_TYPES.some((t) => t.id === q.type))
    .map((q) => ({
      id: q.id!,
      type: q.type!,
      label: str(q.label, 300).trim() || "Frage",
      required: q.required === true,
      options: hasOptions(q.type!) ? (Array.isArray(q.options) ? q.options : []).map((o) => str(o, 120).trim()).filter(Boolean).slice(0, 20) : [],
    }));
  return {
    enabled: src.enabled === true,
    sendAt: typeof src.sendAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(src.sendAt) ? src.sendAt : "",
    title: str(src.title, 200, DEFAULT_SURVEY.title).trim() || DEFAULT_SURVEY.title,
    intro: str(src.intro, 2000, DEFAULT_SURVEY.intro),
    thanks: str(src.thanks, 500, DEFAULT_SURVEY.thanks),
    questions,
  };
}

/** Checks submitted answers against the survey; returns the cleaned answers or field errors. */
export function validateAnswers(survey: Survey, input: unknown): { answers: SurveyAnswers; errors: Record<string, string> } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const answers: SurveyAnswers = {};
  const errors: Record<string, string> = {};
  for (const q of survey.questions) {
    const v = raw[q.id];
    let value: SurveyAnswer | undefined;
    switch (q.type) {
      case "bewertung":
        if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) value = v;
        break;
      case "janein":
        if (v === "ja" || v === "nein") value = v;
        break;
      case "einfach":
        if (typeof v === "string" && q.options.includes(v)) value = v;
        break;
      case "mehrfach":
        if (Array.isArray(v)) {
          const picked = [...new Set(v.filter((x): x is string => typeof x === "string" && q.options.includes(x)))];
          if (picked.length) value = picked;
        }
        break;
      case "kurz":
      case "lang":
        if (typeof v === "string" && v.trim()) value = v.trim().slice(0, q.type === "kurz" ? 300 : 5000);
        break;
    }
    if (value !== undefined) answers[q.id] = value;
    else if (q.required) errors[q.id] = "Bitte beantworte diese Frage.";
  }
  return { answers, errors };
}
