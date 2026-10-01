import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Checkin from "./Checkin";
import EventSettings from "./EventSettings";
import SurveyResults from "./SurveyResults";
import CartSettings from "./CartSettings";
import AuditLog from "./AuditLog";
import UserManagement from "./UserManagement";
import RegistrationFormSettings from "./RegistrationFormSettings";
import { can, type AdminIdentity, type Permission } from "../../../shared/admin";
import { EventMeta } from "../../lib/event";
import Button from "../Button";
import Alert from "../Alert";
import Spinner from "../Spinner";
import StatsOverview from "./StatsOverview";
import RegistrationList from "./RegistrationList";
import RegistrationDetail from "./RegistrationDetail";
import ConfirmDialog from "./ConfirmDialog";
import { api, ApiError, REGISTRATION_CHANNEL, type Registration } from "../../lib/api";
import { STATUSES, formatRegistrationNumber, matchesStatus, ACCEPTED_ICON } from "../../../shared/registration";
import { categoriesInUse } from "../../../shared/registration-form";
import { useCategories } from "../../lib/event";

const POLL_MS = 5_000;

type Sort = "newest" | "oldest";

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  user: AdminIdentity;
  onLoggedOut: () => void;
}

const TABS: { id: string; label: string; permission: Permission | "super" }[] = [
  { id: "registrations", label: "Anmeldungen", permission: "anmeldungen" },
  { id: "checkin", label: "Check-in", permission: "checkin" },
  { id: "cart", label: "Warenkorb", permission: "einstellungen" },
  { id: "settings", label: "Einstellungen", permission: "einstellungen" },
  { id: "anmeldung", label: "Anmeldung", permission: "super" },
  { id: "survey", label: "Umfrage", permission: "umfrage" },
  { id: "logging", label: "Logging", permission: "logging" },
  { id: "users", label: "Benutzer", permission: "super" },
];

