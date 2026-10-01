import { useId, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

export default function TextField({ label, required, optional, error, onChange, ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="field-required" aria-hidden="true"> *</span>}
        {optional && " (optional)"}
      </label>
      <input
        id={id}
        className="input"
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
