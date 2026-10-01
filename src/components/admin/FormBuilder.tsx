import type { ReactNode } from "react";
import Button from "../Button";
import Fold from "../Fold";
import { CATEGORIES } from "../../../shared/registration";
import {
  FIELD_DEFAULTS,
  REQUIRED_FIELDS,
  newBlockId,
  type BoxBlock,
  type CategoryBlock,
  type CustomBlock,
  type FieldBlock,
  type FormConfig,
} from "../../../shared/site";

type Step = keyof FormConfig;
type AnyBlock = FormConfig[Step]["blocks"][number];

const BUILTIN_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.id));
const newBox = (): BoxBlock => ({ type: "box", id: newBlockId("b"), icon: "💡", title: "Hinweis", text: "", color: "" });
const newCategory = (): CategoryBlock => ({ type: "category", id: newBlockId("c"), label: "Neue Kategorie", description: "", icon: "⭐", color: "", enabled: true });
const newCustom = (): CustomBlock => ({ type: "custom", id: newBlockId("f"), label: "Eigene Frage", placeholder: "", hint: "", icon: "", color: "", required: false, multiline: false, enabled: true });

/** Form builder ("Baukasten") for the registration steps „Kategorie“ and „Deine Daten“. */
export default function FormBuilder({ value, onChange }: { value: FormConfig; onChange: (v: FormConfig) => void }) {
  const setStep = <S extends Step>(step: S, patch: Partial<FormConfig[S]>) => onChange({ ...value, [step]: { ...value[step], ...patch } });
  const setBlocks = (step: Step, blocks: AnyBlock[]) => setStep(step, { blocks } as Partial<FormConfig[Step]>);
  const update = (step: Step, id: string, patch: Partial<AnyBlock>) =>
    setBlocks(step, value[step].blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as AnyBlock) : b)));
  const move = (step: Step, i: number, dir: -1 | 1) => {
    const blocks = [...value[step].blocks];
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setBlocks(step, blocks);
  };
  const remove = (step: Step, id: string) => setBlocks(step, value[step].blocks.filter((b) => b.id !== id));
  const add = (step: Step, block: AnyBlock) => setBlocks(step, [...value[step].blocks, block]);

  const stepHeader = (step: Step) => (
    <div className="settings-fields">
      <label className="settings-field">
        Überschrift
        <input className="input" maxLength={120} value={value[step].title} onChange={(e) => setStep(step, { title: e.target.value })} />
      </label>
      <label className="settings-field">
        Untertitel
        <input className="input" maxLength={300} value={value[step].subtitle} onChange={(e) => setStep(step, { subtitle: e.target.value })} />
      </label>
    </div>
  );

  const list = (step: Step) => (
    <ol className="builder-list">
      {value[step].blocks.map((b, i) => (
        <li key={b.id} className={`builder-block is-${b.type} ${"enabled" in b && !b.enabled ? "is-hidden" : ""}`} style={b.color ? { borderLeftColor: b.color } : undefined}>
          <div className="builder-head">
            <span className="builder-kind">{KIND[b.type]}</span>
            <strong>{b.icon} {b.type === "box" ? b.title || "Infobox" : b.label}</strong>
            <span className="block-move">
              <button type="button" aria-label="Nach oben" disabled={i === 0} onClick={() => move(step, i, -1)}>↑</button>
              <button type="button" aria-label="Nach unten" disabled={i === value[step].blocks.length - 1} onClick={() => move(step, i, 1)}>↓</button>
            </span>
          </div>
          <BlockEditor block={b} onChange={(patch) => update(step, b.id, patch)} onRemove={removable(b) ? () => remove(step, b.id) : undefined} />
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <Fold title="Schritt 1 · Kategorie">
        <p className="muted small">Kategorien als Kacheln mit Emoji, Beschreibung und Farbcode. Mit Infoboxen ergänzt du Hinweise zwischen den Kacheln. Standard-Kategorien lassen sich ausblenden, eigene auch löschen.</p>
        {stepHeader("category")}
        {list("category")}
        <div className="builder-add">
          <Button type="button" variant="secondary" size="sm" onClick={() => add("category", newCategory())}>+ Kategorie</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => add("category", newBox())}>+ Infobox</Button>
        </div>
      </Fold>
      <Fold title="Schritt 2 · Deine Daten">
        <p className="muted small">Reihenfolge, Beschriftung, Platzhalter, Hinweis, Emoji und Farbe jedes Feldes. Pflichtfelder (Vorname, Nachname, Künstlername, E-Mail, Stadt) bleiben immer sichtbar; Instagram, TikTok und Empfehlung können ausgeblendet werden. Eigene Fragen werden verschlüsselt gespeichert und im Dashboard sowie im CSV-Export angezeigt.</p>
        {stepHeader("details")}
        {list("details")}
        <div className="builder-add">
          <Button type="button" variant="secondary" size="sm" onClick={() => add("details", newCustom())}>+ Eigene Frage</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => add("details", newBox())}>+ Infobox</Button>
        </div>
      </Fold>
    </>
  );
}

