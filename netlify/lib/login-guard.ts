import { getStore } from "@netlify/blobs";
import { blindIndex } from "./crypto.js";
import { logError } from "./http.js";

/*
 * Per-account lockout against distributed password guessing (the per-IP rate limit alone can be
 * bypassed with many IPs): after MAX_FAILURES failed logins within WINDOW_MS the account is
 * locked for LOCK_MS. Keys are HMAC fingerprints, so the store never contains usernames.
 * Fails open (logged) if Blobs is unavailable, so an outage never locks everyone out.
 *
 * The store is shared by the whole site, but deploy previews run on a copy of the production
 * database (same keys) – so every key carries a scope: failed logins on a preview must never lock
 * the account on the live site (and vice versa). See `loginScope`.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

interface Attempts {
  failures: number[];
  lockedUntil: number;
}

const store = () => getStore("login-attempts");
const key = (scope: string, username: string) => blindIndex(`login:${scope}:${username}`);

/** "production" on the live site, otherwise one scope per preview deploy. */
export const loginScope = (deploy: { context?: string; id?: string } | undefined) =>
  !deploy?.context || deploy.context === "production" ? "production" : `${deploy.context}:${deploy.id ?? ""}`;

export async function lockedUntil(scope: string, username: string): Promise<number | null> {
  try {
    const a = (await store().get(await key(scope, username), { type: "json" })) as Attempts | null;
    return a && a.lockedUntil > Date.now() ? a.lockedUntil : null;
  } catch (err) {
    logError("Login guard unavailable", err);
    return null;
  }
}

/** Records a failed login; returns true if the account is now locked. */
export async function recordFailure(scope: string, username: string): Promise<boolean> {
  try {
    const k = await key(scope, username);
    const now = Date.now();
    const a = ((await store().get(k, { type: "json" })) as Attempts | null) ?? { failures: [], lockedUntil: 0 };
    const failures = [...a.failures.filter((t) => now - t < WINDOW_MS), now];
    const locked = failures.length >= MAX_FAILURES;
    await store().setJSON(k, { failures: locked ? [] : failures, lockedUntil: locked ? now + LOCK_MS : a.lockedUntil });
    return locked;
  } catch (err) {
    logError("Login guard unavailable", err);
    return false;
  }
}

export async function clearFailures(scope: string, username: string): Promise<void> {
  try {
    await store().delete(await key(scope, username));
  } catch (err) {
    logError("Login guard unavailable", err);
  }
}
