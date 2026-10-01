import { useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";

/** What the site stores in the browser – only what is technically necessary, no tracking. */
const ENTRIES = [
  {
    name: "ar_admin_session",
    type: "Cookie",
    purpose: "Hält dich nach dem Login im Dashboard angemeldet. Wird nur beim Login gesetzt – Besucher der Anmeldeseite bekommen dieses Cookie nie.",
    duration: "8 Stunden bzw. bis zum Logout",
  },
  {
    name: "artistroom-registration-draft",
    type: "Session Storage",
    purpose: "Merkt sich deine Eingaben im Anmeldeformular, damit beim Neuladen nichts verloren geht. Wird nach dem Absenden gelöscht.",
    duration: "Bis zum Schließen des Tabs",
  },
  {
    name: "menu-open, fold:…",
    type: "Local Storage",
    purpose: "Nur im Dashboard: ob das Menü und einzelne Einstellungsbereiche auf- oder zugeklappt sind.",
    duration: "Bis du die Website-Daten im Browser löschst",
  },
];

export default function CookiesPage() {
  useEffect(() => {
    document.title = "Cookies · Artistroom";
  }, []);

  return (
    <div className="page">
      <main className="container survey-page">
        <Link to="/" className="back-link">
          <span aria-hidden="true">←</span> Zur Anmeldung
        </Link>
        <section className="card survey-card">
          <p className="eyebrow">Datenschutz</p>
          <h1>Cookies &amp; Speicherung im Browser</h1>
          <p className="muted">
            Diese Website verwendet <strong>ausschließlich technisch notwendige</strong> Cookies und Browser-Speicher. Es gibt kein Tracking, keine Analyse- oder
            Werbe-Cookies und keine Weitergabe an Dritte. Deshalb ist auch keine Einwilligung nötig (§ 25 Abs. 2 TDDDG).
          </p>
          <div className="cookie-list">
            {ENTRIES.map((e) => (
              <dl key={e.name} className="info-box">
                <dt><code>{e.name}</code> · {e.type}</dt>
                <dd>{e.purpose}</dd>
                <dd className="muted small">Speicherdauer: {e.duration}</dd>
              </dl>
            ))}
          </div>
          <p className="muted small">
            Bei der Online-Zahlung wirst du zu Stripe bzw. PayPal weitergeleitet. Dort gelten deren eigene Cookie- und Datenschutzhinweise.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
