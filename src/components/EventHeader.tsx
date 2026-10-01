import { EventMeta } from "../lib/event";
interface Props {
  onBack?: () => void;
}

export default function EventHeader({ onBack }: Props) {
  return (
    <header className="event-header">
      {onBack && (
        <button type="button" className="back-link" onClick={onBack}>
          <span aria-hidden="true">←</span> Zurück
        </button>
      )}
      <h2 className="event-title">Anmeldung</h2>
      <p className="event-meta">
        <EventMeta />
      </p>
    </header>
  );
}
