export const DEFAULT_EVENT = {
  name: "Artistroom", date: "2026-05-30", time: "", location: "Spitalerstraße 3, Hamburg",
  senderEmail: "", senderName: "Artistroom", paymentUrl: "", paymentProvider: "online", ticketPrice: "",
  smtpHost: "", smtpPort: "587", smtpSecurity: "starttls", smtpUser: "", smtpPassword: "",
  welcomeText: "", welcomeImage: "",
  // Footer links „Impressum“ / „Datenschutz“: "an" | "aus" plus the texts shown in a dialog.
  showLegal: "aus", imprintText: "", privacyText: "",
  stripeSecretKey: "", paypalClientId: "", paypalClientSecret: "", paypalMode: "live",
};
export type EventSettings = typeof DEFAULT_EVENT;
export type PublicEvent = Pick<EventSettings, "name" | "date" | "time" | "location" | "ticketPrice" | "welcomeText" | "welcomeImage" | "showLegal" | "imprintText" | "privacyText">;
export function eventDate(event: PublicEvent) {
  return `${new Date(`${event.date}T12:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}${event.time ? ` · ${event.time} Uhr` : ""}`;
}
export function validPaymentUrl(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}

/** Default welcome text on the home page; {ticketpreis} is replaced with the configured net price. */
export const DEFAULT_WELCOME_TEXT = `Schön, dass du hier bist. 🫶🏽
Diese Registrierung ist ausschließlich für eingeladene und empfohlene Gäste vorgesehen. Da wir den Artist Room bewusst kuratieren und die Anzahl der Plätze begrenzt ist, wird jede Anmeldung von unserem Team geprüft.
Nach erfolgreicher Bestätigung beträgt dein Ticketpreis {ticketpreis}.
Der Ticketbeitrag ist gleichzeitig dein Commitment an den Abend. Wir möchten die Plätze an Menschen vergeben, die sich bewusst die Zeit nehmen, dabei zu sein, neue Menschen kennenzulernen und Teil des Artist Room zu werden.`;

export function welcomeText(event: Pick<EventSettings, "welcomeText" | "ticketPrice">) {
  const price = event.ticketPrice ? `${event.ticketPrice} € zzgl. Steuern` : "22 € zzgl. Steuern";
  return (event.welcomeText.trim() || DEFAULT_WELCOME_TEXT).replace(/\{ticketpreis\}/g, price);
}
