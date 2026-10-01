import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { CheckinDesign, ScanElement, ScanPlace, ScanState } from "../../../shared/site";

export interface ScanInfo {
  name: string;
  number: string;
  category: string;
  realName: string;
  city: string;
  instagram: string;
  /** Extra line, e.g. check-in time or the error message. */
  note: string;
  /** Configured colour of the guest's category (form builder); "" = none. */
  categoryColor?: string;
}

const SCALE = { s: 0.8, m: 1, l: 1.4, xl: 1.9 } as const;
const PLACES: ScanPlace[] = ["above", "card", "below"];

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
  // Valid tickets glow in the colour of the guest's category (e.g. DJ), if configured.
  const categoryColor = design.categoryColor && info?.categoryColor && (state === "ready" || state === "ok") ? info.categoryColor : "";
  const stateColor = categoryColor || (!state ? design.accentColor : state === "invalid" ? design.errorColor : state === "already" ? design.warnColor : state === "ok" ? design.okColor : design.accentColor);
  const logoVisible = design.layout.some((e) => e.id === "logo" && e.visible);

  const content = (e: ScanElement): ReactNode => {
    const symbol = state === "invalid" ? "✕" : state === "already" ? "!" : "✓";
    switch (e.id) {
      case "logo": return <img className="scan-el-img" src={scanLogo(design)} alt="" />;
      case "icon": return <span className="scan-burst" aria-hidden="true">{symbol}</span>;
      case "title": return <strong role="status">{design.titles[state!]}</strong>;
      case "instagram": return info?.instagram ? `@${info.instagram}` : null;
      default: return info?.[e.id] || null;
    }
  };
  const render = (place: ScanPlace) =>
    design.layout.filter((e) => e.visible && e.place === place).map((e) => {
      const c = content(e);
      if (!c) return null;
      const Tag = e.id === "name" ? "h2" : "div";
      return (
        <Tag key={e.id} className={`scan-el scan-el-${e.id} align-${e.align} style-${e.style}`} style={{ "--el-scale": SCALE[e.size] } as CSSProperties}>
          <span className="scan-el-inner">{c}</span>
        </Tag>
      );
    });
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
          <div className="scan-intro-stage">
            <span className="scan-ring" aria-hidden="true" />
            <span className="scan-ring is-delayed" aria-hidden="true" />
            {logoVisible ? <img className="scan-logo" src={scanLogo(design)} alt="" /> : <span className="scan-dot" aria-hidden="true" />}
          </div>
          <span className="scan-intro-text">Ticket wird geprüft…</span>
        </div>
      ) : (
        <div className={`scan-stack width-${design.cardWidth}`} key={`${state}-${replay}`}>
          {PLACES.map((place) =>
            place === "card" ? (
              <div key={place} className={`scan-card shape-${design.cardShape} is-${state}`}>
                {render("card")}
                {actions && <div className="scan-actions">{actions}</div>}
              </div>
            ) : (
              <div key={place} className={`scan-zone is-${place}`}>{render(place)}</div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
