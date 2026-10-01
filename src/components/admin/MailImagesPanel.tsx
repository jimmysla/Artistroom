import { useEffect, useRef, useState } from "react";
import { api, ApiError, type MailImage } from "../../lib/api";
import { IMAGE_SLOTS, type MailDesign } from "../../../shared/mail-template";

interface Props {
  design: MailDesign;
  onChange: (patch: Partial<MailDesign>) => void;
}

export const MAX_BYTES = 3 * 1024 * 1024;
const imageUrl = (id: string) => `/api/mail-images/${id}`;

export const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Upload PNG/JPG/GIF/WebP images and use them as logo or in the image blocks of the mails. */
export default function MailImagesPanel({ design, onChange }: Props) {
  const [images, setImages] = useState<MailImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.mailImages().then((r) => setImages(r.images)).catch((e) => setError(e instanceof ApiError ? e.message : "Bilder konnten nicht geladen werden."));
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error(`„${file.name}“: nur PNG, JPG, GIF oder WebP.`);
        if (file.size > MAX_BYTES) throw new Error(`„${file.name}“ ist zu groß (max. 3 MB).`);
        const { image } = await api.uploadMailImage(file.name, await toBase64(file));
        setImages((list) => [image, ...(list ?? [])]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Bild wirklich löschen? Vorlagen, die es nutzen, zeigen es dann nicht mehr an.")) return;
    try {
      await api.deleteMailImage(id);
      setImages((list) => list?.filter((i) => i.id !== id) ?? null);
      // Remove references so no broken image is sent.
      onChange({
        logoImage: design.logoImage === id ? "" : design.logoImage,
        images: Object.fromEntries(IMAGE_SLOTS.map((s) => [s, design.images[s].imageId === id ? { ...design.images[s], imageId: "" } : design.images[s]])) as MailDesign["images"],
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Löschen fehlgeschlagen.");
    }
  };

  const options = (
    <>
      {images?.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="mail-images">
      <h3>🖼️ Bilder &amp; Logos</h3>
      <p className="muted small">PNG, JPG, GIF oder WebP bis 3 MB hochladen und als Logo oder in den Bausteinen „Bild 1–3“ verwenden (Bausteine oben einschalten und positionieren).</p>
      <label className={`btn btn-secondary btn-sm upload-btn ${busy ? "is-busy" : ""}`}>
        {busy ? "Wird hochgeladen…" : "⬆️ Bild hochladen"}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {error && <p className="field-error">{error}</p>}
      {images && images.length > 0 && (
        <ul className="image-gallery">
          {images.map((i) => (
            <li key={i.id}>
              <img src={imageUrl(i.id)} alt={i.name} loading="lazy" />
              <span title={i.name}>{i.name}</span>
              <button type="button" onClick={() => remove(i.id)} aria-label={`${i.name} löschen`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="settings-fields">
        <label className="settings-field is-wide">
          Logo im Baustein „Logo“
          <select className="input" value={design.logoImage} onChange={(e) => onChange({ logoImage: e.target.value })}>
            <option value="">{design.logoUrl ? "Logo von Bild-Link (unten)" : "Artistroom-Logo (Standard)"}</option>
            {options}
          </select>
        </label>
        {!design.logoImage && (
          <label className="settings-field is-wide">
            …oder Logo per Bild-Link (https, PNG/JPG/GIF/WebP)
            <input className="input" type="url" placeholder="https://…/logo.png" value={design.logoUrl} onChange={(e) => onChange({ logoUrl: e.target.value })} />
            <span className="field-hint">Das Bild wird beim Versand geladen und direkt in die E-Mail eingebettet. Leer = Artistroom-Logo.</span>
          </label>
        )}
        {IMAGE_SLOTS.map((slot, n) => {
          const img = design.images[slot];
          const set = (patch: Partial<typeof img>) => onChange({ images: { ...design.images, [slot]: { ...img, ...patch } } });
          const enabled = design.blocks.find((b) => b.id === slot)?.enabled;
          return (
            <fieldset key={slot} className="image-slot is-wide">
              <legend>
                Bild {n + 1} {enabled ? "" : <span className="muted small">(Baustein aus)</span>}
              </legend>
              <select className="input" value={img.imageId} onChange={(e) => set({ imageId: e.target.value })} aria-label={`Bild ${n + 1}`}>
                <option value="">{img.url ? "– Bild-Link (unten) –" : "– kein Bild –"}</option>
                {options}
              </select>
              {!img.imageId && (
                <label className="settings-field">
                  …oder Bild-Link (https)
                  <input className="input" type="url" placeholder="https://…/bild.jpg" value={img.url} onChange={(e) => set({ url: e.target.value })} />
                </label>
              )}
              <label className="settings-field">
                Breite: {img.width} px
                <input type="range" min={60} max={560} step={10} value={img.width} onChange={(e) => set({ width: Number(e.target.value) })} />
              </label>
              <label className="settings-field">
                Link beim Klick (optional, https://)
                <input className="input" type="url" placeholder="https://…" value={img.link} onChange={(e) => set({ link: e.target.value })} />
              </label>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
