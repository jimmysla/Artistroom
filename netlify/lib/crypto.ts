import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
  timingSafeEqual,
  constants,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appSecrets } from "../../db/schema.js";

/*
 * Encryption at rest (password hashes, SMTP password): AES-256-GCM, stored as
 * `enc$v1$iv$tag$ciphertext`. The key is PASSWORD_ENCRYPTION_KEY when set; otherwise a
 * random key generated once and kept in `app_secrets`. Decryption tries both keys, so
 * setting the env var later doesn't lock anyone out – values are re-encrypted with it.
 */
export const ENC_PREFIX = "enc$v1$";

const cache = new Map<string, Promise<string>>();

/** Reads a server secret, generating and storing it on first use (race-safe). */
function getSecret(name: string, generate: () => string): Promise<string> {
  let value = cache.get(name);
  if (!value) {
    value = (async () => {
      try {
        // Read first; only the very first request ever generates and stores the secret.
        const [existing] = await db.select().from(appSecrets).where(eq(appSecrets.name, name));
        if (existing) return existing.value;
        await db.insert(appSecrets).values({ name, value: generate() }).onConflictDoNothing();
        const [row] = await db.select().from(appSecrets).where(eq(appSecrets.name, name));
        return row.value;
      } catch (err) {
        // Query errors include the bound parameters (= the generated secret) – never let them reach a log.
        const cause = (err as { cause?: { message?: string } }).cause?.message ?? "query failed";
        throw new Error(`Server secret "${name}" unavailable: ${cause}`);
      }
    })();
    value.catch(() => cache.delete(name));
    cache.set(name, value);
  }
  return value;
}

/** Misconfigured secret (env var too short etc.); surfaced as 503. */
export class AuthConfigError extends Error {}

async function keys(): Promise<{ primary: Buffer; all: Buffer[]; source: "env" | "db" }> {
  const dbKey = Buffer.from(await getSecret("encryption_key", () => randomBytes(32).toString("base64")), "base64");
  const env = process.env.PASSWORD_ENCRYPTION_KEY;
  if (!env) return { primary: dbKey, all: [dbKey], source: "db" };
  if (env.length < 32) throw new AuthConfigError("PASSWORD_ENCRYPTION_KEY muss mindestens 32 Zeichen lang sein.");
  const envKey = createHash("sha256").update(env).digest();
  return { primary: envKey, all: [envKey, dbKey], source: "env" };
}

export const encryptionSource = async () => (await keys()).source;

/**
 * Deterministic keyed fingerprint (HMAC-SHA256) of a value, so encrypted columns can still be
 * looked up by equality (e.g. the duplicate check on e-mail) without storing the clear text.
 */
export async function blindIndex(value: string): Promise<string> {
  const key = await getSecret("blind_index", () => randomBytes(32).toString("base64"));
  return createHmac("sha256", key).update(value.trim().toLowerCase()).digest("base64url");
}

export const isSealed = (v: unknown): v is string => typeof v === "string" && v.startsWith(ENC_PREFIX);

export async function seal(plain: string): Promise<string> {
  const { primary } = await keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primary, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString("base64")}$${cipher.getAuthTag().toString("base64")}$${ct.toString("base64")}`;
}

/**
 * Decrypts a sealed value. Unsealed values are returned as-is with `current: false`.
 * `current` tells whether the value is already sealed with the primary key.
 * Returns null if it can't be decrypted with any known key.
 */
export async function open(stored: string): Promise<{ plain: string; current: boolean } | null> {
  if (!stored.startsWith(ENC_PREFIX)) return { plain: stored, current: false };
  const { all } = await keys();
  const [iv, tag, ct] = stored.slice(ENC_PREFIX.length).split("$");
  for (const [i, key] of all.entries()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      const plain = Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
      return { plain, current: i === 0 };
    } catch {
      /* try next key */
    }
  }
  console.error("Encrypted value could not be decrypted – encryption key changed?");
  return null;
}

/*
 * Transport encryption: the browser encrypts credentials with the server's RSA public key
 * (RSA-OAEP-SHA256 wrapping a random AES-256-GCM key), so passwords never appear in clear
 * text in request bodies (DevTools, proxies, logs). Each payload must contain a fresh,
 * HMAC-signed challenge that expires after CHALLENGE_TTL_MS.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export class TransportError extends Error {
  constructor() {
    super("Die verschlüsselte Übertragung ist ungültig oder abgelaufen. Bitte Seite neu laden und erneut versuchen.");
  }
}

const transportKeys = async () =>
  JSON.parse(
    await getSecret("transport_rsa", () => {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      return JSON.stringify({ publicKey: publicKey.toString("base64"), privateKey });
    }),
  ) as { publicKey: string; privateKey: string };

const challengeKey = () => getSecret("challenge_hmac", () => randomBytes(32).toString("base64"));
const signChallenge = async (body: string) => createHmac("sha256", await challengeKey()).update(body).digest("base64url");

export async function transportInfo() {
  const body = `${Date.now()}.${randomBytes(12).toString("base64url")}`;
  return { publicKey: (await transportKeys()).publicKey, challenge: `${body}.${await signChallenge(body)}` };
}

async function validChallenge(challenge: unknown): Promise<boolean> {
  if (typeof challenge !== "string") return false;
  const i = challenge.lastIndexOf(".");
  if (i < 0) return false;
  const body = challenge.slice(0, i);
  const sig = Buffer.from(challenge.slice(i + 1));
  const expected = Buffer.from(await signChallenge(body));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;
  const age = Date.now() - Number(body.split(".")[0]);
  return age >= -30_000 && age <= CHALLENGE_TTL_MS;
}

// Hybrid encryption has no practical size limit; this only guards against absurd request bodies.
const MAX_SEALED_LENGTH = 4 * 1024 * 1024;

/** Decrypts `{ k, iv, d }` produced by `src/lib/secure.ts` and returns the original JSON body. */
export async function openTransport(sealed: unknown): Promise<Record<string, unknown>> {
  const s = sealed as { k?: unknown; iv?: unknown; d?: unknown } | null;
  if (!s || typeof s.k !== "string" || typeof s.iv !== "string" || typeof s.d !== "string" || s.d.length > MAX_SEALED_LENGTH) throw new TransportError();
  let payload: Record<string, unknown>;
  try {
    const { privateKey } = await transportKeys();
    const aesKey = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(s.k, "base64"));
    const data = Buffer.from(s.d, "base64");
    // Web Crypto appends the 16-byte GCM tag to the ciphertext.
    const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(s.iv, "base64"));
    decipher.setAuthTag(data.subarray(-16));
    payload = JSON.parse(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString("utf8"));
  } catch {
    throw new TransportError();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !(await validChallenge(payload.challenge))) throw new TransportError();
  const { challenge: _challenge, ...body } = payload;
  return body;
}

/** Reads a request whose whole JSON body was encrypted in the browser (`{ sealed }`). */
export async function readSealed(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new TransportError();
  }
  return openTransport((body as { sealed?: unknown } | null)?.sealed);
}
