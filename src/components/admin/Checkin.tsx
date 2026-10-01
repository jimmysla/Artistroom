import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { api, formatDateTime, type Registration } from "../../lib/api";
import { formatRegistrationNumber, hasTicket } from "../../../shared/registration";
import { categoriesInUse, categoryName, findCategory, type CheckinDesign } from "../../../shared/registration-form";
import { useCategories, useEvent } from "../../lib/event";
import CheckinSplash from "./CheckinSplash";
import Button from "../Button";
export default function Checkin({ rows, refresh }: { rows: Registration[]; refresh: () => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<HTMLDivElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const session = useRef(0);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [result, setResult] = useState<{ registration: Registration; alreadyCheckedIn: boolean } | null>(null);
  const [success, setSuccess] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Check-in animation (Dashboard → Anmeldung); shown when a valid ticket is scanned.
  const [design, setDesign] = useState<CheckinDesign | null>(null);
  const [splash, setSplash] = useState<{ registration: Registration; state: "ready" | "already" } | null>(null);
  const categories = useCategories();
  const eventName = useEvent()?.name ?? "";
  const categoryLabel = (id: string) => categoryName(id, categories);
  // Ref too: the camera callback keeps the inspect() of the moment the camera was started.
  const designRef = useRef<CheckinDesign | null>(null);
  useEffect(() => { api.registrationForm().then(r => { designRef.current = r.form.checkin; setDesign(r.form.checkin); }).catch(() => setDesign(null)); }, []);
  const closeSplash = useCallback(() => setSplash(null), []);
  const stop = () => { session.current++; controls.current?.stop(); controls.current = null; setCamera(false); };
  useEffect(() => { const hide = () => { if (document.hidden) stop(); }; document.addEventListener("visibilitychange", hide); return () => { session.current++; controls.current?.stop(); document.removeEventListener("visibilitychange", hide); }; }, []);
  async function inspect(value: string) {
    stop(); setTicket(value); setBusy(true); setError(""); setResult(null); setSuccess(false);
    try {
      const r = await api.checkin(value);
      setResult(r);
      if (designRef.current?.enabled) setSplash({ registration: r.registration, state: r.alreadyCheckedIn ? "already" : "ready" });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function start() {
    stop(); const generation = session.current; setCamera(true); setError(""); setResult(null); setSuccess(false);
    let captured = false;
    try {
      const reader = new BrowserQRCodeReader();
      const scanner = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current!, (decoded, _error, scanner) => {
        if (!decoded || captured || generation !== session.current) return;
        captured = true; scanner.stop(); void inspect(decoded.getText());
      });
      if (generation !== session.current || captured) scanner.stop(); else controls.current = scanner;
    } catch { if (generation === session.current) { stop(); setError("Kamera nicht verfügbar. Bitte Kamerazugriff erlauben und die Seite über HTTPS öffnen. Alternativ Ticketcode eingeben."); } }
  }
  async function admit(value: string) {
    setBusy(true); setError("");
    try { const r = await api.checkin(value, true); setResult(r); setTicket(value); setSuccess(!r.alreadyCheckedIn); setSplash(null); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  // Only people with a ticket belong here – rejected / pending registrations never show up.
  const tickets = rows.filter(r => hasTicket(r.status));
  const checked = tickets.filter(r => r.checkedInAt);
  const pending = tickets.filter(r => !r.checkedInAt);
  const expected = tickets.length;
  const pct = expected ? Math.round((checked.length / expected) * 100) : 0;
  const visible = (filter === "checked" ? checked : filter === "pending" ? pending : tickets)
    .filter(r => `${r.name} ${r.firstName ?? ""} ${r.lastName ?? ""} ${categoryLabel(r.category)} ${formatRegistrationNumber(r.id)}`.toLowerCase().includes(search.toLowerCase()))
    // Not yet admitted first (alphabetical), then admitted (latest first), then not approved.
    .sort((a, b) => rank(a) - rank(b) || (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? "") || a.name.localeCompare(b.name));
  const r = result?.registration;
  const banner = !r ? null : r.checkedInAt ? (success ? "ok" : "already") : "ready";
  const realName = (x: Registration) => [x.firstName, x.lastName].filter(Boolean).join(" ");

  return <section className="checkin-panel"><h1>Check-in</h1><p className="muted">QR-Ticket scannen, Namen prüfen und Einlass bestätigen.</p>
    <div className="checkin-stats" role="group" aria-label="Einlass-Status">
      <button type="button" className={`checkin-stat is-in ${filter === "checked" ? "is-active" : ""}`} onClick={() => setFilter(filter === "checked" ? "all" : "checked")}><span>✅ Eingelassen</span><strong>{checked.length}</strong></button>
      <button type="button" className={`checkin-stat is-pending ${filter === "pending" ? "is-active" : ""}`} onClick={() => setFilter(filter === "pending" ? "all" : "pending")}><span>⏳ Noch nicht da</span><strong>{pending.length}</strong></button>
      <button type="button" className={`checkin-stat is-total ${filter === "all" ? "is-active" : ""}`} onClick={() => setFilter("all")}><span>🎟️ Eingecheckt</span><strong>{checked.length}/{expected}</strong></button>
      <div className="checkin-progress" aria-label={`${checked.length} von ${expected} Gästen eingelassen`}><div><span style={{ width: `${pct}%` }} /></div><small>{checked.length} von {expected} Gästen eingelassen · {pct} %</small></div>
    </div>

    <div className="checkin-scanner" ref={scanner}><div className="scanner-actions"><Button onClick={camera ? stop : start} disabled={busy}>{camera ? "Kamera stoppen" : "📷 Kamera öffnen"}</Button><span className="muted">Rückkamera · kein Foto wird gespeichert</span></div>
      <video ref={video} className={camera ? "scanner-video" : "scanner-video is-hidden"} muted playsInline />
      <form className="ticket-entry" onSubmit={e => { e.preventDefault(); void inspect(ticket.trim()); }}><label htmlFor="ticket-code">Ticketcode alternativ eingeben</label><div><input id="ticket-code" className="input" value={ticket} onChange={e => setTicket(e.target.value)} placeholder="artistroom:…" /><Button type="submit" variant="secondary" disabled={!ticket.trim() || busy}>Prüfen</Button></div></form>
      {error && <div className="scan-banner is-invalid" role="alert"><strong>⛔ Kein Einlass</strong><span>{error}</span></div>}
      {busy && <p role="status">Ticket wird geprüft…</p>}
      {r && <div className={`scan-banner is-${banner}`} role="status">
        <strong>{banner === "ok" ? "✅ EINLASS OK" : banner === "already" ? "⚠️ BEREITS EINGECHECKT" : "🎟️ TICKET GÜLTIG"}</strong>
        <span className="scan-meta">{formatRegistrationNumber(r.id)} · {categoryLabel(r.category)}</span>
        <h2>{r.name}</h2>
        {(realName(r) || r.city) && <p>{realName(r)}{r.city && ` · ${r.city}`}</p>}
        {r.instagram && <p>@{r.instagram}</p>}
        {r.checkedInAt
          ? <p className="scan-time">{banner === "ok" ? "Eingelassen um" : "Wurde bereits eingelassen um"} {formatDateTime(r.checkedInAt)} Uhr{banner === "already" && " – nicht erneut einlassen!"}</p>
          : <><p>Noch nicht eingecheckt</p><Button loading={busy} onClick={() => admit(ticket)}>✅ Einlass bestätigen</Button></>}
      </div>}
    </div>

    <h2>Einlassübersicht</h2><p className="muted">Automatische Aktualisierung alle 5 Sekunden · Zeiten in Europe/Berlin</p>
    <nav className="checkin-filter" aria-label="Check-in filtern">{([["all", "Alle Tickets", tickets.length], ["pending", "⏳ Noch nicht da", pending.length], ["checked", "✅ Eingelassen", checked.length]] as const).map(([id, label, count]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <strong>{count}</strong></button>)}</nav>
    <div className="category-summary">{categoriesInUse(categories, tickets.map(t => t.category)).map(c => <span key={c.id}>{c.icon} {c.label}: {checked.filter(r => r.category === c.id).length} / {checked.filter(r => r.category === c.id).length + pending.filter(r => r.category === c.id).length}</span>)}</div>
    <input className="input" type="search" aria-label="Check-in-Liste durchsuchen" placeholder="Name, Nummer oder Kategorie suchen…" value={search} onChange={e => setSearch(e.target.value)} />
    <ul className="checkin-list">{visible.map(x => {
      const state = x.checkedInAt ? "in" : "pending";
      return <li key={x.id} className={`checkin-row is-${state}`}>
        <span className="checkin-icon" aria-hidden="true">{state === "in" ? "✅" : "⏳"}</span>
        <div><strong>{x.name}</strong><span>{formatRegistrationNumber(x.id)} · {categoryLabel(x.category)}{realName(x) && ` · ${realName(x)}`}</span></div>
        <div className="checkin-state">
          {state === "in" ? <span className="checkin-pill is-in">Eingelassen · {formatDateTime(x.checkedInAt!)} Uhr</span>
 : <><span className="checkin-pill is-pending">Noch nicht da</span>{x.ticketToken && <button type="button" className="action-btn action-free" disabled={busy} onClick={() => { void inspect(`artistroom:${x.ticketToken}`); scanner.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Einlass prüfen</button>}</>}
        </div>
      </li>;
    })}</ul>{visible.length === 0 && <p className="muted">Keine passenden Anmeldungen.</p>}
    {splash && design && <CheckinSplash design={design} category={findCategory(splash.registration.category, categories)} guest={splash.registration} state={splash.state} eventName={eventName} onClose={closeSplash} admitting={busy} onAdmit={() => void admit(ticket)} />}
  </section>;
}

const rank = (r: Registration) => (r.checkedInAt ? 1 : 0);
