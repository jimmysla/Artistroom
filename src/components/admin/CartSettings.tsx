import { useEffect, useState } from "react";
import { api, ApiError, type AdminSettings, type MailImage } from "../../lib/api";
import { formatEuro, formatNet, parseEuroToCents } from "../../../shared/registration";
import { priceBreakdown, type Product } from "../../../shared/product";
import Button from "../Button";
import Alert from "../Alert";

/**
 * Menu "Warenkorb": the ticket product shown on the checkout page (/zahlung) – which is the
 * standard payment link of every payment mail – plus a test purchase with real redirect.
 */
export default function CartSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminSettings | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<MailImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const handle = (e: unknown, fallback: string) => {
    if (e instanceof ApiError && e.status === 401) return onUnauthorized();
    setError(e instanceof ApiError ? e.message : fallback);
  };

  useEffect(() => {
    api.settings().then((d) => { setData(d); setProduct(d.product); }).catch((e) => handle(e, "Einstellungen konnten nicht geladen werden."));
    api.mailImages().then((r) => setImages(r.images)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Product>) => { setProduct({ ...product!, ...patch }); setDirty(true); setMessage(""); };

  const save = async () => {
    if (!data || !product) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveSettings(data.settings, data.mailTemplates, data.survey, product);
      setData(saved);
      setProduct(saved.product);
      setDirty(false);
      setMessage("✅ Warenkorb gespeichert.");
    } catch (e) {
      handle(e, "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the checkout.
    const tab = window.open("about:blank", "_blank");
    setTesting(true);
    setError("");
    try {
      const { url } = await api.createTestCheckout();
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      handle(e, "Test-Warenkorb konnte nicht erstellt werden.");
    } finally {
      setTesting(false);
    }
  };

  if (!data || !product) return <section className="cart-settings"><h1>🛒 Warenkorb</h1>{error ? <Alert>{error}</Alert> : <p role="status">Wird geladen…</p>}</section>;

  const price = parseEuroToCents(data.settings.ticketPrice) ?? 100;
  const split = priceBreakdown(price, product.vatRate);
  const image = product.imageId ? `/api/mail-images/${product.imageId}` : product.imageUrl;
  const providers = [data.paymentProviders.stripe && "Stripe", data.paymentProviders.paypal && "PayPal"].filter(Boolean);

  return (
    <section className="cart-settings">
      <h1>🛒 Warenkorb</h1>
      <p className="muted">
        Die Checkout-Seite ist der Standard-Zahlungslink: Jede Zahlungs-E-Mail und jede Zahlungserinnerung führt dorthin. Der Gast sieht diesen Warenkorb, zahlt per {providers.length ? providers.join(" oder ") : "Stripe/PayPal"} und wartet auf einem Ladebildschirm, bis die Zahlung serverseitig bestätigt ist – dann wird automatisch auf „Bezahlt“ gestellt und das QR-Ticket verschickt.
      </p>
      {!providers.length && <Alert tone="info">Noch kein Zahlungsanbieter eingerichtet – unter Einstellungen → Zahlung Stripe und/oder PayPal hinterlegen. Der Testkauf funktioniert bis dahin als Simulation.</Alert>}
      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="cart-layout">
        <div className="card cart-form">
          <h2>Produkt</h2>
          <div className="settings-fields">
            <label className="settings-field is-wide">
              Produktname
              <input className="input" maxLength={120} value={product.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="settings-field is-wide">
              Beschreibung
              <textarea className="input" rows={3} maxLength={1000} value={product.description} onChange={(e) => set({ description: e.target.value })} />
            </label>
            <label className="settings-field">
              Produktbild (hochgeladen unter Einstellungen → E-Mail → Bilder)
              <select className="input" value={product.imageId} onChange={(e) => set({ imageId: e.target.value })}>
                <option value="">{product.imageUrl ? "– Bild-Link –" : "– kein Bild –"}</option>
                {images.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            {!product.imageId && (
              <label className="settings-field">
                …oder Bild-Link (https)
                <input className="input" type="url" placeholder="https://…/ticket.jpg" value={product.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} />
              </label>
            )}
            <label className="settings-field">
              MwSt. (wird auf den Nettopreis aufgeschlagen)
              <select className="input" value={product.vatRate} onChange={(e) => set({ vatRate: Number(e.target.value) })}>
                <option value={0}>Keine aufschlagen</option>
                <option value={7}>7 %</option>
                <option value={19}>19 %</option>
              </select>
            </label>
            <div className="settings-field">
              Preis
              <span className="field-hint">Kommt vom System: der unter „Anmeldungen“ angeforderte Betrag (vorausgefüllt mit dem Ticketpreis {data.settings.ticketPrice ? `${data.settings.ticketPrice} € zzgl. Steuern` : "aus den Einstellungen"}). Alle Preise sind Nettopreise.</span>
            </div>
          </div>
          <div className="settings-save">
            <Button loading={busy} disabled={!dirty} onClick={save}>Warenkorb speichern</Button>
          </div>
        </div>

        <div className="card cart-preview">
          <h2>Vorschau</h2>
          <div className="cart-item">
            {image ? <img src={image} alt="" className="cart-image" /> : <div className="cart-image cart-image-placeholder" aria-hidden="true">🎟️</div>}
            <div className="cart-info">
              <strong>{product.name}</strong>
              {product.description && <p className="muted">{product.description}</p>}
              <span className="muted small">Menge 1</span>
            </div>
            <strong className="cart-price">{formatNet(price)}</strong>
          </div>
          <dl className="cart-sum">
            {product.vatRate > 0 && (
              <>
                <div><dt>Nettopreis</dt><dd>{formatNet(split.net)}</dd></div>
                <div><dt>MwSt. {product.vatRate} %</dt><dd>{formatEuro(split.vat)}</dd></div>
              </>
            )}
            <div className="cart-total"><dt>Gesamt{product.vatRate > 0 ? " inkl. MwSt." : ""}</dt><dd>{product.vatRate > 0 ? formatEuro(split.gross) : formatNet(price)}</dd></div>
          </dl>
          <Button variant="secondary" loading={testing} disabled={dirty} onClick={test}>🧪 Checkout testen</Button>
          <p className="muted small">
            {dirty ? "Erst speichern, dann testen. " : ""}Öffnet die Checkout-Seite in einem neuen Tab – mit Weiterleitung zu Stripe/PayPal und Ladebildschirm bis zur Bestätigung (ohne Zugangsdaten als Simulation). Es wird kein Ticket verschickt. Mit Live-Schlüsseln ist ein Testkauf eine echte Zahlung.
          </p>
        </div>
      </div>
    </section>
  );
}
