import { formatNet, statusIcon, statusLabel } from "../../../shared/registration";

export default function StatusBadge({ status, amountCents }: { status: string; amountCents?: number | null }) {
  const withAmount = amountCents && (status === "zahlung_angefordert" || status === "bezahlt");
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-icon" aria-hidden="true">{statusIcon(status)}</span>
      {statusLabel(status)}
      {withAmount ? <span className="status-amount">{formatNet(amountCents)}</span> : null}
    </span>
  );
}
