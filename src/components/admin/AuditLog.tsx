import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDateTime, type LogEntry, type LogFilter } from "../../lib/api";
import { LOG_ACTIONS, logActionLabel } from "../../../shared/admin";
import Alert from "../Alert";
import Button from "../Button";
import ConfirmDialog from "./ConfirmDialog";

const POLL_MS = 10_000;

// Groups action types by colour in the list.
const tone = (action: string) =>
  action.startsWith("status") || action.startsWith("anmeldung_eingegangen")
    ? "status"
    : action.startsWith("qr") || action.startsWith("checkin")
      ? "checkin"
      : action.includes("geloescht") || action.includes("fehlgeschlagen") || action === "qr_ungueltig"
        ? "danger"
        : "neutral";

export default function AuditLog({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [filter, setFilter] = useState<LogFilter>({});
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.logs>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toUndo, setToUndo] = useState<LogEntry | null>(null);
  const [notify, setNotify] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState("");
  // Result of the dry run: null = checking, "" = fine, otherwise the conflict warning.
  const [undoWarning, setUndoWarning] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Debounce the free-text search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setFilter((f) => ({ ...f, q: search.trim() })), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setData(await api.logs(filter));
        setError("");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return onUnauthorized();
        setError(err instanceof ApiError ? err.message : "Das Protokoll konnte nicht geladen werden.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filter, onUnauthorized],
  );

  useEffect(() => {
    load();
    const tick = () => document.visibilityState === "visible" && load(true);
    const interval = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const askUndo = (entry: LogEntry) => {
    setToUndo(entry);
    setNotify(false);
    setUndoError("");
    setUndoWarning(null);
    api
      .checkUndo(entry.id)
      .then((r) => setUndoWarning(r.warning ?? ""))
      .catch(() => setUndoWarning(""));
  };

  const confirmUndo = async () => {
    if (!toUndo) return;
    setUndoing(true);
    setUndoError("");
    try {
      const res = await api.undoLog(toUndo.id, notify);
      setMessage(res.message);
      setToUndo(null);
      await load(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      const msg = err instanceof ApiError ? err.message : "Die Aktion konnte nicht rückgängig gemacht werden.";
      // Conflicts (409) are shown as a warning, other errors as error.
      if (err instanceof ApiError && err.status === 409) setUndoWarning(msg);
      else setUndoError(msg);
    } finally {
      setUndoing(false);
    }
  };

  const set = (key: keyof LogFilter) => (value: string) => setFilter((f) => ({ ...f, [key]: value }));
  const hasFilters = Boolean(filter.action || filter.user || filter.from || filter.to || search);

  return (
    <section className="log-panel">
      <h1>Logging</h1>
      <p className="muted">
        Protokoll aller Aktionen im Dashboard – wer hat wann was getan. Aktualisiert sich automatisch. Einträge werden nach{" "}
        {data?.retentionDays ?? 90} Tagen (3 Monaten) automatisch gelöscht. Fahre mit der Maus über eine Aktion, um sie rückgängig zu machen.
      </p>

      <section className="card toolbar" aria-label="Logging filtern">
        <div className="toolbar-search">
          <input
            className="input input-sm"
            type="search"
            aria-label="Protokoll durchsuchen"
            placeholder="Suche nach Nr., Name, E-Mail, Details…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="toolbar-field">
          <span className="sr-only">Aktion</span>
          <select className="input input-sm" value={filter.action ?? ""} onChange={(e) => set("action")(e.target.value)}>
            <option value="">Alle Aktionen</option>
            {LOG_ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-field">
          <span className="sr-only">Benutzer</span>
          <select className="input input-sm" value={filter.user ?? ""} onChange={(e) => set("user")(e.target.value)}>
            <option value="">Alle Benutzer</option>
            <option value="-">Öffentlich / unbekannt</option>
            {data?.users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-field log-date">
          <span>Von</span>
          <input className="input input-sm" type="date" value={filter.from ?? ""} onChange={(e) => set("from")(e.target.value)} />
        </label>
        <label className="toolbar-field log-date">
          <span>Bis</span>
          <input className="input input-sm" type="date" value={filter.to ?? ""} onChange={(e) => set("to")(e.target.value)} />
        </label>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilter({});
            }}
          >
            Filter zurücksetzen
          </Button>
        )}
      </section>

      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {!data ? (
        !error && <p role="status">Protokoll wird geladen…</p>
      ) : (
        <>
          <p className="muted small" aria-live="polite">
            {data.entries.length} Eintr{data.entries.length === 1 ? "ag" : "äge"}
            {data.truncated && " (nur die neuesten 1000 – Filter eingrenzen)"}
            {loading && " · wird aktualisiert…"}
          </p>
          {data.entries.length === 0 ? (
            <div className="card empty-state">
              <h2>Keine Einträge</h2>
              <p className="muted">Für diese Filter wurden keine Aktionen protokolliert.</p>
            </div>
          ) : (
            <ul className="log-list">
              {data.entries.map((e) => (
                <li key={e.id} className={`log-row log-${tone(e.action)} ${e.undoable ? "is-undoable" : ""} ${e.undoneAt ? "is-undone" : ""}`}>
                  <time className="log-time" dateTime={e.createdAt}>
                    {formatDateTime(e.createdAt)}
                  </time>
                  <span className="log-user">{e.username ?? "Öffentlich"}</span>
                  <span className="log-action">{logActionLabel(e.action)}</span>
                  <span className="log-text">
                    {e.target && <strong>{e.target}</strong>}
                    {e.target && e.details && " · "}
                    {e.details}
                    {e.undoneAt && (
                      <span className="log-undone">
                        ↩️ Rückgängig gemacht von {e.undoneBy ?? "unbekannt"} · {formatDateTime(e.undoneAt)}
                      </span>
                    )}
                  </span>
                  {e.undoable && (
                    <button type="button" className="log-undo" onClick={() => askUndo(e)} aria-label={`${logActionLabel(e.action)} vom ${formatDateTime(e.createdAt)} rückgängig machen`}>
                      ↩️ Rückgängig
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {toUndo && (
        <ConfirmDialog
          title="Aktion wirklich rückgängig machen?"
          confirmLabel="Ja, rückgängig machen"
          loading={undoing}
          confirmDisabled={undoWarning !== ""}
          onCancel={() => setToUndo(null)}
          onConfirm={confirmUndo}
        >
          Bist du sicher? Genau diese Aktion wird zurückgenommen:
          <br />
          <strong>{logActionLabel(toUndo.action)}</strong> · {formatDateTime(toUndo.createdAt)} · {toUndo.username ?? "Öffentlich"}
          {toUndo.target && (
            <>
              <br />
              {toUndo.target}
            </>
          )}
          {toUndo.details && (
            <>
              <br />
              <span className="muted">{toUndo.details}</span>
            </>
          )}
          {toUndo.action === "status_geaendert" && (
            <>
              <br />
              <label className="checkbox-inline undo-notify">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Person per E-Mail über den wiederhergestellten Status informieren
              </label>
            </>
          )}
          {undoWarning === null && (
            <span className="undo-check" role="status">
              <br />⏳ Prüfe auf Konflikte…
            </span>
          )}
          {undoWarning && (
            <span className="undo-warning" role="alert">
              {undoWarning}
            </span>
          )}
          {undoError && (
            <span className="field-error" role="alert">
              <br />
              {undoError}
            </span>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
