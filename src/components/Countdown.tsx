import { useEffect, useState } from "react";
import { useEvent } from "../lib/event";

/** Converts a Berlin wall-clock time (YYYY-MM-DD + HH:MM) to a UTC timestamp. */
function berlinTime(date: string, time: string): number {
  const [h, m] = /^\d{1,2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [0, 0];
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  // Offset of Europe/Berlin at that instant (+1h or +2h).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const asBerlin = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (asBerlin - guess);
}

function Digit({ char, index }: { char: string; index: number }) {
  // Keyed by value so each change re-mounts and replays the spray animation.
  return (
    <span className="graffiti-digit" data-index={index}>
      <span key={char} className="graffiti-char" data-char={char}>{char}</span>
    </span>
  );
}

function Unit({ value, label, digits = 2, offset }: { value: number; label: string; digits?: number; offset: number }) {
  const text = String(value).padStart(digits, "0");
  return (
    <div className="countdown-unit">
      <div className="countdown-digits">
        {[...text].map((c, i) => <Digit key={i} char={c} index={offset + i} />)}
      </div>
      <span className="countdown-label">{label}</span>
    </div>
  );
}

export default function Countdown() {
  const event = useEvent();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!event || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return <div className="countdown countdown-placeholder" aria-hidden="true" />;

  const target = berlinTime(event.date, event.time);
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  const isToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now) === event.date;

  if (diff === 0) {
    return (
      <div className="countdown countdown-done" role="status">
        <p>{isToday ? "Heute ist es soweit!" : "Das Event hat bereits stattgefunden."}</p>
      </div>
    );
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return (
    <div className="countdown" role="timer" aria-label={`Noch ${days} Tage, ${hours} Stunden und ${minutes} Minuten bis zum Event`}>
      <div className="countdown-units" aria-hidden="true">
        <Unit value={days} label="Tage" digits={days > 99 ? 3 : 2} offset={0} />
        <span className="countdown-sep" />
        <Unit value={hours} label="Std" offset={3} />
        <span className="countdown-sep" />
        <Unit value={minutes} label="Min" offset={5} />
        <span className="countdown-sep" />
        <Unit value={seconds} label="Sek" offset={7} />
      </div>
    </div>
  );
}
