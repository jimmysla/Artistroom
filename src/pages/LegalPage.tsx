import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import Alert from "../components/Alert";
import Footer from "../components/Footer";
import RichText from "../components/RichText";
import { LEGAL_PAGES, type LegalPage as Page } from "../../shared/site";

/** /impressum and /datenschutz – texts are maintained by super users (Dashboard → Gestaltung). */
export default function LegalPage({ page }: { page: Page }) {
  const [data, setData] = useState<{ title: string; text: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = LEGAL_PAGES[page];
    setData(null);
    setError("");
    api.legal(page).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Die Seite konnte nicht geladen werden."));
  }, [page]);

  return (
    <div className="page">
      <main className="container legal-page">
        <Link to="/" className="back-link">
          <span aria-hidden="true">←</span> Zur Startseite
        </Link>
        <h1 className="event-title">{LEGAL_PAGES[page]}</h1>
        {error && <Alert>{error}</Alert>}
        {!data && !error && <p role="status" className="muted">Wird geladen…</p>}
        {data && (data.text ? <RichText text={data.text} /> : <p className="muted">Dieser Text wurde noch nicht hinterlegt.</p>)}
      </main>
      <Footer />
    </div>
  );
}
