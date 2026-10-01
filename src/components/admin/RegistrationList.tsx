import { categoryLabel, formatRegistrationNumber, instagramUrl, tiktokUrl, isFinalStatus } from "../../../shared/registration";
import { formatDateTime, type Registration } from "../../lib/api";
import StatusBadge from "./StatusBadge";
import StatusActions from "./StatusActions";
interface Props {
  rows: Registration[];
  freshIds: Set<number>;
  onOpen: (r: Registration) => void;
  // Omitted when the admin lacks the corresponding permission.
  onDelete?: (r: Registration) => void;
  onStatusChange?: (r: Registration, status: string, amountCents?: number) => Promise<void>;
}
export default function RegistrationList({ rows, freshIds, onOpen, onDelete, onStatusChange }: Props) {
  return <ul className="participant-list">{rows.map(r => <li key={r.id} className={`participant-row status-bar-${r.status}`}>
    <div className="participant-number">{formatRegistrationNumber(r.id)}{freshIds.has(r.id) && <span className="new-pill">Neu</span>}</div>
    <div className="participant-info"><button className="participant-name" onClick={() => onOpen(r)}>{r.name}</button>{(r.firstName || r.lastName) && <span className="participant-realname">{[r.firstName, r.lastName].filter(Boolean).join(" ")}</span>}<span>{categoryLabel(r.category)}{r.city && ` · ${r.city}`}{r.referredBy && ` · empfohlen von ${r.referredBy}`}</span><span className="participant-links"><a className="mail-link" href={`mailto:${r.email}`}>{r.email}</a>{r.instagram && <a href={instagramUrl(r.instagram)} target="_blank" rel="noopener noreferrer">IG @{r.instagram}</a>}{r.tiktok && <a href={tiktokUrl(r.tiktok)} target="_blank" rel="noopener noreferrer">TikTok @{r.tiktok}</a>}</span></div>
    <div className="participant-status"><StatusBadge status={r.status} amountCents={r.amountCents} /><span className="muted">{r.checkedInAt ? `Check-in: ${formatDateTime(r.checkedInAt)}` : `Angemeldet: ${formatDateTime(r.createdAt)}`}</span>{r.emailSentAt && <span className="muted">E-Mail übergeben: {formatDateTime(r.emailSentAt)}</span>}</div>
    <div className="participant-tools"><button className="action-btn action-plain" onClick={() => onOpen(r)}>Details{r.ticketToken && ["kostenlos", "bezahlt"].includes(r.status) ? " / Ticket" : ""}</button>{onDelete && !isFinalStatus(r.status) && <button className="action-btn action-plain" onClick={() => onDelete(r)} aria-label={`${r.name} löschen`}>Löschen</button>}</div>
    {onStatusChange && <div className="participant-actions"><StatusActions key={`${r.status}-${r.amountCents}-${r.revision}`} registration={r} onChange={(status, amount) => onStatusChange(r, status, amount)} /></div>}
  </li>)}</ul>;
}
