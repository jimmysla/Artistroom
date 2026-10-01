import { useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import TextField from "../TextField";
import { ApiError } from "../../lib/api";
import { RESET_CONFIRMATION } from "../../../shared/admin";

interface Props {
  count: number;
  onCancel: () => void;
  onConfirm: (confirmation: string, username: string, password: string) => Promise<void>;
}

/**
 * Before everything is wiped the admin has to type the confirmation phrase and log in
 * with a super user account (checked again on the server, credentials sent encrypted).
 */
export default function ResetDialog({ count, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = value.trim() === RESET_CONFIRMATION && username.trim() !== "" && password !== "";

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(value.trim(), username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen.");
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <Modal title="Alle Anmeldungen löschen?" onClose={busy ? () => {} : onCancel} size="sm">
      <p className="confirm-text">
        Es werden <strong>alle {count} Anmeldung{count === 1 ? "" : "en"}</strong> inklusive Tickets und Check-ins
        gelöscht. Die Anmeldenummern werden zurückgesetzt – die nächste Anmeldung erhält wieder <strong>#0001</strong>.
        Im Logging kann das 3 Monate lang rückgängig gemacht werden, solange keine neuen Anmeldungen dieselben Nummern belegen.
      </p>
      <form
        className="reset-form"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <label className="settings-field">
          Zur Bestätigung „{RESET_CONFIRMATION}“ eingeben
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus />
        </label>
        <fieldset className="reset-auth">
          <legend>🔐 Login eines Super Users erforderlich</legend>
          <TextField label="Benutzername" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(v) => { setUsername(v); setError(""); }} />
          <TextField label="Passwort" type="password" autoComplete="current-password" value={password} onChange={(v) => { setPassword(v); setError(""); }} />
        </fieldset>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger" size="md" loading={busy} disabled={!ready}>
            Endgültig alles löschen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
