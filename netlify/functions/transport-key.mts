import type { Config } from "@netlify/functions";
import { transportInfo } from "../lib/crypto.js";
import { error, json, logError } from "../lib/http.js";

// Public key + fresh challenge for encrypting request bodies in the browser (src/lib/secure.ts).
export default async (req: Request) => {
  if (req.method !== "GET") return error("Methode nicht erlaubt.", 405);
  try {
    return json(await transportInfo());
  } catch (err) {
    logError("Transport key unavailable", err);
    return error("Verschlüsselung ist gerade nicht verfügbar.", 503);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = { path: "/api/transport-key", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