export default function AdminDashboard({ user, onLoggedOut }: Props) {
  const username = user.username;
  const [menuOpen, setMenuOpen] = useState(() => localStorage.getItem("menu-open") !== "0");
  const toggleMenu = (open: boolean) => {
    setMenuOpen(open);
    try { localStorage.setItem("menu-open", open ? "1" : "0"); } catch { /* private mode */ }
  };
  const allowed = (p: Permission | "super") => (p === "super" ? user.isSuper : can(user, p));
  const tabs = TABS.filter((t) => allowed(t.permission));
  const categories = useCategories();
  const needsRows = allowed("anmeldungen") || allowed("checkin");
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? "";
  const [rows, setRows] = useState<Registration[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const [detail, setDetail] = useState<Registration | null>(null);
  const [toDelete, setToDelete] = useState<Registration | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const knownIds = useRef<Set<number> | null>(null);

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return;
      }
      setToast({ tone: "error", text: err instanceof ApiError ? err.message : fallback });
    },
    [onLoggedOut],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!needsRows) return setLoading(false);
      if (!silent) setLoading(true);
      try {
        const { registrations } = await api.listRegistrations();
        // Highlight rows that appeared since the previous fetch.
        if (knownIds.current) {
          const added = registrations.filter((r) => !knownIds.current!.has(r.id)).map((r) => r.id);
          if (added.length) {
            setFreshIds(new Set(added));
            setToast({ tone: "success", text: `${added.length} neue Anmeldung${added.length > 1 ? "en" : ""}` });
          }
        }
        knownIds.current = new Set(registrations.map((r) => r.id));
        setRows(registrations);
        setDetail(d => d ? registrations.find(r => r.id === d.id) ?? null : null);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return onLoggedOut();
        setError(err instanceof ApiError ? err.message : "Die Anmeldungen konnten nicht geladen werden.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onLoggedOut, needsRows],
  );

  useEffect(() => {
    document.title = "Dashboard · Artistroom";
    load();
  }, [load]);

  // Live updates: poll while the tab is visible, and react instantly to same-browser submissions.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && load(true);
    const interval = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(REGISTRATION_CHANNEL);
      channel.onmessage = () => load(true);
    } catch {
      /* unsupported */
    }
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      channel?.close();
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!freshIds.size) return;
    const t = window.setTimeout(() => setFreshIds(new Set()), 8000);
    return () => window.clearTimeout(t);
  }, [freshIds]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase().replace(/^@/, "");
    const list = rows.filter((r) => {
      if (category && r.category !== category) return false;
      if (!matchesStatus(r.status, status)) return false;
      if (date && localDay(r.createdAt) !== date) return false;
      if (
        q &&
        ![r.name, r.firstName ?? "", r.lastName ?? "", `${r.firstName ?? ""} ${r.lastName ?? ""}`, r.email, r.instagram ?? "", r.tiktok ?? "", r.city ?? "", r.referredBy ?? "", formatRegistrationNumber(r.id)].some((v) => v.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
    list.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort === "newest" ? -diff : diff;
    });
    return list;
  }, [rows, search, category, status, date, sort]);

  const hasFilters = Boolean(search || category || status || date);
  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setStatus("");
    setDate("");
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      onLoggedOut();
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteRegistration(toDelete.id);
      setRows((r) => r?.filter((x) => x.id !== toDelete.id) ?? null);
      knownIds.current?.delete(toDelete.id);
      if (detail?.id === toDelete.id) setDetail(null);
      setToast({ tone: "success", text: "Anmeldung gelöscht" });
      setToDelete(null);
    } catch (err) {
      handleError(err, "Löschen fehlgeschlagen.");
    } finally {
      setDeleting(false);
    }
  };

  const changeStatus = async (reg: Registration, next: string, amountCents?: number) => {
    try {
      const { registration } = await api.updateStatus(reg.id, reg.revision, next, amountCents);
      setRows((r) => r?.map((x) => (x.id === registration.id ? registration : x)) ?? null);
      setDetail((d) => (d?.id === registration.id ? registration : d));
      setToast({ tone: "success", text: "Status aktualisiert · E-Mail an den Versanddienst übergeben" });
    } catch (err) {
      handleError(err, "Status konnte nicht geändert werden.");
      throw err;
    }
  };

  const resetAll = async (confirm: string, username: string, password: string) => {
    try {
      const { deleted } = await api.resetRegistrations(confirm, username, password);
      setRows([]);
      knownIds.current = new Set();
      setDetail(null);
      setToast({ tone: "success", text: `${deleted} Anmeldung${deleted === 1 ? "" : "en"} gelöscht · Nummerierung beginnt wieder bei #0001` });
      return deleted;
    } catch (err) {
      // Wrong credentials are shown inside the dialog; only a lost session leaves it.
      if (err instanceof ApiError && err.status === 401) handleError(err, "");
      throw err;
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.exportCsv();
    } catch (err) {
      handleError(err, "Export fehlgeschlagen.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page admin-page">
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-brand">
            <img className="admin-logo" src="/logo-256.webp" alt="Artistroom" width="44" height="44" />
            <span className="admin-badge">Dashboard</span>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-user" title={username}>
              {username}
            </span>
            <Link to="/" className="btn btn-ghost btn-sm">
              Zur Anmeldung
            </Link>
            <Button variant="secondary" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {/* Collapsible main menu (state remembered); collapsed it shows only the current area. */}
        <nav className={`admin-menu ${menuOpen ? "" : "is-collapsed"}`} aria-label="Verwaltung">
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} onClick={() => toggleMenu(!menuOpen)} title={menuOpen ? "Menü einklappen" : "Menü ausklappen"}>
            {menuOpen ? "◀" : "☰"}
          </button>
          {menuOpen
            ? tabs.map(({ id, label }) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setParams({ tab: id })}>{label}</button>)
            : <button type="button" aria-current="page" onClick={() => toggleMenu(true)}>{tabs.find((t) => t.id === tab)?.label ?? "Menü"} ▾</button>}
        </nav>
        {!tab ? <div className="card empty-state"><h2>Keine Berechtigungen</h2><p className="muted">Deinem Konto sind noch keine Bereiche freigegeben. Bitte wende dich an einen Super User.</p></div>
        : tab === "users" ? <UserManagement currentUser={username} onUnauthorized={onLoggedOut} />
        : tab === "anmeldung" ? <RegistrationFormSettings onUnauthorized={onLoggedOut} />
        : tab === "logging" ? <AuditLog onUnauthorized={onLoggedOut} />
        : tab === "survey" ? <SurveyResults onUnauthorized={onLoggedOut} />
        : tab === "cart" ? <CartSettings onUnauthorized={onLoggedOut} />
        : tab === "settings" ? <EventSettings isSuper={user.isSuper} registrationCount={rows?.length ?? 0} onReset={resetAll} /> : tab === "checkin" ? <>
          {error && <Alert>{error}</Alert>}
          {lastUpdated && <p className="muted">Zuletzt aktualisiert: {lastUpdated.toLocaleTimeString("de-DE")}</p>}
          {rows ? <Checkin rows={rows} refresh={() => load(true)} /> : <p role="status">Check-in wird geladen…</p>}
        </> : <>

        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">Artistroom · Event-Dashboard</p>
            <h1>Anmeldungen verwalten</h1>
            <p className="muted">
              <EventMeta />
              {lastUpdated && (
                <span className="live-dot-wrap">
                  <span className="live-dot" aria-hidden="true" /> Live · aktualisiert{" "}
                  {lastUpdated.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </p>
          </div>
          <div className="admin-heading-actions">
            <Button variant="secondary" size="md" onClick={() => load()} loading={loading && rows !== null}>
              ↻ Aktualisieren
            </Button>
            {allowed("export") && (
              <Button size="md" onClick={exportCsv} loading={exporting} disabled={!rows?.length}>
                CSV exportieren
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert>
            {error}{" "}
            <button type="button" className="link-btn" onClick={() => load()}>
              Erneut versuchen
            </button>
          </Alert>
        )}

        {rows === null && loading && (
          <div className="admin-loading">
            <Spinner label="Anmeldungen werden geladen" />
            <span className="muted">Anmeldungen werden geladen…</span>
          </div>
        )}

        {rows && (
          <>
            <StatsOverview
              rows={rows}
              activeStatus={status}
              activeCategory={category}
              onSelectStatus={setStatus}
              onSelectCategory={setCategory}
            />

            <div className="section-head">
              <h2>Teilnehmer</h2>
              <p className="result-count muted" aria-live="polite">
                {filtered.length} von {rows.length} Anmeldung{rows.length === 1 ? "" : "en"}
              </p>
            </div>

            <section className="card toolbar" aria-label="Filter">
              <div className="toolbar-search">
                <label htmlFor="f-search" className="sr-only">
                  Suche
                </label>
                <input
                  id="f-search"
                  className="input input-sm"
                  type="search"
                  placeholder="Suche nach Nr., Name, Stadt, E-Mail, Instagram, Empfehlung…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="toolbar-field">
                <span className="sr-only">Kategorie</span>
                <select className="input input-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Alle Kategorien</option>
                  {categoriesInUse(categories, (rows ?? []).map((r) => r.category)).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-field">
                <span className="sr-only">Status</span>
                <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Alle Status</option>
                  <option value="angenommen">{ACCEPTED_ICON} Angenommen (alle)</option>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-field">
                <span className="sr-only">Datum</span>
                <input className="input input-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="toolbar-field">
                <span className="sr-only">Sortierung</span>
                <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="newest">Neueste zuerst</option>
                  <option value="oldest">Älteste zuerst</option>
                </select>
              </label>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
              )}
            </section>

            {rows.length === 0 ? (
              <div className="card empty-state">
                <span className="empty-icon" aria-hidden="true">🎟️</span>
                <h2>Noch keine Anmeldungen</h2>
                <p className="muted">Sobald sich jemand registriert, erscheint die Anmeldung hier automatisch.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="card empty-state">
                <span className="empty-icon" aria-hidden="true">🔍</span>
                <h2>Keine Treffer</h2>
                <p className="muted">Für diese Filter gibt es keine Anmeldungen.</p>
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
              </div>
            ) : (
              <RegistrationList
                rows={filtered}
                freshIds={freshIds}
                onOpen={setDetail}
                onDelete={allowed("loeschen") ? setToDelete : undefined}
                onStatusChange={allowed("status") ? changeStatus : undefined}
              />
            )}
          </>
        )}
        </>}
      </main>

      {detail && (
        <RegistrationDetail
          registration={detail}
          onClose={() => setDetail(null)}
          onDelete={allowed("loeschen") ? () => setToDelete(detail) : undefined}
          onStatusChange={allowed("status") ? (s, amount) => changeStatus(detail, s, amount) : undefined}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Anmeldung löschen?"
          confirmLabel="Endgültig löschen"
          loading={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Die Anmeldung von <strong>{toDelete.name}</strong> ({toDelete.email}) wird dauerhaft gelöscht – auch alle
          Log-Einträge zu dieser Person. Dies kann nicht rückgängig gemacht werden.
        </ConfirmDialog>
      )}


      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.tone === "success" ? "✓" : "!"} {toast.text}
        </div>
      )}
    </div>
  );
}
