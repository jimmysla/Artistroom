import { useState, type FormEvent } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { statusLabel } from "../../../shared/registration";
import Spinner from "../Spinner";
import { formatNet, hasTicket, parseEuroToCents } from "../../../shared/registration";
import { api, ApiError, type Registration } from "../../lib/api";
import { useEvent } from "../../lib/event";

interface Props {
  registration: Registration;
  onChange: (status: string, amountCents?: number) => Promise<void>;
}

type Action = "kostenlos" | "zahlung_angefordert" | "bezahlt" | "abgelehnt" | "ausstehend";

// The three decisions an admin makes per registration, plus follow-ups (mark as paid / undo).
export default function StatusActions({ registration: r, onChange }: Props) {
  const [confirmation, setConfirmation] = useState<{ status: Action; amountCents?: number } | null>(null);
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [amount, setAmount] = useState(r.amountCents ? String(r.amountCents / 100).replace(".", ",") : "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const ticketPrice = useEvent()?.ticketPrice ?? "";
  // Prefill with the ticket price from the settings unless an amount was already requested.
  const startRequest = () => {
    if (!amount && ticketPrice) setAmount(ticketPrice);
    setRequesting(true);
  };

  const run = (status: Action, amountCents?: number) => { setSendError(""); setConfirmation({ status, amountCents }); };
  const confirm = async () => {
    if (!confirmation) return;
    setBusy(confirmation.status); setSendError("");
    try {
      await onChange(confirmation.status, confirmation.amountCents);
      setConfirmation(null); setRequesting(false);
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

  const submitAmount = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents == null) return setAmountError("Bitte einen gültigen Betrag eingeben, z. B. 25 oder 12,50.");
    run("zahlung_angefordert", cents);
  };

  if (requesting) {
    return (
      <form className="status-actions status-actions-amount" onSubmit={submitAmount} noValidate>
        <label className={`amount-field ${amountError ? "has-error" : ""}`}>
          <span className="sr-only">Betrag in Euro</span>
          <input
            className="input input-sm"
            inputMode="decimal"
            placeholder={ticketPrice || "Betrag"}
            autoFocus
            value={amount}
            aria-invalid={Boolean(amountError) || undefined}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && setRequesting(false)}
          />
          <span className="amount-suffix" aria-hidden="true">€ netto</span>
        </label>
        <button type="submit" className="action-btn action-request" disabled={busy !== null}>
          {busy ? <Spinner /> : null} Anfordern
        </button>
        <button type="button" className="action-btn action-plain" onClick={() => setRequesting(false)} disabled={busy !== null}>
          Abbrechen
        </button>
        {amountError && (
          <p className="field-error amount-error" role="alert">
            {amountError}
          </p>
        )}
      </form>
    );
  }

  const button = (status: Action, label: string, className: string, onClick: () => unknown = () => run(status)) => (
    <button
      type="button"
      className={`action-btn ${className} ${r.status === status ? "is-current" : ""}`}
      aria-pressed={r.status === status}
      disabled={busy !== null}
      onClick={onClick}
    >
      {busy === status && <Spinner />}
      {label}
    </button>
  );

  return (
    <div className="status-actions" role="group" aria-label={`Status für ${r.name}`}>
      {button("kostenlos", "🎁 Kostenlos", "action-free")}
      {button(
        "zahlung_angefordert",
        r.status === "zahlung_angefordert" && r.amountCents ? `💳 ${formatNet(r.amountCents)} ändern` : "💳 Zahlung anfordern",
        "action-request",
        startRequest,
      )}
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
