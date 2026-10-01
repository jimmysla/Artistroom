import { EventMeta } from "../lib/event";
import Countdown from "./Countdown";

interface Props {
  onScrollDown: () => void;
}

export default function Hero({ onScrollDown }: Props) {
  return (
    <header className="hero">
      <h1 className="hero-logo">
        <img
          src="/logo-hero-640.webp"
          srcSet="/logo-hero-640.webp 640w, /logo-hero-1200.webp 1200w"
          sizes="(max-width: 600px) 78vw, 440px"
          width="440"
          height="440"
          alt="Artistroom"
          fetchPriority="high"
        />
      </h1>
      <Countdown />
      <p className="hero-meta">
        <EventMeta />
      </p>
      <button type="button" className="scroll-hint" onClick={onScrollDown} aria-label="Nach unten zur Anmeldung scrollen">
        <span>Scrollen</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </header>
  );
}
