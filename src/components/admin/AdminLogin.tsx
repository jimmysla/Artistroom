import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import TextField from "../TextField";
import Button from "../Button";
import Alert from "../Alert";
import { api, ApiError } from "../../lib/api";
import type { AdminIdentity } from "../../../shared/admin";

export default function AdminLogin({ onSuccess }: { onSuccess: (user: AdminIdentity) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userError = touched && !username.trim() ? "Bitte gib deinen Benutzernamen ein." : undefined;
  const passError = touched && !password ? "Bitte gib dein Passwort ein." : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login fehlgeschlagen.");
      // Clear the password, but don't additionally show "Bitte gib dein Passwort ein".
      setPassword("");
      setTouched(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <main className="container login-container">
        <Link to="/" className="back-link">
          <span aria-hidden="true">←</span> Zur Anmeldung
        </Link>
        <img className="login-logo" src="/logo-640.webp" alt="" width="160" height="160" />
        <p className="eyebrow">Login</p>
        <h1 className="event-title">Artistroom</h1>
        <p className="event-meta">Melde dich an, um die Anmeldungen zu verwalten.</p>

        <form className="card login-card" onSubmit={submit} noValidate>
          <TextField
            label="Benutzername"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            error={userError}
            onChange={(v) => {
              setUsername(v);
              setError(null);
            }}
          />
          <TextField
            label="Passwort"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            error={passError}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="btn-block" loading={loading}>
            {loading ? "Wird geprüft…" : "Login"}
          </Button>
        </form>
      </main>
    </div>
  );
}
