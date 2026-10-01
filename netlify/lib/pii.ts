import { and, eq, not, like, or, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations, type Registration } from "../../db/schema.js";
import { ENC_PREFIX, blindIndex, isSealed, open, seal } from "./crypto.js";

/*
 * Encryption at rest for personal data. Every field below is stored as `enc$v1$…` (AES-256-GCM,
 * any length) and decrypted only on the server right before use. Rows written before this was
 * introduced are plain text; `open` passes them through and `encryptLegacyRegistrations`
 * converts them. Always run rows through `openRegistration` before returning, mailing or logging.
 */
export const PII_FIELDS = ["name", "firstName", "lastName", "email", "instagram", "tiktok", "referredBy", "city", "extraFields"] as const;
type PiiField = (typeof PII_FIELDS)[number];

/** Encrypts the personal fields of an insert/update object and adds the e-mail fingerprint. */
export async function sealRegistration<T extends Partial<Pick<Registration, PiiField>>>(values: T): Promise<T & { emailHash?: string }> {
  const out: Record<string, unknown> = { ...values };
  for (const f of PII_FIELDS) {
    const v = values[f];
    if (typeof v === "string" && v && !isSealed(v)) out[f] = await seal(v);
  }
  if (typeof values.email === "string" && !isSealed(values.email)) out.emailHash = await blindIndex(values.email);
  return out as T & { emailHash?: string };
}

/** Decrypts the personal fields of a stored row (plain legacy values pass through). */
export async function openRegistration<T extends Partial<Registration>>(row: T): Promise<T> {
  const out: Record<string, unknown> = { ...row };
  for (const f of PII_FIELDS) {
    const v = row[f];
    if (isSealed(v)) out[f] = (await open(v))?.plain ?? "[nicht entschlüsselbar]";
  }
  return out as T;
}

export const openRegistrations = <T extends Partial<Registration>>(rows: T[]) => Promise.all(rows.map(openRegistration));

/** Encrypts rows that are still stored in plain text (idempotent, cheap when nothing is left). */
export async function encryptLegacyRegistrations(): Promise<number> {
  const plain = await db
    .select()
    .from(registrations)
    .where(or(not(like(registrations.email, `${ENC_PREFIX}%`)), isNull(registrations.emailHash)));
  for (const row of plain) {
    const opened = await openRegistration(row);
    const values = await sealRegistration(Object.fromEntries(PII_FIELDS.map((f) => [f, opened[f]])) as Pick<Registration, PiiField>);
    await db.update(registrations).set({ ...values, emailHash: await blindIndex(opened.email) }).where(and(eq(registrations.id, row.id), eq(registrations.revision, row.revision)));
  }
  return plain.length;
}
