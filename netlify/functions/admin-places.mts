import type { Config } from "@netlify/functions";
import { requireAdmin } from "../lib/auth.js";
import { error, json, logError } from "../lib/http.js";

/*
 * Address suggestions for the event location (settings). Proxies Google Places API (New)
 * Autocomplete so the API key stays on the server (GOOGLE_MAPS_API_KEY with "Places API (New)").
 * Without a key it falls back to Photon (OpenStreetMap, built for search-as-you-type, no key).
 */
interface Prediction {
  placePrediction?: {
    placeId: string;
    text?: { text: string };
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
  };
}

interface PhotonFeature {
  properties: { osm_id?: number; name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; district?: string; state?: string; country?: string };
}

async function osmSuggestions(input: string) {
  try {
    const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: input, lang: "de", limit: "6" })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Artistroom-Event-Settings/1.0" } });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const suggestions = (data.features ?? [])
      .map(({ properties: p }, i) => {
        const street = [p.street, p.housenumber].filter(Boolean).join(" ");
        // Venue name (if it isn't just the street) first, then street, then postcode + city.
        const main = p.name && p.name !== p.street ? p.name : street || p.city || "";
        const place = [p.postcode, p.city ?? p.district].filter(Boolean).join(" ");
        const rest = [main === street ? "" : street, place, p.country && p.country !== "Deutschland" ? p.country : ""].filter(Boolean);
        return { placeId: String(p.osm_id ?? i), text: [main, ...rest].filter(Boolean).join(", "), main, secondary: rest.join(", ") };
      })
      .filter((s) => s.main && !seen.has(s.text) && seen.add(s.text));
    return json({ source: "osm", suggestions });
  } catch (err) {
    logError("Photon autocomplete error", err);
    return error("Adressvorschläge sind gerade nicht erreichbar.", 502);
  }
}

export default async (req: Request) => {
  const session = await requireAdmin(req, "einstellungen");
  if (session instanceof Response) return session;
  if (req.method !== "GET") return error("Methode nicht erlaubt.", 405);

  const key = Netlify.env.get("GOOGLE_MAPS_API_KEY");
  const params = new URL(req.url).searchParams;
  const input = params.get("q")?.trim().slice(0, 200) ?? "";
  // Session token groups the keystrokes of one search for Google's billing.
  const sessionToken = params.get("session")?.slice(0, 64);
  if (input.length < 3) return json({ source: key ? "google" : "osm", suggestions: [] });
  if (!key) return osmSuggestions(input);

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({ input, languageCode: "de", includedRegionCodes: ["de", "at", "ch"], ...(sessionToken ? { sessionToken } : {}) }),
    });
    if (!res.ok) {
      console.error("Places autocomplete failed", res.status);
      return error("Google Maps hat die Anfrage abgelehnt. Bitte API-Schlüssel und „Places API (New)“ prüfen.", 502);
    }
    const data = (await res.json()) as { suggestions?: Prediction[] };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<Prediction["placePrediction"]> => Boolean(p?.text?.text))
      .map((p) => ({
        placeId: p.placeId,
        text: p.text!.text,
        main: p.structuredFormat?.mainText?.text ?? p.text!.text,
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }));
    return json({ source: "google", suggestions });
  } catch (err) {
    logError("Places autocomplete error", err);
    return error("Google Maps ist gerade nicht erreichbar.", 502);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = { path: "/api/admin/places", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
