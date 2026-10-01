import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminUsers } from "../../db/schema.js";
import { validatePassword, validatePasswordConfirm } from "../../shared/admin.js";
import {
  AuthConfigError,
  checkCredentials,
  clearSessionCookie,
  createSessionCookie,
  getSession,
  hashPassword,
  isSecureRequest,
  isSeededPassword,
  toIdentity,
  verifyLogin,
  verifyPassword,
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
      const user = await verifyLogin(username, password);
      if (user === "inactive") {
        await clearFailures(name);
        await logAction({ username: null, action: "login_deaktiviert", target: username.trim().slice(0, 60), details: "Richtiges Passwort, aber Konto ist deaktiviert" });
        return error("Dieses Konto ist deaktiviert. Bitte wende dich an einen Super User.", 403);
      }
      if (!user) {
        // Slow down brute-force attempts.
        const locked = await recordFailure(name);
        await logAction({ username: null, action: "login_fehlgeschlagen", target: username.trim().slice(0, 60), details: locked ? "5 Fehlversuche – Login für 15 Minuten gesperrt" : null });
        await delay(800);
        return error(locked ? "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." : "Benutzername oder Passwort ist falsch.", locked ? 429 : 401);
      }
      await clearFailures(name);
      await logAction({ username: user.username, action: "login" });
      return json({ ok: true, user: await toIdentity(user) }, 200, {
        "Set-Cookie": createSessionCookie(user, secure),
      });
    }

    // Own password change (required for accounts that still use a seeded password).
    if (action === "password" && req.method === "POST") {
      const session = await getSession(req);
      if (!session) return error("Nicht autorisiert.", 401);
      const body = await readSealed(req);
      const name = session.username.toLowerCase();
      if (await lockedUntil(name)) return error("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.", 429);
      const user = await checkCredentials(session.username, str(body.currentPassword));
      if (!user) {
        await recordFailure(name);
        await delay(800);
        return error("Das aktuelle Passwort ist falsch.", 403, { fieldErrors: { currentPassword: "Falsches Passwort." } });
      }
      const password = str(body.password);
      const p = validatePassword(password);
      if (p) return error(p, 422, { fieldErrors: { password: p } });
      const c = validatePasswordConfirm(password, str(body.passwordConfirm));
      if (c) return error(c, 422, { fieldErrors: { passwordConfirm: c } });
      if ((await verifyPassword(password, user.passwordHash)) || (await isSeededPassword(password))) {
        const msg = "Bitte ein neues Passwort wählen, das noch nie verwendet wurde.";
        return error(msg, 422, { fieldErrors: { password: msg } });
      }
      const [updated] = await db.update(adminUsers).set({ passwordHash: await hashPassword(password) }).where(eq(adminUsers.id, user.id)).returning();
      await logAction({ username: user.username, action: "passwort_geaendert", target: user.username });
      // The session key depends on the password hash → issue a fresh cookie.
      return json({ ok: true, user: await toIdentity(updated) }, 200, { "Set-Cookie": createSessionCookie(updated, secure) });
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
  path: ["/api/admin/login", "/api/admin/logout", "/api/admin/session", "/api/admin/password"],
};
