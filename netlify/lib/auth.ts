import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminUsers, type AdminUser } from "../../db/schema.js";
import { can, isPermission, type AdminIdentity, type Permission } from "../../shared/admin.js";
import { crossSiteError, error, isCrossSite, logError } from "./http.js";
import { AuthConfigError, open, seal } from "./crypto.js";

const COOKIE_NAME = "ar_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const KEY_LENGTH = 64;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };

export { AuthConfigError };

const scrypt = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

/*
 * Passwords are hashed with scrypt and the hash is then encrypted (see `crypto.ts`), so a
 * leaked database alone doesn't even expose the hashes. Plain or old-key hashes are
 * re-encrypted with the current key on the next successful login.
 */
/** Hashes a password as `scrypt$N$r$p$salt$hash` (base64 parts) and encrypts the result. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, DEFAULT_PARAMS);
  const { N, r, p } = DEFAULT_PARAMS;
  return seal(`scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`);
}

/** Re-encrypts every stored hash that isn't sealed with the current key (no passwords needed). */
async function resealHashes(): Promise<void> {
  for (const u of await db.select().from(adminUsers)) {
    const opened = await open(u.passwordHash);
    if (opened && !opened.current) {
      await db.update(adminUsers).set({ passwordHash: await seal(opened.plain) }).where(eq(adminUsers.id, u.id));
    }
  }
}

export async function verifyPassword(password: string, storedValue: string): Promise<boolean> {
  const stored = (await open(storedValue))?.plain;
  if (!stored) return false;
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), { N: +N, r: +r, p: +p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/*
 * Initial accounts (`AdminArtist`, `SuperUser`) were seeded by migrations whose password hashes
 * are public in the repository. An account still using such a hash must set a new password
 * before it can do anything else, and the seeded passwords can never be chosen again.
 */
const SEEDED_HASHES = [
  "scrypt$16384$8$1$DFnEzzjoOTSMAR9gHwbmbw==$Rp0un3xvBHBJjGh5M4kjXbBXWi91k2eOPEnQV8d+SkU+04ZGIpz0ywiuOkotbhlaRGxSDzfczsAP6F6nLARpmA==",
  "scrypt$16384$8$1$Oz3EpsJRhZvNq3tkk/3RGg==$rx2ww8TA1JNRLjMmFlzRrn8ICMn8tkVBE4RouUkCAqIO9zcbwCQ4CmyQuOtYD9/3lciId/dnDYyAZdtvkmvmTg==",
];

/** True if the account still uses one of the seeded (publicly known) password hashes. */
export async function usesSeededPassword(user: AdminUser): Promise<boolean> {
  const plain = (await open(user.passwordHash))?.plain;
  return Boolean(plain && SEEDED_HASHES.includes(plain));
}

/** True if the password is one of the seeded ones (must not be set again). */
export async function isSeededPassword(password: string): Promise<boolean> {
  for (const hash of SEEDED_HASHES) if (await verifyPassword(password, hash)) return true;
  return false;
}

// Used when no user matches so a failed login takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;

const findAdmin = async (username: string): Promise<AdminUser | undefined> => {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(sql`lower(${adminUsers.username})`, username.trim().toLowerCase()))
    .limit(1);
  return user;
};

/**
 * Cookie signing key, bound to the user's stored password hash so a password change (or
 * deactivation) ends all sessions of that account. With SESSION_SECRET set (recommended) the key
 * is HMAC(SESSION_SECRET, hash): a leaked database alone is then not enough to forge sessions.
 */
function signingKey(user: AdminUser): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length < 32) throw new AuthConfigError("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
  return secret ? createHmac("sha256", secret).update(user.passwordHash).digest("base64url") : user.passwordHash;
}

export const sessionSecretSet = () => Boolean(process.env.SESSION_SECRET);

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/**
 * Checks a login. Returns the user, "inactive" for a deactivated account with the correct
 * password (only then is the deactivation revealed), otherwise null.
 */
export async function verifyLogin(username: string, password: string): Promise<AdminUser | "inactive" | null> {
  const user = await findAdmin(username);
  if (!user) {
    await verifyPassword(password, await (dummyHash ??= hashPassword("dummy-password")));
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  if (!user.active) return "inactive";
  if (!(await open(user.passwordHash))?.current) {
    await resealHashes();
    // Re-read so the session cookie is signed with the new stored value.
    return (await findAdmin(user.username)) ?? null;
  }
  return user;
}

/** Returns the active admin user for valid credentials, otherwise null. */
export async function checkCredentials(username: string, password: string): Promise<AdminUser | null> {
  const result = await verifyLogin(username, password);
  return result === "inactive" ? null : result;
}

export function createSessionCookie(user: AdminUser, secure: boolean): string {
  const payload = b64url(JSON.stringify({ sub: user.username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }));
  const token = `${payload}.${sign(payload, signingKey(user))}`;
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [`${COOKIE_NAME}=`, "Path=/api/admin", "HttpOnly", "SameSite=Strict", "Max-Age=0", secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
}

export const toIdentity = async (user: AdminUser): Promise<AdminIdentity> => ({
  username: user.username,
  isSuper: user.isSuper,
  permissions: user.isSuper ? [] : user.permissions.filter(isPermission),
  mustChangePassword: await usesSeededPassword(user),
});

/** Returns the admin identity (with current permissions from the DB) for a valid session, otherwise null. */
export async function getSession(req: Request): Promise<AdminIdentity | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  let data: { sub?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof data.sub !== "string" || typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;

  const user = await findAdmin(data.sub);
  if (!user || !user.active) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload, signingKey(user)));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return toIdentity(user);
}

/**
 * Resolves the session and checks that it has at least one of the given permissions
 * (`"super"` = super user only). Returns the identity or a ready-made error response.
 */
export async function requireAdmin(req: Request, ...needed: (Permission | "super")[]): Promise<AdminIdentity | Response> {
  if (isCrossSite(req)) return crossSiteError();
  let session: AdminIdentity | null;
  try {
    session = await getSession(req);
  } catch (err) {
    if (err instanceof AuthConfigError) return error(err.message, 503);
    logError("Admin session check failed", err);
    return error("Interner Serverfehler.", 500);
  }
  if (!session) return error("Nicht autorisiert.", 401);
  if (session.mustChangePassword) return error("Bitte lege zuerst ein neues Passwort fest.", 403, { mustChangePassword: true });
  const allowed = needed.length === 0 || needed.some((p) => (p === "super" ? session.isSuper : can(session, p)));
  return allowed ? session : error("Dafür fehlt dir die Berechtigung.", 403);
}

export const isSecureRequest = (req: Request) => new URL(req.url).protocol === "https:";
