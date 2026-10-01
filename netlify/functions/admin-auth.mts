import type { Config } from "@netlify/functions";
import {
  AuthConfigError,
  checkCredentials,
  clearSessionCookie,
  createSessionCookie,
  getSession,
  isSecureRequest,
  toIdentity,
} from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { clearFailures, lockedUntil, recordFailure } from "../lib/login-guard.js";
import { TransportError, readSealed } from "../lib/crypto.js";
import { error, json, str, logError, crossSiteError, isCrossSite } from "../lib/http.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async (req: Request) => {
  if (isCrossSite(req)) return crossSiteError();
  const action = new URL(req.url).pathname.split("/").pop();
  const secure = isSecureRequest(req);

  try {
    if (action === "session" && req.method === "GET") {
      const session = await getSession(req);
      return session ? json({ authenticated: true, user: session }) : json({ authenticated: false }, 401);
    }

    if (action === "logout" && req.method === "POST") {
      const session = await getSession(req).catch(() => null);
      if (session) await logAction({ username: session.username, action: "logout" });
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(secure) });
    }

    if (action === "login" && req.method === "POST") {
      const credentials = await readSealed(req);
      const username = str(credentials.username);
      const password = str(credentials.password);
      if (!username.trim() || !password) {
        return error("Bitte Benutzername und Passwort eingeben.", 400);
      }
      const name = username.trim().toLowerCase();
      // Locked accounts get the same answer as wrong credentials (no hint which accounts exist).
      if (await lockedUntil(name)) {
        await logAction({ username: null, action: "login_gesperrt", target: username.trim().slice(0, 60), details: "Zu viele Fehlversuche – Konto vorübergehend gesperrt" });
        await delay(800);
        return error("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.", 429);
      }
      const user = await checkCredentials(username, password);
      if (!user) {
        // Slow down brute-force attempts.
        const locked = await recordFailure(name);
        await logAction({ username: null, action: "login_fehlgeschlagen", target: username.trim().slice(0, 60), details: locked ? "5 Fehlversuche – Login für 15 Minuten gesperrt" : null });
        await delay(800);
        return error(locked ? "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." : "Benutzername oder Passwort ist falsch.", locked ? 429 : 401);
      }
      await clearFailures(name);
      await logAction({ username: user.username, action: "login" });
      return json({ ok: true, user: toIdentity(user) }, 200, {
        "Set-Cookie": createSessionCookie(user, secure),
      });
    }

    return error("Nicht gefunden.", 404);
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    if (err instanceof AuthConfigError) return error(err.message, 503);
    logError("Admin auth error", err);
    return error("Interner Serverfehler.", 500);
  }
};

// Per-IP rate limit against brute force / scraping.
export const config: Config = {
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
  path: ["/api/admin/login", "/api/admin/logout", "/api/admin/session"],
};
