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
 * Cookie signing key. Prefers SESSION_SECRET; otherwise falls back to the user's password hash,
 * which never leaves the server and automatically invalidates sessions when the password changes.
 */
function signingKey(user: AdminUser): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length < 32) throw new AuthConfigError("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
  return secret || user.passwordHash;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/**
 * Emergency access: if ADMIN_RECOVERY_PASSWORD (≥12 chars) is set, it also unlocks every active
 * super user, and that super user's stored password is reset to it. Remove the env var again after use.
 */
function isRecoveryPassword(user: AdminUser, password: string): boolean {
  const recovery = process.env.ADMIN_RECOVERY_PASSWORD;
  if (!recovery || recovery.length < 12 || !user.isSuper || !user.active) return false;
  const a = createHmac("sha256", "recovery").update(password).digest();
  const b = createHmac("sha256", "recovery").update(recovery).digest();
  return timingSafeEqual(a, b);
}

/** Returns the admin user for valid credentials, otherwise null. */
export async function checkCredentials(username: string, password: string): Promise<AdminUser | null> {
  const user = await findAdmin(username);
  if (!user) {
    await verifyPassword(password, await (dummyHash ??= hashPassword("dummy-password")));
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    if (!isRecoveryPassword(user, password)) return null;
    console.warn("Admin login via ADMIN_RECOVERY_PASSWORD – stored password was reset.");
    await db.update(adminUsers).set({ passwordHash: await hashPassword(password) }).where(eq(adminUsers.id, user.id));
    return (await findAdmin(user.username)) ?? null;
  }
  if (!user.active) return null;
  if (!(await open(user.passwordHash))?.current) {
    await resealHashes();
    // Re-read so the session cookie is signed with the new stored value.
    return (await findAdmin(user.username)) ?? null;
  }
  return user;
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

export const toIdentity = (user: AdminUser): AdminIdentity => ({
  username: user.username,
  isSuper: user.isSuper,
  permissions: user.isSuper ? [] : user.permissions.filter(isPermission),
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
  const allowed = needed.length === 0 || needed.some((p) => (p === "super" ? session.isSuper : can(session, p)));
  return allowed ? session : error("Dafür fehlt dir die Berechtigung.", 403);
}

export const isSecureRequest = (req: Request) => new URL(req.url).protocol === "https:";
