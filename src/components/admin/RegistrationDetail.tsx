import Ticket from "./Ticket";
import Modal from "../Modal";
import Button from "../Button";
import StatusBadge from "./StatusBadge";
import StatusActions from "./StatusActions";
import { CATEGORIES, formatRegistrationNumber, instagramUrl, tiktokUrl, isFinalStatus } from "../../../shared/registration";
import { formatDateTime, type Registration } from "../../lib/api";

interface Props {
  registration: Registration;
  onClose: () => void;
  // Omitted when the admin lacks the corresponding permission.
  onDelete?: () => void;
  onStatusChange?: (status: string, amountCents?: number) => Promise<void>;
}

export default function RegistrationDetail({ registration: r, onClose, onDelete, onStatusChange }: Props) {
  const category = CATEGORIES.find((c) => c.id === r.category);

  return (
    <Modal title="Anmeldung" onClose={onClose}>
      <div className="detail-hero">
        <span className="detail-icon" aria-hidden="true">{category?.icon ?? "🎟️"}</span>
        <div>
          <p className="detail-name">{r.name}</p>
          <p className="muted small">
            {[r.firstName, r.lastName].filter(Boolean).join(" ") || "Künstlername"} · {category?.label ?? r.category}
          </p>
        </div>
        <StatusBadge status={r.status} amountCents={r.amountCents} />
      </div>

      <dl className="summary">
        <div>
          <dt>Anmeldenummer</dt>
          <dd className="reg-number">{formatRegistrationNumber(r.id)}</dd>
        </div>
        <div>
          <dt>Eingegangen</dt>
          <dd>{formatDateTime(r.createdAt)}</dd>
        </div>
        {[
          ["Vorname", r.firstName],
          ["Nachname", r.lastName],
          ["Stadt", r.city],
          ["Eingeladen / empfohlen von", r.referredBy],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
        <div>
          <dt>E-Mail</dt>
          <dd>
            <a href={`mailto:${r.email}`} className="mail-link">{r.email}</a>
          </dd>
        </div>
        <div>
          <dt>Instagram</dt>
          <dd>
            {r.instagram ? (
              <a href={instagramUrl(r.instagram)} target="_blank" rel="noopener noreferrer" className="ig-link">
                @{r.instagram}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>TikTok</dt>
          <dd>
            {r.tiktok ? (
              <a href={tiktokUrl(r.tiktok)} target="_blank" rel="noopener noreferrer" className="ig-link">
                @{r.tiktok}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Foto/Video</dt>
          <dd>{r.mediaConsentAt ? `Eingewilligt am ${formatDateTime(r.mediaConsentAt)}` : "—"}</dd>
        </div>
      </dl>

      <Ticket registration={r} />
      {r.emailSentAt && <p className="muted">Letzte E-Mail an Versanddienst übergeben: {formatDateTime(r.emailSentAt)}</p>}
      {onStatusChange && (
        <div className="status-picker">
          <p className="field-label">Entscheidung</p>
          <StatusActions key={`${r.status}-${r.amountCents}`} registration={r} onChange={onStatusChange} />
        </div>
      )}

      <div className="modal-actions">
        {onDelete && !isFinalStatus(r.status) && (
          <Button variant="danger" size="md" onClick={onDelete}>
            Löschen
          </Button>
        )}
        <Button variant="secondary" size="md" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </Modal>
  );
}
