import { useState, type FormEvent } from "react";
import TextField from "../TextField";
import Button from "../Button";
import Alert from "../Alert";
import { api, ApiError } from "../../lib/api";
import { validatePassword, validatePasswordConfirm, type AdminIdentity } from "../../../shared/admin";

/**
 * Shown instead of the dashboard while the account still uses a seeded (publicly known)
 * password. The server blocks every other admin request until a new password is set.
 */
export default function ForcePasswordChange({ user, onDone, onLogout }: { user: AdminIdentity; onDone: (user: AdminIdentity) => void; onLogout: () => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const passwordError = touched || password ? validatePassword(password) : undefined;
  const confirmError = touched || passwordConfirm ? validatePasswordConfirm(password, passwordConfirm) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!current || validatePassword(password) || validatePasswordConfirm(password, passwordConfirm)) return;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api.changePassword(current, password, passwordConfirm);
      onDone(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setError(err instanceof ApiError ? err.message : "Passwort konnte nicht geändert werden.");
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    onLogout();
  };

  return (
    <div className="page">
      <main className="container login-container">
        <img className="login-logo" src="/logo-640.webp" alt="" width="160" height="160" />
        <p className="eyebrow">Sicherheit</p>
        <h1 className="event-title">Neues Passwort festlegen</h1>
        <p className="event-meta">
          Das Konto <strong>{user.username}</strong> nutzt noch das ursprüngliche Start-Passwort. Bitte lege jetzt ein eigenes Passwort fest – erst danach ist das Dashboard verfügbar.
        </p>

        <form className="card login-card" onSubmit={submit} noValidate>
          <input type="text" autoComplete="username" value={user.username} readOnly hidden />
          <TextField label="Aktuelles Passwort" required type="password" autoComplete="current-password" value={current} onChange={setCurrent} error={(touched && !current ? "Bitte gib dein aktuelles Passwort ein." : undefined) || fieldErrors.currentPassword} />
          <TextField label="Neues Passwort" required type="password" autoComplete="new-password" value={password} onChange={setPassword} error={passwordError || fieldErrors.password} />
          <TextField label="Neues Passwort wiederholen" required type="password" autoComplete="new-password" value={passwordConfirm} onChange={setPasswordConfirm} error={confirmError || fieldErrors.passwordConfirm} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="btn-block" loading={loading}>
            {loading ? "Wird gespeichert…" : "Passwort speichern"}
          </Button>
          <Button type="button" variant="secondary" className="btn-block" onClick={logout} disabled={loading}>
            Abmelden
          </Button>
        </form>
      </main>
    </div>
  );
}
