import { useCategories } from "../../lib/event";
import { formatNet, matchesStatus, statusIcon } from "../../../shared/registration";
import type { Registration } from "../../lib/api";

interface Props {
  rows: Registration[];
  activeStatus: string;
  activeCategory: string;
  onSelectStatus: (id: string) => void;
  onSelectCategory: (id: string) => void;
}

// "angenommen" is a filter group (kostenlos + zahlung angefordert + bezahlt), not a stored status.
const TILES = [
  { id: "ausstehend", label: "Ausstehend", hint: "noch zu entscheiden" },
  { id: "angenommen", label: "Angenommen", hint: "kostenlos, Zahlung offen oder bezahlt" },
  { id: "kostenlos", label: "Kostenlos", hint: "Ticket frei" },
  { id: "zahlung_angefordert", label: "Zahlung ausstehend", hint: "wartet auf Stripe/PayPal" },
  { id: "bezahlt", label: "Bezahlt", hint: "Zahlung eingegangen" },
  { id: "abgelehnt", label: "Abgelehnt", hint: "nicht dabei" },
] as const;

const SEGMENTS = ["kostenlos", "zahlung_angefordert", "bezahlt", "abgelehnt", "ausstehend"] as const;

export default function StatsOverview({ rows, activeStatus, activeCategory, onSelectStatus, onSelectCategory }: Props) {
  // Hidden categories only show up while they still have registrations.
  const categories = useCategories().filter((c) => c.enabled || rows.some((r) => r.category === c.id));
  const total = rows.length;
  const count = (id: string) => rows.filter((r) => matchesStatus(r.status, id)).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const amount = (status: string) => rows.filter((r) => r.status === status).reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const decided = total - count("ausstehend");
  const toggle = (id: string) => onSelectStatus(activeStatus === id ? "" : id);

  return (
    <section className="overview" aria-label="Anmeldungen im Überblick">
      <div className="overview-progress">
        <div>
          📊 <strong>{decided}</strong> von {total} Anmeldung{total === 1 ? "" : "en"} entschieden
          <span className="muted"> · {pct(decided)} %</span>
        </div>
        <button type="button" className="overview-all" aria-pressed={!activeStatus} onClick={() => onSelectStatus("")}>
          Alle anzeigen <strong>{total}</strong>
        </button>
      </div>

      {/* Stacked bar – each segment filters the list */}
      <div className="status-stack" role="group" aria-label="Verteilung nach Status">
        {SEGMENTS.map((id) => {
          const n = count(id);
          if (!n) return null;
          const tile = TILES.find((t) => t.id === id)!;
          return (
            <button
              key={id}
              type="button"
              className={`status-stack-seg tile-${id} ${activeStatus === id ? "is-active" : ""}`}
              style={{ flexGrow: n }}
              title={`${statusIcon(id)} ${tile.label}: ${n} (${pct(n)} %)`}
              aria-label={`${tile.label}: ${n}`}
              onClick={() => toggle(id)}
            />
          );
        })}
        {!total && <span className="status-stack-empty" />}
      </div>

      <div className="stat-tiles" role="group" aria-label="Nach Status filtern">
        {TILES.map((t) => {
          const n = count(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`stat-tile tile-${t.id} ${activeStatus === t.id ? "is-active" : ""} ${activeStatus && activeStatus !== t.id ? "is-dimmed" : ""}`}
              aria-pressed={activeStatus === t.id}
              title={t.hint}
              onClick={() => toggle(t.id)}
            >
              <span className="stat-tile-top">
                <span className="stat-tile-icon" aria-hidden="true">{statusIcon(t.id)}</span>
                <span className="stat-tile-value">{n}</span>
              </span>
              <span className="stat-tile-label">{t.label}</span>
              <span className="stat-tile-meta">
                {pct(n)} %
                {t.id === "zahlung_angefordert" && amount(t.id) > 0 && <> · {formatNet(amount(t.id))} offen</>}
                {t.id === "bezahlt" && amount(t.id) > 0 && <> · {formatNet(amount(t.id))}</>}
              </span>
              <span className="stat-tile-bar" aria-hidden="true">
                <span style={{ width: `${pct(n)}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="category-chips" role="group" aria-label="Kategorien">
        {categories.map((c) => (
          <button
            key={c.id}
            className={`category-chip ${activeCategory === c.id ? "is-active" : ""}`}
            aria-pressed={activeCategory === c.id}
            onClick={() => onSelectCategory(activeCategory === c.id ? "" : c.id)}
          >
            <span aria-hidden="true">{c.icon}</span> {c.label} <span className="category-chip-count">{rows.filter((r) => r.category === c.id).length}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
