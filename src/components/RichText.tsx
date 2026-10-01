import type { ReactNode } from "react";

/*
 * Minimal, safe text formatting for admin-written pages (Impressum / Datenschutz):
 * "# " / "## " headings, blank line = new paragraph, single line breaks kept, **bold**,
 * https:// links and e-mail addresses become links. No HTML is ever interpreted.
 */
const INLINE = /(\*\*[^*]+\*\*|https:\/\/[^\s<>()]+[^\s<>().,;:!?]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("https://")) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    return <a key={i} href={`mailto:${part}`}>{part}</a>;
  });
}

export default function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="rich-text">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) return <h3 key={i}>{inline(block.slice(3))}</h3>;
        if (block.startsWith("# ")) return <h2 key={i}>{inline(block.slice(2))}</h2>;
        const lines = block.split("\n");
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}
