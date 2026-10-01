/*
 * Encrypts request bodies (passwords, login and form data) in the browser before they are
 * sent, so they never appear in clear text in requests (DevTools, proxies, logs) – on top of
 * HTTPS. Hybrid scheme: random AES-256-GCM key (any data length), wrapped with the server's
 * RSA-OAEP key. Counterpart: `openTransport` / `readSealed` in netlify/lib/crypto.ts.
 */
export interface SealedPayload {
  k: string;
  iv: string;
  d: string;
}

export class SecureContextError extends Error {}

// Chunked so large payloads don't overflow the argument limit of String.fromCharCode.
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(body: Record<string, unknown>): Promise<SealedPayload> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new SecureContextError("Verschlüsselte Übertragung nur über HTTPS möglich. Bitte die Seite per https:// öffnen.");
  let res: Response;
  try {
    res = await fetch("/api/transport-key", { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new SecureContextError("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new SecureContextError(data.error ?? `Verschlüsselung konnte nicht vorbereitet werden (Fehler ${res.status}). Bitte Seite neu laden.`);
  }
  const { publicKey, challenge } = (await res.json()) as { publicKey: string; challenge: string };

  const rsa = await subtle.importKey("spki", unb64(publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify({ ...body, challenge })));
  const wrapped = await subtle.encrypt({ name: "RSA-OAEP" }, rsa, await subtle.exportKey("raw", aes));
  return { k: b64(wrapped), iv: b64(iv), d: b64(data) };
}
