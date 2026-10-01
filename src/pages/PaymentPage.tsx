import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import Button from "../components/Button";
import Alert from "../components/Alert";

type Info = Awaited<ReturnType<typeof api.paymentStatus>>;
type Provider = "stripe" | "paypal" | "simulation";
const POLL_MS = 3000;
const PROVIDER_LABEL: Record<Provider, string> = { stripe: "💳 Karte, Apple Pay & Co. (Stripe)", paypal: "🅿️ PayPal", simulation: "🧪 Simulation (ohne echten Zahlungsanbieter)" };
const providerName = (p: string | null) => (p === "paypal" ? "PayPal" : p === "stripe" ? "Stripe" : p === "simulation" ? "der Simulation" : "dem Zahlungsanbieter");

/**
 * /zahlung?ref=… – checkout linked from the payment mail: cart with the configured ticket product,
 * price from the system, choice of Stripe/PayPal. After returning from the provider the page is
 * blocked by a loading screen until the server has validated the payment; then the QR ticket mail
 * goes out automatically.
 */
export default function PaymentPage() {
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? "";
  const returned = params.get("zurueck") === "1";
  const cancelled = params.get("abgebrochen") === "1";
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [starting, setStarting] = useState(false);
  // After returning from the provider we wait for the server confirmation before allowing anything else.
  const [waiting, setWaiting] = useState(returned);

  const load = useCallback(async () => {
    try {
      const data = await api.paymentStatus(ref);
      setInfo(data);
      setError("");
      setProvider((p) => p ?? data.providers[0] ?? null);
      if (data.status !== "zahlung_angefordert") setWaiting(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zahlung konnte nicht geladen werden.");
    }
  }, [ref]);

  useEffect(() => {
    document.title = "Checkout";
    void load();
  }, [load]);

  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, [waiting, load]);

  const pay = async () => {
    if (!provider) return;
    setStarting(true);
    setError("");
    try {
      const { url } = await api.startPayment(ref, provider);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zahlung konnte nicht gestartet werden.");
      setStarting(false);
    }
  };

  const open = info?.status === "zahlung_angefordert";

  return (
    <div className="page">
      <main className="container checkout-page">
        <img className="login-logo" src="/logo-640.webp" alt="" width="110" height="110" />
        {!info && !error && <p role="status">Checkout wird geladen…</p>}
        {error && <Alert>{error}</Alert>}
        {info?.test && (
          <div className="test-banner" role="note">
            🧪 <strong>Testmodus</strong> – dieser Warenkorb ist ein Testkauf. Es wird kein Ticket verschickt. Mit Stripe-Testschlüssel (<code>sk_test_…</code>) bzw. PayPal-Sandbox wird kein echtes Geld bewegt.
          </div>
        )}
        {info && info.status === "bezahlt" && (
          <section className="card checkout-card checkout-done">
            <h1>✅ Zahlung bestätigt</h1>
            <p>{info.test ? "Testkauf erfolgreich: Die Zahlung wurde serverseitig geprüft. Im Echtbetrieb würde jetzt das QR-Ticket per E-Mail verschickt." : "Danke! Deine Zahlung ist bei uns eingegangen. Dein QR-Ticket ist per E-Mail unterwegs."}</p>
            <p className="muted small">Anmeldung {info.number} · {info.name}</p>
          </section>
        )}
        {info && !open && info.status !== "bezahlt" && (
          <section className="card checkout-card">
            <h1>Keine Zahlung offen</h1>
            <p>Für diese Anmeldung ist keine Zahlung (mehr) offen.</p>
          </section>
        )}
        {info && open && (
          <section className="card checkout-card" aria-busy={waiting || starting}>
            <p className="eyebrow">{info.event} · Checkout</p>
            <h1>🛒 Warenkorb</h1>

            <div className="cart-item">
              {info.product.image ? <img src={info.product.image} alt="" className="cart-image" /> : <div className="cart-image cart-image-placeholder" aria-hidden="true">🎟️</div>}
              <div className="cart-info">
                <strong>{info.product.name}</strong>
                {info.product.description && <p className="muted">{info.product.description}</p>}
                <span className="muted small">Anmeldung {info.number} · {info.name} · Menge 1</span>
              </div>
              <strong className="cart-price">{info.amount}</strong>
            </div>

            <dl className="cart-sum">
              {info.product.vatRate > 0 ? (
                <>
                  <div><dt>Nettopreis</dt><dd>{info.product.net}</dd></div>
                  <div><dt>MwSt. {info.product.vatRate} %</dt><dd>{info.product.vat}</dd></div>
                </>
              ) : (
                <div><dt>Ticketpreis</dt><dd>{info.amount}</dd></div>
              )}
              <div className="cart-total"><dt>Gesamt{info.product.vatRate > 0 ? " inkl. MwSt." : ""}</dt><dd>{info.product.vatRate > 0 ? info.total : info.amount}</dd></div>
            </dl>

            {waiting ? (
              <div className="payment-waiting" role="status" aria-live="polite">
                <span className="payment-spinner" aria-hidden="true" />
                <strong>Zahlung wird von {providerName(info.provider)} bestätigt…</strong>
                <span className="muted">Bitte warte einen Moment und schließe diese Seite nicht. Sobald die Zahlung serverseitig geprüft ist, kommt dein QR-Ticket per E-Mail.</span>
              </div>
            ) : info.providers.length === 0 ? (
              <Alert>Die Online-Zahlung ist gerade nicht verfügbar. Bitte kontaktiere das Team.</Alert>
            ) : (
              <>
                {cancelled && <Alert tone="info">Die Zahlung wurde abgebrochen. Du kannst es jederzeit erneut versuchen.</Alert>}
                <fieldset className="pay-methods">
                  <legend>Zahlungsart</legend>
                  {info.providers.map((p) => (
                    <label key={p} className={`choice ${provider === p ? "is-on" : ""}`}>
                      <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} /> {PROVIDER_LABEL[p]}
                    </label>
                  ))}
                </fieldset>
                <Button className="btn-block" loading={starting} disabled={!provider} onClick={pay}>
                  Jetzt {info.product.vatRate > 0 ? info.total : info.amount} bezahlen
                </Button>
                <p className="muted small">Du wirst sicher zu {providerName(provider)} weitergeleitet. Danach wartet diese Seite auf die Bestätigung.</p>
              </>
            )}
          </section>
        )}
      </main>
      {/* Blocks the whole page while redirecting / while the server confirmation is pending. */}
      {(waiting || starting) && <div className="payment-blocker" aria-hidden="true" />}
    </div>
  );
}
