import { useId, type TextareaHTMLAttributes } from "react";

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

/** Multi-line counterpart of TextField (same label / error markup). */
export default function TextArea({ label, required, optional, error, onChange, ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="field-required" aria-hidden="true"> *</span>}
        {optional && " (optional)"}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={4}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