const KIND: Record<AnyBlock["type"], string> = { category: "Kategorie", box: "Infobox", field: "Feld", custom: "Eigene Frage" };
const removable = (b: AnyBlock) => b.type === "box" || b.type === "custom" || (b.type === "category" && !BUILTIN_CATEGORIES.has(b.id));

function BlockEditor({ block: b, onChange, onRemove }: { block: AnyBlock; onChange: (patch: Partial<AnyBlock>) => void; onRemove?: () => void }) {
  const input = (key: string, label: string, max: number, extra: { placeholder?: string; wide?: boolean } = {}) => (
    <label className={`settings-field ${extra.wide ? "is-wide" : ""}`}>
      {label}
      <input className="input" maxLength={max} placeholder={extra.placeholder} value={String((b as unknown as Record<string, unknown>)[key] ?? "")} onChange={(e) => onChange({ [key]: e.target.value } as Partial<AnyBlock>)} />
    </label>
  );
  const toggles: ReactNode[] = [];
  if ("enabled" in b && !(b.type === "field" && REQUIRED_FIELDS.includes(b.id))) {
    toggles.push(<label key="enabled" className="checkbox-inline"><input type="checkbox" checked={b.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> Sichtbar</label>);
  }
  if (b.type === "custom") {
    toggles.push(<label key="req" className="checkbox-inline"><input type="checkbox" checked={b.required} onChange={(e) => onChange({ required: e.target.checked })} /> Pflichtfeld</label>);
    toggles.push(<label key="multi" className="checkbox-inline"><input type="checkbox" checked={b.multiline} onChange={(e) => onChange({ multiline: e.target.checked })} /> Mehrzeilig</label>);
  }
  return (
    <div className="builder-body">
      <div className="settings-fields builder-fields">
        {input("icon", "Emoji", 16, { placeholder: "z. B. 🎤" })}
        <ColorField value={b.color} onChange={(color) => onChange({ color })} />
        {b.type === "box" ? (
          <>
            {input("title", "Titel", 120, { wide: true })}
            <label className="settings-field is-wide">
              Text
              <textarea className="input" rows={3} maxLength={2000} value={b.text} onChange={(e) => onChange({ text: e.target.value })} />
            </label>
          </>
        ) : b.type === "category" ? (
          <>
            {input("label", "Name", 80)}
            {input("description", "Beschreibung", 200)}
          </>
        ) : (
          <>
            {input("label", "Beschriftung", 120, { wide: true, placeholder: b.type === "field" ? FIELD_DEFAULTS[(b as FieldBlock).id].label : undefined })}
            {input("placeholder", "Platzhalter", 120)}
            {input("hint", "Hinweis unter dem Feld", 300)}
          </>
        )}
      </div>
      {(toggles.length > 0 || onRemove) && (
        <div className="builder-toggles">
          {toggles}
          {onRemove && <button type="button" className="link-danger" onClick={onRemove}>Entfernen</button>}
        </div>
      )}
    </div>
  );
}

/** Colour picker with "no colour" (= theme default). */
export function ColorField({ label = "Farbcode", value, onChange, allowEmpty = true }: { label?: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <label className="settings-field">
      {label}
      <span className="color-field">
        <input type="color" value={value || "#8b5cf6"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} wählen`} />
        <input className="input" maxLength={7} placeholder={allowEmpty ? "Standard" : "#rrggbb"} value={value} onChange={(e) => onChange(e.target.value.trim())} />
        {allowEmpty && value && <button type="button" className="color-clear" onClick={() => onChange("")} aria-label="Farbe entfernen">✕</button>}
      </span>
    </label>
  );
}
