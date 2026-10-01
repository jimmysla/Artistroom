import { useEffect, type CSSProperties } from "react";
import { formatRegistrationNumber } from "../../../shared/registration";
import { fillCheckinText, parseExtra, type CheckinDesign, type FormCategory } from "../../../shared/registration-form";

export interface SplashGuest {
  id: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  instagram: string | null;
  extraFields: string | null;
  checkedInAt: string | null;
}

interface Props {
  design: CheckinDesign;
  category: FormCategory;
  guest: SplashGuest;
  /** ready = valid ticket, ok = just admitted, already = was admitted before. */
  state: "ready" | "ok" | "already";
  eventName: string;
  onClose: () => void;
  /** Confirms the entry directly from the animation. */
  onAdmit?: () => void;
  admitting?: boolean;
  /** Renders inside the settings preview instead of full screen (no auto-close). */
  preview?: boolean;
}

/** Readable text colour on a solid background. */
function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0b0b0f" : "#ffffff";
}

const time = (iso: string | null) =>
  new Date(iso ?? Date.now()).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

/** Full-screen check-in animation, built from the configured blocks (Dashboard → Anmeldung). */
export default function CheckinSplash({ design, category, guest, state, eventName, onClose, onAdmit, admitting, preview }: Props) {
  useEffect(() => {
    if (preview) return;
    const timer = window.setTimeout(onClose, design.duration * 1000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [preview, design.duration, onClose]);

  const color = category.color;
  const solid = design.background === "kategorie";
  const fg = solid ? textOn(color) : "#ffffff";
  const background =
    design.background === "kategorie"
      ? color
      : design.background === "verlauf"
        ? `radial-gradient(circle at 50% 32%, ${color} 0%, color-mix(in srgb, ${color} 45%, #020203) 55%, #020203 100%)`
        : `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${color} 35%, #020203) 0%, #020203 70%)`;
  const extra = parseExtra(guest.extraFields);
  const realName = [guest.firstName, guest.lastName].filter(Boolean).join(" ");
  const vars = { name: guest.name, vorname: guest.firstName || guest.name, kategorie: category.label, nummer: formatRegistrationNumber(guest.id), event: eventName };
  const statusText = state === "ok" ? "✅ Einlass OK" : state === "already" ? "⚠️ Bereits eingecheckt" : "🎟️ Ticket gültig";

  const blocks = design.blocks
    .filter((b) => b.enabled)
    .map((b) => {
      switch (b.type) {
        case "logo":
          return <img key={b.id} className="splash-logo" src={design.logoImage ? `/api/mail-images/${design.logoImage}` : "/logo-hero-640.webp"} alt="" style={{ width: design.logoSize }} />;
        case "status":
          return <p key={b.id} className={`splash-status is-${state}`}>{statusText}</p>;
        case "emoji":
          return <p key={b.id} className="splash-emoji" aria-hidden="true">{category.icon}</p>;
        case "kategorie":
          return <p key={b.id} className="splash-category">{category.label}</p>;
        case "name":
          return <h2 key={b.id} className="splash-name">{guest.name}</h2>;
        case "realname":
          return realName ? <p key={b.id} className="splash-line">{realName}</p> : null;
        case "nummer":
          return <p key={b.id} className="splash-number">{formatRegistrationNumber(guest.id)}</p>;
        case "stadt":
          return guest.city ? <p key={b.id} className="splash-line">📍 {guest.city}</p> : null;
        case "instagram":
          return guest.instagram ? <p key={b.id} className="splash-line">📸 @{guest.instagram}</p> : null;
        case "zeit":
          return <p key={b.id} className="splash-line">🕒 {state === "ready" ? "Jetzt" : "Eingelassen"} {time(state === "ready" ? null : guest.checkedInAt)} Uhr</p>;
        case "text":
          return b.text.trim() ? <p key={b.id} className="splash-text">{fillCheckinText(b.text, vars)}</p> : null;
        case "feld": {
          const a = extra[b.fieldId];
          return a ? <p key={b.id} className="splash-line"><span className="splash-field-label">{a.label}:</span> {a.value}</p> : null;
        }
      }
    })
    .filter(Boolean);

  return (
    <div
      className={`checkin-splash splash-${design.animation} ${preview ? "is-preview" : ""} ${state === "already" ? "is-warning" : ""}`}
      style={{ "--splash-color": color, "--splash-fg": fg, background, color: fg } as CSSProperties}
      role={preview ? undefined : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-label={preview ? undefined : `${statusText}: ${guest.name}`}
      onClick={preview ? undefined : onClose}
    >
      {design.animation === "burst" && <span className="splash-burst-ring" aria-hidden="true" />}
      <div className="splash-content">
        {blocks.map((el, i) => (
          <div key={i} className="splash-item" style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
            {el}
          </div>
        ))}
        {!preview && (
          <div className="splash-actions" onClick={(e) => e.stopPropagation()}>
            {onAdmit && state === "ready" && (
              <button type="button" className="splash-btn is-primary" disabled={admitting} onClick={onAdmit}>
                {admitting ? "Wird bestätigt…" : "✅ Einlass bestätigen"}
              </button>
            )}
            <button type="button" className="splash-btn" onClick={onClose}>Schließen</button>
          </div>
        )}
      </div>
      {!preview && <span className="splash-timer" style={{ animationDuration: `${design.duration}s` }} aria-hidden="true" />}
    </div>
  );
}
