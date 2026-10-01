import { createContext, useContext, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { statusLabel } from "../../../shared/registration";
import Spinner from "../Spinner";
import { formatNet, hasTicket, matchesStatus, parseEuroToCents } from "../../../shared/registration";
import { api, ApiError, type Registration } from "../../lib/api";
import { useEvent } from "../../lib/event";

interface Props {
  registration: Registration;
  onChange: (status: string, amountCents?: number) => Promise<void>;
}

/** Places taken by accepted registrations, provided by the dashboard (null = not loaded). */
export const TicketsTakenContext = createContext<number | null>(null);

type Action = "kostenlos" | "zahlung_angefordert" | "bezahlt" | "abgelehnt" | "ausstehend";

// The three decisions an admin makes per registration, plus follow-ups (mark as paid / undo).
export default function StatusActions({ registration: r, onChange }: Props) {
  const [confirmation, setConfirmation] = useState<{ status: Action; amountCents?: number } | null>(null);
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  // The amount is always the ticket price from the settings (the server uses it too) – no price field.
  const event = useEvent();
  const ticketCents = parseEuroToCents(event?.ticketPrice ?? "");
  // Ticket limit (Einstellungen → Tickets): when reached, nobody else can be approved (server checks too).
  const maxTickets = event?.ticketLimit ?? null;
  const taken = useContext(TicketsTakenContext);
  // Someone who already holds a place (legacy manual payment request) doesn't need a new one.
  const holdsPlace = matchesStatus(r.status, "angenommen");
  const soldOut = maxTickets != null && !holdsPlace && (taken != null ? taken >= maxTickets : Boolean(event?.soldOut));
  const soldOutTitle = soldOut ? `Ausverkauft – ${taken ?? maxTickets} von ${maxTickets} Tickets vergeben` : undefined;

  const run = (status: Action, amountCents?: number) => { setSendError(""); setConfirmation({ status, amountCents }); };
  const confirm = async () => {
    if (!confirmation) return;
    setBusy(confirmation.status); setSendError("");
    try {
      await onChange(confirmation.status, confirmation.amountCents);
      setConfirmation(null);
    } catch (e) { setSendError((e as Error).message); } finally { setBusy(null); }
  };
  if (confirmation) return <ConfirmDialog title="Status ändern und E-Mail senden?" confirmLabel="Bestätigen und senden" loading={busy !== null} onCancel={() => setConfirmation(null)} onConfirm={confirm}>
    Empfänger: <strong>{r.email}</strong><br />Name: {r.name}<br />Neuer Status: <strong>{statusLabel(confirmation.status)}</strong>
    {(confirmation.amountCents ?? (confirmation.status === "bezahlt" ? r.amountCents : null)) != null && <><br />Betrag: {formatNet(confirmation.amountCents ?? r.amountCents!)}</>}
    <br />{["kostenlos", "bezahlt"].includes(confirmation.status) ? "Die E-Mail enthält ein QR-Ticket." : confirmation.status === "zahlung_angefordert" ? "Die E-Mail enthält den Link zum Checkout (Warenkorb). Nach der Zahlung wird automatisch auf „Bezahlt“ gestellt." : "Die Person erhält eine Nachricht über diesen Status."}
    {sendError && <span className="field-error" role="alert"><br />{sendError}</span>}
  </ConfirmDialog>;
  if (r.checkedInAt) return <p className="status-locked">✅ Bereits eingecheckt · nur noch Details</p>;
  // Once a ticket has been issued the status is locked – only the details can be viewed.
  if (hasTicket(r.status)) return <p className="status-locked">🎟️ Ticket ausgestellt · Status gesperrt, nur noch Details</p>;
  // Online payment: everything is locked until Stripe/PayPal confirms it on the server.
  if (r.status === "zahlung_angefordert" && r.paymentProvider)
    return (
      <div className="status-waiting-box">
        <p className="status-locked status-waiting"><span className="spinner-dot" aria-hidden="true" /> Zahlung ausstehend – wird automatisch auf „Bezahlt“ gesetzt, sobald {r.paymentProvider === "stripe" ? "Stripe" : r.paymentProvider === "paypal" ? "PayPal" : "Stripe/PayPal"} sie bestätigt{r.amountCents ? ` · ${formatNet(r.amountCents)}` : ""}</p>
        <PaymentReminder registration={r} />
      </div>
    );
  if (r.status === "abgelehnt") return <p className="status-locked">❌ Abgelehnt · Status gesperrt, nur noch Details</p>;

  const button = (status: Action, label: string, className: string, onClick: () => unknown = () => run(status), disabled = false, title?: string) => (
    <button
      type="button"
      className={`action-btn ${className} ${r.status === status ? "is-current" : ""}`}
      aria-pressed={r.status === status}
      disabled={busy !== null || disabled}
      title={title}
      onClick={onClick}
    >
      {busy === status && <Spinner />}
      {label}
    </button>
  );

  return (
    <div className="status-actions" role="group" aria-label={`Status für ${r.name}`}>
      {soldOut && <p className="status-sold-out" role="status">🚫 Ausverkauft · {taken ?? maxTickets} von {maxTickets} Tickets vergeben – es kann niemand mehr genehmigt werden. Limit unter Einstellungen → Tickets.</p>}
      {button("kostenlos", "🎁 Kostenlos", "action-free", undefined, soldOut, soldOutTitle)}
      {button(
        "zahlung_angefordert",
        ticketCents ? `💳 Zahlung anfordern · ${formatNet(ticketCents)}` : "💳 Zahlung anfordern",
        "action-request",
        () => ticketCents && !soldOut && run("zahlung_angefordert", ticketCents),
        !ticketCents || soldOut,
        soldOutTitle ?? (ticketCents ? undefined : "Zuerst unter Einstellungen → Ticketpreis einen Preis hinterlegen"),
      )}
      {!ticketCents && <span className="muted small">Kein Ticketpreis hinterlegt – unter Einstellungen → Ticketpreis eintragen.</span>}
      {button("abgelehnt", "❌ Ablehnen", "action-reject")}
      {r.status !== "ausstehend" && button("ausstehend", "↩️ Zurücksetzen", "action-plain")}
    </div>
  );
}

/** Sends the configured "Zahlungserinnerung" mail (with checkout link) after a confirmation. */
function PaymentReminder({ registration: r }: { registration: Registration }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string }>({});
  const send = async () => {
    setBusy(true);
    setResult({});
    try {
      await api.sendPaymentReminder(r.id);
      setResult({ ok: true });
      setAsking(false);
    } catch (e) {
      setResult({ error: e instanceof ApiError ? e.message : "Erinnerung konnte nicht gesendet werden." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="action-btn action-request" onClick={() => setAsking(true)} disabled={busy}>
        🔔 Zahlungserinnerung senden
      </button>
      {result.ok && <span className="reminder-ok">✅ Erinnerung an {r.email} gesendet</span>}
      {asking && (
        <ConfirmDialog title="Zahlungserinnerung senden?" confirmLabel="Erinnerung senden" loading={busy} onCancel={() => setAsking(false)} onConfirm={send}>
          Empfänger: <strong>{r.email}</strong>
          <br />
          Die E-Mail „Zahlungserinnerung“ aus den Einstellungen wird mit dem Link zum Checkout verschickt.
          {result.error && <span className="field-error" role="alert"><br />{result.error}</span>}
        </ConfirmDialog>
      )}
    </>
  );
}
