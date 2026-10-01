import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  /** Initially open (default); the admin's choice is remembered per title. */
  defaultOpen?: boolean;
}

const key = (title: string) => `fold:${title}`;

/** Collapsible section (native <details>) whose open/closed state survives reloads. */
export default function Fold({ title, children, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(key(title)) : null;
    return saved == null ? defaultOpen : saved === "1";
  });
  return (
    <details
      className="fold"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        try {
          localStorage.setItem(key(title), next ? "1" : "0");
        } catch {
          /* private mode */
        }
      }}
    >
      <summary>
        <h2>{title}</h2>
        <span className="fold-icon" aria-hidden="true">▾</span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
