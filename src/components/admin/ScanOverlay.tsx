import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { CheckinDesign, ScanState } from "../../../shared/site";

export interface ScanInfo {
  name: string;
  number: string;
  category: string;
  realName: string;
  city: string;
  instagram: string;
  /** Extra line, e.g. check-in time or the error message. */
  note: string;
}

interface Props {
  design: CheckinDesign;
  /** null while the ticket is still being checked (intro animation keeps running). */
  state: ScanState | null;
  info: ScanInfo | null;
  actions?: ReactNode;
  /** Inline preview in the designer instead of a fullscreen overlay. */
  preview?: boolean;
  /** Changing this replays the intro animation (preview). */
  replay?: number;
  onClose?: () => void;
}

export const scanLogo = (design: CheckinDesign) => (design.logoImage ? `/api/mail-images/${design.logoImage}` : "/logo-640.webp");

/**
 * Screen after a QR scan: configurable intro animation (logo + effect) for `durationMs`,
 * then the result card in the state colour. Colours, logo, texts and shown details come
 * from the check-in design (Dashboard → Gestaltung).
 */
export default function ScanOverlay({ design, state, info, actions, preview, replay = 0, onClose }: Props) {
  const [introDone, setIntroDone] = useState(design.animation === "none" || design.durationMs === 0);
  useEffect(() => {
    if (design.animation === "none" || design.durationMs === 0) return setIntroDone(true);
    setIntroDone(false);
    const t = window.setTimeout(() => setIntroDone(true), design.durationMs);
    return () => window.clearTimeout(t);
  }, [design.animation, design.durationMs, replay]);

  useEffect(() => {
    if (preview || !onClose) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preview, onClose]);

  const showResult = introDone && state !== null;
  const stateColor = !state ? design.accentColor : state === "invalid" ? design.errorColor : state === "already" ? design.warnColor : state === "ok" ? design.okColor : design.accentColor;
  const style = {
    "--scan-bg": design.background,
    "--scan-text": design.textColor,
    "--scan-accent": design.accentColor,
    "--scan-state": stateColor,
    "--scan-duration": `${Math.max(design.durationMs, 400)}ms`,
  } as CSSProperties;

  return (
    <div
      className={`scan-overlay ${preview ? "is-preview" : ""} ${showResult && design.tintBackground ? "is-tinted" : ""} anim-${design.animation}`}
      style={style}
      role={preview ? undefined : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-label="Scan-Ergebnis"
    >
      {!showResult ? (
        <div className="scan-intro" key={replay} role="status" aria-label="Ticket wird geprüft">
          <span className="scan-ring" aria-hidden="true" />
          <span className="scan-ring is-delayed" aria-hidden="true" />
          {design.showLogo ? <img className="scan-logo" src={scanLogo(design)} alt="" /> : <span className="scan-dot" aria-hidden="true" />}
          <span className="scan-intro-text">Ticket wird geprüft…</span>
        </div>
      ) : (
        <div className={`scan-result is-${state}`} key={`${state}-${replay}`}>
          {design.showLogo && <img className="scan-result-logo" src={scanLogo(design)} alt="" />}
          <span className="scan-burst" aria-hidden="true">{state === "invalid" ? "✕" : state === "already" ? "!" : "✓"}</span>
          <strong className="scan-title" role="status">{design.titles[state!]}</strong>
          {info && (
            <>
              {(design.showCategory || info.number) && <span className="scan-sub">{[info.number, design.showCategory && info.category].filter(Boolean).join(" · ")}</span>}
              {info.name && <h2 className="scan-name">{info.name}</h2>}
              {[design.showRealName && info.realName, design.showCity && info.city].filter(Boolean).length > 0 && (
                <p>{[design.showRealName && info.realName, design.showCity && info.city].filter(Boolean).join(" · ")}</p>
              )}
              {design.showInstagram && info.instagram && <p>@{info.instagram}</p>}
              {info.note && <p className="scan-note">{info.note}</p>}
            </>
          )}
          {actions && <div className="scan-actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}
