/** Headers on every API response: never cached, never sniffed, framed or indexed. */
export const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { ...SECURITY_HEADERS, ...headers },
  });

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF guard: state-changing requests must come from our own site. Browsers always send
 * `Origin` (or at least `Sec-Fetch-Site`) on cross-site POSTs, so a foreign page can't trigger
 * actions with the visitor's session. Requests without either header (server-to-server,
 * scheduled functions) are not from a browser and carry no session cookie.
 */
export function isCrossSite(req: Request): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

export const crossSiteError = () => error("Anfrage von fremder Seite abgelehnt.", 403);

export const error = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ error: message, ...extra }, status);

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Logs an error without its details payload: database errors carry the bound query
 * parameters (personal data, encrypted secrets, undo snapshots), which must not end up in logs.
 */
export function logError(label: string, err: unknown) {
  const e = err as { name?: string; message?: string; cause?: { message?: string; code?: string } } | null;
  const message = e?.cause?.message ?? e?.message?.replace(/\nparams:[\s\S]*$/, "") ?? String(err);
  console.error(`${label}: ${e?.name ?? "Error"}: ${message.slice(0, 500)}${e?.cause?.code ? ` (${e.cause.code})` : ""}`);
}
