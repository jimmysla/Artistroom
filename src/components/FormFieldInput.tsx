import { useId } from "react";
import TextField from "./TextField";
import { BUILTIN_FIELDS, isBuiltin, type FormField } from "../../shared/registration-form";

interface Props {
  field: FormField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/** One block of the configurable data step: built-in / custom input, heading or info text. */
export default function FormFieldInput({ field: f, value, error, onChange, onBlur }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const hint = f.hint && <p className="field-hint">{f.hint}</p>;
  const errorText = error && <p id={errorId} className="field-error" role="alert">{error}</p>;
  const a11y = { "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined } as const;

  if (f.type === "heading") return <h3 className="form-heading">{f.label}</h3>;
  if (f.type === "info") return <p className="form-info">{f.label}</p>;

  if (isBuiltin(f.id)) {
    const meta = BUILTIN_FIELDS[f.id];
    const raw = meta.type === "url";
    return (
      <div className="form-field-group">
        <TextField
          label={f.label}
          required={f.required}
          optional={!f.required}
          type={meta.type}
          inputMode={meta.type === "email" ? "email" : meta.type === "url" ? "url" : undefined}
          placeholder={f.placeholder}
          autoComplete={meta.autoComplete}
          autoCapitalize={raw || meta.type === "email" ? "none" : undefined}
          spellCheck={raw ? false : undefined}
          maxLength={meta.maxLength}
          value={value}
          error={error}
          onChange={onChange}
          onBlur={onBlur}
        />
        {hint}
      </div>
    );
  }

  if (f.type === "checkbox") {
    return (
      <div className={`form-field-group field ${error ? "has-error" : ""}`}>
        <label className={`form-check ${value === "ja" ? "is-checked" : ""}`}>
          <input type="checkbox" checked={value === "ja"} required={f.required} {...a11y} onChange={(e) => { onChange(e.target.checked ? "ja" : ""); onBlur(); }} />
          <span>
            {f.label}
            {f.required && <span className="field-required" aria-hidden="true"> *</span>}
          </span>
        </label>
        {hint}
        {errorText}
      </div>
    );
  }

  if (f.type === "text") {
    return (
      <div className="form-field-group">
        <TextField label={f.label} required={f.required} optional={!f.required} placeholder={f.placeholder} maxLength={300} value={value} error={error} onChange={onChange} onBlur={onBlur} />
        {hint}
      </div>
    );
  }

  const label = (
    <label htmlFor={id} className="field-label">
      {f.label}
      {f.required && <span className="field-required" aria-hidden="true"> *</span>}
      {!f.required && " (optional)"}
    </label>
  );
  return (
    <div className="form-field-group">
      <div className={`field ${error ? "has-error" : ""}`}>
        {label}
        {f.type === "select" ? (
          <select id={id} className="input" required={f.required} value={value} {...a11y} onChange={(e) => { onChange(e.target.value); onBlur(); }}>
            <option value="">Bitte wählen…</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <textarea id={id} className="input" rows={4} maxLength={3000} required={f.required} placeholder={f.placeholder} value={value} {...a11y} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        )}
        {errorText}
      </div>
      {hint}
    </div>
  );
}
