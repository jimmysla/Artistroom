import { useEffect, useRef, useId, type ReactNode } from "react";

let openCount = 0;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}

export default function Modal({ title, onClose, children, size = "md" }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the mount effect (which would steal focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog reacts to Escape.
      const dialogs = document.querySelectorAll(".modal");
      if (e.key === "Escape" && dialogs[dialogs.length - 1] === ref.current) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    openCount++;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      openCount--;
      if (openCount === 0) document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
