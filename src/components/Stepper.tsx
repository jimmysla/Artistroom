interface Props {
  current: number;
  labels: string[];
}

export default function Stepper({ current, labels }: Props) {
  return (
    <div className="stepper">
      <ol className="stepper-steps" aria-label={`Schritt ${current} von ${labels.length}`}>
        {labels.map((label, i) => {
          const step = i + 1;
          const state = step < current ? "done" : step === current ? "active" : "todo";
          return (
            <li key={label} className="stepper-item">
              {i > 0 && <span className={`stepper-line ${step <= current ? "is-filled" : ""}`} aria-hidden="true" />}
              <span
                className={`stepper-dot is-${state}`}
                aria-current={state === "active" ? "step" : undefined}
                aria-label={`${label}${state === "done" ? " – erledigt" : ""}`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  step
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="stepper-label" aria-live="polite">
        {labels[current - 1]}
      </span>
    </div>
  );
}
