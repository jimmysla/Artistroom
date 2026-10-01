import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError, type PlaceSuggestion } from "../../lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const newSession = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Event location with address suggestions in a dropdown while typing (Google Maps, else OpenStreetMap). */
export default function LocationField({ value, onChange }: Props) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [source, setSource] = useState<"google" | "osm">("google");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Only search while the admin is typing – not for the value loaded from the settings.
  const [query, setQuery] = useState<string | null>(null);
  const session = useRef(newSession());

  useEffect(() => {
    if (query == null || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.places(query, session.current);
        if (cancelled) return;
        setSource(res.source);
        setSuggestions(res.suggestions);
        setActive(-1);
        setOpen(true);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Vorschläge konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const pick = (s: PlaceSuggestion) => {
    onChange(s.text);
    setQuery(null);
    setSuggestions([]);
    setOpen(false);
    session.current = newSession();
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="settings-field location-field">
      <label htmlFor={id}>Ort / Adresse</label>
      <div className="location-combobox">
        <input
          id={id}
          className="input"
          required
          maxLength={1000}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          placeholder="Adresse suchen, z. B. Spitalerstraße 3, Hamburg"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          // Delay so a click on a suggestion still registers.
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading && <span className="location-loading" aria-hidden="true" />}
        {showList && (
          <ul id={`${id}-list`} className="location-list" role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.placeId}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
              >
                <span aria-hidden="true">📍</span>
                <span>
                  <strong>{s.main}</strong>
                  {s.secondary && <small>{s.secondary}</small>}
                </span>
              </li>
            ))}
            <li className="location-attribution" aria-hidden="true">{source === "google" ? "Vorschläge von Google Maps" : "Vorschläge: © OpenStreetMap-Mitwirkende"}</li>
          </ul>
        )}
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
