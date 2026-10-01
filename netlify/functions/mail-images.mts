import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../lib/auth.js";
import { logAction } from "../lib/audit.js";
import { TransportError, readSealed } from "../lib/crypto.js";
import { error, json, logError, str } from "../lib/http.js";

/*
 * Images for the e-mail templates (logos, banners). Stored in Netlify Blobs.
 *   GET    /api/admin/mail-images        list (settings permission)
 *   POST   /api/admin/mail-images        upload { name, data: base64 } (encrypted body)
 *   DELETE /api/admin/mail-images/:id
 *   GET    /api/mail-images/:id          public – e-mail clients load the images from here
 * Only PNG, JPEG, GIF and WebP (checked by magic bytes, never SVG → no script in images).
 */
const MAX_BYTES = 3 * 1024 * 1024;
const ID = /^[0-9a-f-]{36}$/;
const store = () => getStore("mail-images");

interface ImageMeta {
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

function sniffType(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const id = context.params?.id;

  // Public delivery for e-mail clients.
  if (!url.pathname.startsWith("/api/admin/")) {
    if (req.method !== "GET" || !id || !ID.test(id)) return error("Nicht gefunden.", 404);
    const entry = await store().getWithMetadata(id, { type: "arrayBuffer" });
    if (!entry) return error("Bild nicht gefunden.", 404);
    const meta = entry.metadata as unknown as ImageMeta;
    return new Response(entry.data, {
      headers: { "Content-Type": meta.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Robots-Tag": "noindex" },
    });
  }

  const session = await requireAdmin(req, "einstellungen");
  if (session instanceof Response) return session;
  try {
    if (req.method === "GET" && !id) {
      const { blobs } = await store().list();
      const images = await Promise.all(
        blobs.map(async (b) => {
          const m = await store().getMetadata(b.key);
          return { id: b.key, ...(m?.metadata as unknown as ImageMeta) };
        }),
      );
      return json({ images: images.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")) });
    }
    if (req.method === "POST" && !id) {
      const body = await readSealed(req);
      const data = Buffer.from(str(body.data), "base64");
      if (!data.length) return error("Bitte ein Bild auswählen.", 422);
      if (data.length > MAX_BYTES) return error("Das Bild ist zu groß (max. 3 MB).", 422);
      const type = sniffType(data);
      if (!type) return error("Nur PNG, JPG, GIF oder WebP werden unterstützt.", 422);
      const imageId = randomUUID();
      const meta: ImageMeta = { name: str(body.name).replace(/[^\w .()-]/g, "").slice(0, 80) || "Bild", type, size: data.length, createdAt: new Date().toISOString() };
      await store().set(imageId, new Blob([data]), { metadata: meta as unknown as Record<string, unknown> });
      await logAction({ username: session.username, action: "bild_hochgeladen", target: meta.name, details: `${type} · ${Math.round(data.length / 1024)} KB` });
      return json({ image: { id: imageId, ...meta } }, 201);
    }
    if (req.method === "DELETE" && id && ID.test(id)) {
      await store().delete(id);
      await logAction({ username: session.username, action: "bild_geloescht", target: id });
      return json({ ok: true });
    }
    return error("Methode nicht erlaubt.", 405);
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    logError("Mail image operation failed", err);
    return error("Bilder sind gerade nicht verfügbar.", 500);
  }
};

export const config: Config = { path: ["/api/admin/mail-images", "/api/admin/mail-images/:id", "/api/mail-images/:id"] };
