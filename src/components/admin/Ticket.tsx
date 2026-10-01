import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Registration } from "../../lib/api";
export default function Ticket({ registration: r }: { registration: Registration }) {
  const [image, setImage] = useState("");
  useEffect(() => { let active = true; setImage(""); if (r.ticketToken) QRCode.toDataURL(`artistroom:${r.ticketToken}`, { width: 280, margin: 4 }).then(url => { if (active) setImage(url); }).catch(() => {}); return () => { active = false; }; }, [r.ticketToken]);
  if (!r.ticketToken || !["kostenlos", "bezahlt"].includes(r.status)) return null;
  return <section className="admin-ticket"><h3>QR-Ticket</h3>{image && <img src={image} width="280" height="280" alt={`Einlassticket für ${r.name}`} />}<p className="muted">{r.checkedInAt ? "Bereits verwendet" : "Gültig für einen Einlass"}</p><code>artistroom:{r.ticketToken}</code></section>;
}
