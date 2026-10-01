import { EventName } from "../lib/event";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <span className="footer-brand"><EventName /></span>
      <span aria-hidden="true">·</span>
      <Link to="/login">Login</Link>
    </footer>
  );
}
