import type { CSSProperties } from "react";
import type { BoxBlock } from "../../shared/site";

/** Info box from the form builder: emoji, title and text with an optional accent colour. */
export default function InfoBox({ box }: { box: BoxBlock }) {
  if (!box.title && !box.text) return null;
  return (
    <aside className={`info-box ${box.color ? "has-color" : ""}`} style={box.color ? ({ "--box-color": box.color } as CSSProperties) : undefined}>
      {box.icon && <span className="info-box-icon" aria-hidden="true">{box.icon}</span>}
      <div>
        {box.title && <strong className="info-box-title">{box.title}</strong>}
        {box.text.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </aside>
  );
}
