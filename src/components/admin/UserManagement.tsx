import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, formatDateTime, type AdminAccount } from "../../lib/api";
import { PERMISSIONS, validatePassword, validatePasswordConfirm, validateUsername, type Permission } from "../../../shared/admin";
import Alert from "../Alert";
import Button from "../Button";
import TextField from "../TextField";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  currentUser: string;
  onUnauthorized: () => void;
}

function PermissionPicker({ value, onChange, disabled }: { value: Permission[]; onChange: (v: Permission[]) => void; disabled?: boolean }) {
  return (
    <div className="perm-grid">
      {PERMISSIONS.map((p) => (
        <label key={p.id} className="perm-option">
          <input
            type="checkbox"
            checked={disabled || value.includes(p.id)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))}
          />
          <span>
            {p.label}
            {p.hint && <small>{p.hint}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}

function UserCard({ user, isSelf, onSaved, onDelete, onError }: { user: AdminAccount; isSelf: boolean; onSaved: (u: AdminAccount, msg: string) => void; onDelete: () => void; onError: (e: unknown) => void }) {
  const [permissions, setPermissions] = useState<Permission[]>(user.permissions);
  const [isSuper, setIsSuper] = useState(user.isSuper);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = isSuper !== user.isSuper || [...permissions].sort().join() !== [...user.permissions].sort().join();

  const save = async (patch: Parameters<typeof api.updateUser>[1], msg: string) => {
    setBusy(true);
    try {
      const { user: updated } = await api.updateUser(user.id, patch);
      onSaved(updated, msg);
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const passwordError = password ? validatePassword(password) : undefined;
  // Only complain about the repetition once something was typed there.
  const confirmError = passwordConfirm ? validatePasswordConfirm(password, passwordConfirm) : undefined;
  const canChangePassword = Boolean(password) && !passwordError && !validatePasswordConfirm(password, passwordConfirm);

  return (
    <li className={`card user-card ${user.active ? "" : "is-inactive"}`}>
      <div className="user-head">
        <div>
          <strong className="user-name">{user.username}</strong>
          {isSelf && <span className="user-pill">Du</span>}
          {user.isSuper && <span className="user-pill user-pill-super">Super User</span>}
          {!user.active && <span className="user-pill user-pill-off">Deaktiviert</span>}
          <p className="muted small">Erstellt: {formatDateTime(user.createdAt)}</p>
        </div>
        <div className="user-head-actions">
          {!isSelf && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => save({ active: !user.active }, user.active ? "Konto deaktiviert" : "Konto aktiviert")}>
              {user.active ? "Deaktivieren" : "Aktivieren"}
            </Button>
          )}
          {!isSelf && (
            <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
              Löschen
            </Button>
          )}
        </div>
      </div>

      <label className="perm-option perm-super">
        <input type="checkbox" checked={isSuper} disabled={isSelf} onChange={(e) => setIsSuper(e.target.checked)} />
        <span>
          Super User
          <small>Alle Bereiche, Benutzerverwaltung und „Alle Anmeldungen löschen“</small>
        </span>
      </label>
      <PermissionPicker value={permissions} onChange={setPermissions} disabled={isSuper} />
      <div className="user-save">
        <Button size="sm" disabled={!dirty} loading={busy && dirty} onClick={() => save({ permissions, isSuper }, "Berechtigungen gespeichert")}>
          Berechtigungen speichern
        </Button>
      </div>

      <form
        className="user-password"
        onSubmit={(e) => {
          e.preventDefault();
          if (canChangePassword) void save({ password, passwordConfirm }, "Passwort geändert");
        }}
      >
        <TextField label="Neues Passwort setzen" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={passwordError} />
        <TextField label="Neues Passwort wiederholen" type="password" autoComplete="new-password" value={passwordConfirm} onChange={setPasswordConfirm} error={confirmError} />
        <Button type="submit" variant="secondary" size="sm" disabled={!canChangePassword || busy}>
          Passwort ändern
        </Button>
      </form>
    </li>
  );
}

export default function UserManagement({ currentUser, onUnauthorized }: Props) {
  const [users, setUsers] = useState<AdminAccount[] | null>(null);
  const [encryption, setEncryption] = useState<"env" | "db" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toDelete, setToDelete] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>(["anmeldungen"]);
  const [isSuper, setIsSuper] = useState(false);
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      setMessage("");
      setError(err instanceof ApiError ? err.message : "Aktion fehlgeschlagen.");
    },
    [onUnauthorized],
  );

  useEffect(() => {
    api
      .listUsers()
      .then((r) => {
        setUsers(r.users);
        setEncryption(r.encryption);
      })
      .catch(handle);
  }, [handle]);

  const done = (msg: string) => {
    setError("");
    setMessage(msg);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateUsername(username.trim()) || validatePassword(password) || validatePasswordConfirm(password, passwordConfirm)) return;
    setCreating(true);
    setFieldErrors({});
    try {
      const { user } = await api.createUser({ username: username.trim(), password, passwordConfirm, permissions, isSuper });
      setUsers((u) => [...(u ?? []), user]);
      setUsername("");
      setPassword("");
      setPasswordConfirm("");
      setPermissions(["anmeldungen"]);
      setIsSuper(false);
      setTouched(false);
      done(`Konto „${user.username}“ erstellt`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      handle(err);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteUser(toDelete.id);
      setUsers((u) => u?.filter((x) => x.id !== toDelete.id) ?? null);
      done(`Konto „${toDelete.username}“ gelöscht`);
      setToDelete(null);
    } catch (err) {
      handle(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="users-panel">
      <h1>Benutzerverwaltung</h1>
      <p className="muted">Dashboard-Konten anlegen und festlegen, auf welche Bereiche des Dashboards sie zugreifen dürfen. Änderungen gelten sofort.</p>

      {encryption && (
        <p className="encryption-note is-on">
          🔒 Alles Sensible ist verschlüsselt – egal wie lang: Passwörter (zusätzlich unumkehrbar gehasht), alle persönlichen Daten der Anmeldungen, Log-Einträge sowie die Zugangsdaten für Postfach, Stripe und PayPal. Auch die Übertragung aus dem Browser ist verschlüsselt. Du musst dafür nichts einstellen.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <form className="card user-create" onSubmit={create} noValidate>
        <h2>Neues Konto</h2>
        <div className="info-box" role="note">
          <strong>ℹ️ So legst du ein Konto an</strong>
          <ul>
            <li><b>Benutzername:</b> 3–40 Zeichen, nur Buchstaben (A–Z, ohne Umlaute), Ziffern sowie <code>.</code> <code>-</code> <code>_</code> – keine Leerzeichen. Beispiel: <code>max.muster</code> oder <code>Einlass_1</code>. Groß-/Kleinschreibung ist beim Login egal.</li>
            <li><b>Passwort:</b> mindestens 8 Zeichen, nach oben keine Grenze. Alle Zeichen sind erlaubt (auch Umlaute, Leerzeichen, Sonderzeichen). Tipp: ein Satz wie <code>Bühne frei um 20 Uhr!</code> ist sicher und gut zu merken.</li>
            <li>Das Passwort zweimal gleich eingeben – so sperrst du niemanden durch einen Tippfehler aus.</li>
            <li><b>Freigaben:</b> nur die Bereiche anhaken, die die Person wirklich braucht (z. B. nur „Check-in“ für den Einlass). Super User dürfen alles.</li>
          </ul>
        </div>
        <div className="settings-fields">
          <TextField label="Benutzername" required autoComplete="off" value={username} onChange={setUsername} error={(touched && validateUsername(username.trim())) || fieldErrors.username} />
          <TextField label="Passwort" required type="password" autoComplete="new-password" value={password} onChange={setPassword} error={(touched && validatePassword(password)) || fieldErrors.password} />
          <TextField label="Passwort wiederholen" required type="password" autoComplete="new-password" value={passwordConfirm} onChange={setPasswordConfirm} error={((touched || passwordConfirm) && validatePasswordConfirm(password, passwordConfirm)) || fieldErrors.passwordConfirm} />
        </div>
        <label className="perm-option perm-super">
          <input type="checkbox" checked={isSuper} onChange={(e) => setIsSuper(e.target.checked)} />
          <span>
            Super User
            <small>Alle Bereiche, Benutzerverwaltung und „Alle Anmeldungen löschen“</small>
          </span>
        </label>
        <p className="field-label">Freigaben</p>
        <PermissionPicker value={permissions} onChange={setPermissions} disabled={isSuper} />
        <Button type="submit" size="md" loading={creating}>
          Konto erstellen
        </Button>
      </form>

      <h2>Alle Konten{users && ` (${users.length})`}</h2>
      {!users ? (
        !error && <p role="status">Konten werden geladen…</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <UserCard
              key={`${u.id}-${u.isSuper}-${u.permissions.join()}`}
              user={u}
              isSelf={u.username === currentUser}
              onSaved={(updated, msg) => {
                setUsers((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
                done(`${updated.username}: ${msg}`);
              }}
              onDelete={() => setToDelete(u)}
              onError={handle}
            />
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog title="Konto löschen?" confirmLabel="Endgültig löschen" loading={deleting} onCancel={() => setToDelete(null)} onConfirm={confirmDelete}>
          Das Konto <strong>{toDelete.username}</strong> wird dauerhaft gelöscht und sofort abgemeldet.
        </ConfirmDialog>
      )}
    </section>
  );
}
