/** Areas of the admin dashboard an account can be granted. Super users implicitly have all of them. */
export const PERMISSIONS = [
  { id: "anmeldungen", label: "Anmeldungen ansehen", hint: "Teilnehmerliste, Details und Übersicht" },
  { id: "status", label: "Status ändern", hint: "Kostenlos, € Anfordern, Ablehnen, Bezahlt – inkl. E-Mail" },
  { id: "loeschen", label: "Einzelne Anmeldungen löschen", hint: "" },
  { id: "export", label: "CSV-Export", hint: "" },
  { id: "checkin", label: "Check-in", hint: "QR-Codes scannen und Einlass bestätigen" },
  { id: "einstellungen", label: "Einstellungen", hint: "Datum, Ort, Absender und Zahlungslink" },
  { id: "logging", label: "Logging", hint: "Protokoll aller Aktionen einsehen" },
  { id: "umfrage", label: "Umfrage-Ergebnisse", hint: "Antworten der Umfrage einsehen" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["id"];

export const isPermission = (v: unknown): v is Permission => PERMISSIONS.some((p) => p.id === v);

export interface AdminIdentity {
  username: string;
  isSuper: boolean;
  permissions: Permission[];
  /** Account still uses a seeded password → must set a new one before anything else. */
  mustChangePassword?: boolean;
}

export const can = (user: AdminIdentity, permission: Permission) => user.isSuper || user.permissions.includes(permission);

/** Audit log action types with German labels (also used for the filter dropdown). */
export const LOG_ACTIONS = [
  { id: "login", label: "Login" },
  { id: "login_fehlgeschlagen", label: "Login fehlgeschlagen" },
  { id: "login_gesperrt", label: "Login gesperrt (zu viele Fehlversuche)" },
  { id: "login_deaktiviert", label: "Login eines deaktivierten Kontos" },
  { id: "passwort_geaendert", label: "Eigenes Passwort geändert" },
  { id: "logout", label: "Logout" },
  { id: "anmeldung_eingegangen", label: "Neue Anmeldung" },
  { id: "status_geaendert", label: "Status geändert" },
  { id: "status_fehlgeschlagen", label: "Statusänderung fehlgeschlagen" },
  { id: "qr_gescannt", label: "QR-Code gescannt" },
  { id: "qr_ungueltig", label: "QR-Code ungültig" },
  { id: "checkin_bestaetigt", label: "Check-in bestätigt" },
  { id: "anmeldung_geloescht", label: "Anmeldung gelöscht" },
  { id: "alle_anmeldungen_geloescht", label: "Alle Anmeldungen gelöscht" },
  { id: "csv_export", label: "CSV-Export" },
  { id: "einstellungen_geaendert", label: "Einstellungen geändert" },
  { id: "anmeldeformular_geaendert", label: "Anmeldeformular geändert" },
  { id: "testmail_gesendet", label: "Test-E-Mail gesendet" },
  { id: "bestaetigung_gesendet", label: "Eingangsbestätigung gesendet" },
  { id: "bestaetigung_fehlgeschlagen", label: "Eingangsbestätigung fehlgeschlagen" },
  { id: "zahlung_gestartet", label: "Zahlung gestartet (Checkout)" },
  { id: "zahlungserinnerung_gesendet", label: "Zahlungserinnerung gesendet" },
  { id: "zahlung_bestaetigt", label: "Zahlung bestätigt (Stripe/PayPal)" },
  { id: "zahlung_verbindung_getestet", label: "Zahlungsanbieter getestet" },
  { id: "testkauf_gestartet", label: "Test-Warenkorb erstellt" },
  { id: "testkauf_bestaetigt", label: "Testkauf bestätigt" },
  { id: "daten_verschluesselt", label: "Daten nachträglich verschlüsselt" },
  { id: "log_bereinigt", label: "Alte Log-Einträge gelöscht" },
  { id: "aktion_rueckgaengig", label: "Aktion rückgängig gemacht" },
  { id: "bild_hochgeladen", label: "Bild hochgeladen" },
  { id: "bild_geloescht", label: "Bild gelöscht" },
  { id: "umfrage_gesendet", label: "Umfrage verschickt" },
  { id: "umfrage_beantwortet", label: "Umfrage beantwortet" },
  { id: "reset_verweigert", label: "Löschen aller Anmeldungen verweigert" },
  { id: "benutzer_erstellt", label: "Benutzer erstellt" },
  { id: "benutzer_geaendert", label: "Benutzer geändert" },
  { id: "benutzer_geloescht", label: "Benutzer gelöscht" },
] as const;

export const logActionLabel = (id: string) => LOG_ACTIONS.find((a) => a.id === id)?.label ?? id;

export const RESET_CONFIRMATION = "ALLE LÖSCHEN";

const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;

export function validateUsername(v: string): string | undefined {
  if (!USERNAME_RE.test(v)) return "Benutzername: 3–40 Zeichen, nur Buchstaben, Ziffern, Punkt, Minus und Unterstrich.";
}

/** Second entry of a new password – prevents locking yourself out with a typo. */
export function validatePasswordConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return "Bitte das Passwort ein zweites Mal eingeben.";
  if (password !== confirm) return "Die Passwörter stimmen nicht überein.";
}

export function validatePassword(v: string): string | undefined {
  if (v.length < 8) return "Das Passwort muss mindestens 8 Zeichen lang sein.";
}
