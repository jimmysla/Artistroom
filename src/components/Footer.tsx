import { EventName, useEvent } from "../lib/event";
import { Link } from "react-router-dom";

export default function Footer() {
  const legal = useEvent()?.legalPages;
  return (
    <footer className="site-footer">
      <span className="footer-brand"><EventName /></span>
      {legal?.impressum && <><span aria-hidden="true">·</span><Link to="/impressum">Impressum</Link></>}
      {legal?.datenschutz && <><span aria-hidden="true">·</span><Link to="/datenschutz">Datenschutz</Link></>}
      <span aria-hidden="true">·</span>
      <Link to="/login">Login</Link>
    </footer>
  );
}
