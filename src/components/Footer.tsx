import { useState } from "react";
import { EventName, useEvent } from "../lib/event";
import { Link } from "react-router-dom";
import Modal from "./Modal";

type Legal = "imprint" | "privacy";
const LEGAL_TITLES: Record<Legal, string> = { imprint: "Impressum", privacy: "Datenschutzerklärung" };

export default function Footer() {
  const event = useEvent();
  const [open, setOpen] = useState<Legal | null>(null);
  // Toggled in Einstellungen → Veranstaltung → Impressum & Datenschutz; empty texts aren't linked.
  const texts: Record<Legal, string> = { imprint: event?.imprintText?.trim() ?? "", privacy: event?.privacyText?.trim() ?? "" };
  const legal = event?.showLegal === "an" ? (Object.keys(texts) as Legal[]).filter((k) => texts[k]) : [];
  return (
    <footer className="site-footer">
      <span className="footer-brand"><EventName /></span>
      <span aria-hidden="true">·</span>
      <Link to="/login">Login</Link>
      {legal.map((k) => (
        <span key={k} className="footer-item">
          <span aria-hidden="true">·</span>
          <button type="button" className="footer-link" onClick={() => setOpen(k)}>{k === "imprint" ? "Impressum" : "Datenschutz"}</button>
        </span>
      ))}
      {open && (
        <Modal title={LEGAL_TITLES[open]} onClose={() => setOpen(null)}>
          <div className="legal-text">
            {texts[open].split(/\n+/).map((line, i) => <p key={i}>{line}</p>)}
          </div>
        </Modal>
      )}
    </footer>
  );
}
