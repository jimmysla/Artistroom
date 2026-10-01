import { getStore } from "@netlify/blobs";
import type { MailDesign } from "../../shared/mail-template.js";
import { IMAGE_SLOTS } from "../../shared/mail-template.js";
import { logError } from "./http.js";
import { LOGO_EMAIL_PNG_BASE64 } from "./logo-email.js";

/*
 * Images in e-mails are attached inline (cid:…) instead of being linked: mail clients can't load
 * them from the site (password protection, blocked remote images). Covers the default logo,
 * uploaded images (Netlify Blobs) and external https images (fetched once when sending).
 */
export interface InlineImage {
  filename: string;
  content: Buffer;
  cid: string;
}

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

async function fetchExternal(url: string): Promise<{ data: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !TYPES[type]) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length <= MAX_BYTES ? { data, type } : null;
  } catch (err) {
    logError("External mail image could not be loaded", err);
    return null;
  }
}

/** Loads every image the design uses and returns src mappers + attachments for renderMail/sendMail. */
export async function inlineImages(design: MailDesign) {
  const attachments: InlineImage[] = [];
  const byId = new Map<string, string>();
  const byUrl = new Map<string, string>();

  const usesLogoBlock = design.blocks.some((b) => b.id === "logo" && b.enabled);
  const imageBlocks = IMAGE_SLOTS.filter((s) => design.blocks.some((b) => b.id === s && b.enabled)).map((s) => design.images[s]);
  const ids = new Set([...(usesLogoBlock && design.logoImage ? [design.logoImage] : []), ...imageBlocks.map((i) => i.imageId).filter(Boolean)]);
  const urls = new Set([...(usesLogoBlock && !design.logoImage && design.logoUrl ? [design.logoUrl] : []), ...imageBlocks.filter((i) => !i.imageId && i.url).map((i) => i.url)]);

  for (const id of ids) {
    try {
      const entry = await getStore("mail-images").getWithMetadata(id, { type: "arrayBuffer" });
      if (!entry) continue;
      const type = String((entry.metadata as { type?: string }).type ?? "image/png");
      const cid = `img-${id}`;
      attachments.push({ filename: `bild-${attachments.length + 1}.${TYPES[type] ?? "png"}`, content: Buffer.from(entry.data), cid });
      byId.set(id, `cid:${cid}`);
    } catch (err) {
      logError("Uploaded mail image could not be loaded", err);
    }
  }
  let n = 0;
  for (const url of urls) {
    const img = await fetchExternal(url);
    if (!img) continue; // falls back to linking the URL directly
    const cid = `ext-${++n}`;
    attachments.push({ filename: `bild-extern-${n}.${TYPES[img.type]}`, content: img.data, cid });
    byUrl.set(url, `cid:${cid}`);
  }
  const usesDefaultLogo = usesLogoBlock && !design.logoImage && !design.logoUrl;
  if (usesDefaultLogo) attachments.push({ filename: "logo.png", content: Buffer.from(LOGO_EMAIL_PNG_BASE64, "base64"), cid: "logo" });

  return {
    attachments,
    logoUrl: usesDefaultLogo ? "cid:logo" : undefined,
    imageUrl: (id: string) => byId.get(id) ?? "",
    externalUrl: (url: string) => byUrl.get(url) ?? url,
  };
}
