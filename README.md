# Artistroom – Event-Anmeldung

Anmeldeseite und Admin-Dashboard für **Artistroom**. Veranstaltungsname, Datum, Uhrzeit und Ort werden unter **Admin → Einstellungen** verwaltet.

- **Öffentliche Anmeldung** (`/`): Startseite mit Logo, beim Scrollen erscheinender „Zur Anmeldung“-Knopf, danach der Flow – Kategorie wählen → Kontaktdaten → Daten überprüfen inkl. Pflicht-Einwilligung zu Foto-/Videoaufnahmen → Bestätigung mit Anmeldenummer. Mit Inline-Validierung, Lade-, Fehler- und Erfolgszuständen.
- **Admin-Dashboard** (`/admin`): geschützter Login, Live-Übersicht nach Status (Ausstehend, Kostenlos, Zahlung angefordert, Bezahlt, Abgelehnt inkl. offener/eingegangener Beträge), Entscheidungs-Knöpfe pro Person (Kostenlos / € Anfordern / Ablehnen), Liste aller Anmeldungen mit fortlaufender Anmeldenummer (#0001, #0002 …), Kennzahlen pro Kategorie, neueste Anmeldungen, Suche, Kategorie-/Datumsfilter, Sortierung, Detailansicht mit Statuswechsel, Löschen mit Bestätigung, CSV-Export und Live-Aktualisierung.

## Technologien

- React 19 + Vite + TypeScript, React Router
- Netlify Functions (`netlify/functions/*.mts`) für API, Validierung und Authentifizierung
- Netlify Database (verwaltetes Postgres) mit Drizzle ORM
- Reines CSS (`src/styles.css`), Schrift: Inter

## Admin-Zugang

Admin-Konten liegen in der Tabelle `admin_users` der Netlify Database. Passwörter werden **nie im Klartext**
gespeichert, sondern als gesalzener scrypt-Hash. Das erste Konto (`AdminArtist`) wird per Migration angelegt.

Vor dem Livegang **beide** Schlüssel als Secret setzen (je ≥ 32 zufällige Zeichen) und eine Kopie sicher aufbewahren:

```bash
netlify env:set PASSWORD_ENCRYPTION_KEY "$(openssl rand -base64 48)" --secret
netlify env:set SESSION_SECRET "$(openssl rand -base64 48)" --secret
```

- `PASSWORD_ENCRYPTION_KEY` verschlüsselt Passwort-Hashes, persönliche Daten, Log-Einträge und Zugangsdaten. Ohne ihn liegt
  der Schlüssel in derselben Datenbank. **Einmal gesetzt, nie mehr ändern oder löschen.** Ältere Daten werden danach automatisch neu verschlüsselt.
- `SESSION_SECRET` signiert die Login-Cookies (zusammen mit dem Passwort-Hash – eine Passwortänderung beendet weiterhin alle Sessions).

Die Start-Konten `AdminArtist` und `SuperUser` müssen beim ersten Login ein neues Passwort festlegen.

## Datenbank

Netlify Database wird beim ersten Zugriff automatisch bereitgestellt – es ist kein Connection-String nötig.
Das Schema steht in `db/schema.ts`; Migrationen liegen in `netlify/database/migrations/` und werden bei jedem Deploy automatisch angewendet. Deploy-Previews erhalten einen eigenen Datenbank-Branch.

Schema geändert? Neue Migration erzeugen:

```bash
npx drizzle-kit generate --name add_some_column
```

## Lokal starten

```bash
npm install
cp .env.example .env    # Werte anpassen
netlify dev --port 8889 # startet Vite und Functions
```

Die App läuft dann unter der von `netlify dev` angezeigten URL; das Dashboard unter `/admin`.

## Deployment

Repository mit Netlify verbinden (oder `netlify deploy --build`). Build-Befehl und Publish-Verzeichnis sind in `netlify.toml` hinterlegt. Umgebungsvariablen setzen, fertig.

## E-Mail und Zahlungslink einrichten

Der Versand erfolgt über Resend. In Resend zuerst eine eigene Absenderdomain verifizieren und einen API-Schlüssel mit Versandberechtigung erstellen. Diesen ausschließlich als geschützte Netlify-Umgebungsvariable `RESEND_API_KEY` für Functions hinterlegen und anschließend neu deployen. Keine Zugangsdaten im Repository oder in den Veranstaltungseinstellungen speichern.

Unter **Admin → Einstellungen** Absendername, verifizierte Absenderadresse und den HTTPS-Zahlungslink des Zahlungsanbieters eintragen. Diese Einstellungen liegen in Netlify Database und können später geändert werden. Der Zahlungslink wird für alle Zahlungsanforderungen verwendet; Betrag und Anmeldenummer stehen zusätzlich in der Nachricht. Der Zahlungsanbieter muss diesen Ablauf unterstützen. Zahlungseingänge werden vom Team manuell als bezahlt markiert; es gibt keinen automatischen Zahlungsabgleich.

Jede Statusaktion zeigt zuerst die Empfängeradresse und den gewünschten Status zur Bestätigung. Kostenlos und Bezahlt versenden ein PNG-QR-Ticket im Anhang, Zahlungsanforderungen den Betrag mit Zahlungslink. Ablehnen und Zurücksetzen versenden die entsprechende Statusinformation. Ohne vollständige Versandkonfiguration oder bei einem vom Versanddienst gemeldeten Fehler bleibt der Status unverändert. Der Versandzeitpunkt bedeutet Übergabe an Resend, nicht bestätigte Zustellung. Wiederholungen derselben Operation verwenden einen Idempotenzschlüssel; der Versand und die Datenbank sind dennoch zwei getrennte Systeme.

## Mobiler Check-in

**Admin → Check-in** auf dem Mobiltelefon über HTTPS öffnen, Kamera freigeben und das Ticket scannen. Nach der Anzeige von Name, Kategorie und gegebenenfalls Instagram wird der Einlass separat bestätigt. Als Alternative lässt sich der Ticketcode aus der E-Mail eingeben. Die Kamera stoppt nach einem Scan, beim Verlassen des Menüs oder beim Ausblenden der Seite; Bilder werden nicht gespeichert.

QR-Tickets enthalten eine zufällige Kennung. Personeninformationen werden nur über die geschützte Admin-API abgerufen. Nur kostenlose oder als bezahlt markierte Anmeldungen sind zugelassen. Gleichzeitige oder wiederholte Scans überschreiben den ersten Check-in-Zeitpunkt nicht. Die Übersicht zeigt eingecheckte, noch erwartete und nicht freigegebene Personen sowie Kategorie-Zähler. Sie aktualisiert sich bei sichtbarer Seite alle fünf Sekunden; Check-in-Zeiten werden in Europe/Berlin angezeigt. Auch der CSV-Export enthält Check-in- und Versandzeitpunkte.

Die zusätzliche Migration für Veranstaltungseinstellungen und Check-in wird von Netlify beim Deploy angewendet. Bereits angewendete Migrationen bleiben unverändert.

## Prüfen

`npx tsc --noEmit` prüft die TypeScript-Dateien. `npm test` prüft Versandkonfiguration, sichere Zahlungslinks, QR-Anhänge, Wiederholungsschlüssel und Versandfehler mit simuliertem Resend, ohne E-Mails zu verschicken. Echte Kamerafreigabe und tatsächliche Zustellung müssen nach Einrichtung auf einem Mobilgerät geprüft werden.
