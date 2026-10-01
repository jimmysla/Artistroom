import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminLogin from "../components/admin/AdminLogin";
import AdminDashboard from "../components/admin/AdminDashboard";
import Spinner from "../components/Spinner";
import { api } from "../lib/api";
import type { AdminIdentity } from "../../shared/admin";

type AuthState = { status: "checking" } | { status: "guest" } | { status: "authed"; user: AdminIdentity };

export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // /login when logged out, /dashboard when logged in.
  useEffect(() => {
    if (auth.status === "checking") return;
    const path = auth.status === "authed" ? "/dashboard" : "/login";
    if (pathname !== path) navigate(path, { replace: true });
    document.title = `${auth.status === "authed" ? "Dashboard" : "Login"} · Artistroom`;
  }, [auth.status, pathname, navigate]);

  useEffect(() => {
    api
      .session()
      .then((s) => setAuth(s.authenticated && s.user ? { status: "authed", user: s.user } : { status: "guest" }))
      .catch(() => setAuth({ status: "guest" }));
  }, []);

  if (auth.status === "checking") {
    return (
      <div className="admin-center">
        <Spinner label="Sitzung wird geprüft" />
      </div>
    );
  }

  if (auth.status === "guest") {
    return <AdminLogin onSuccess={(user) => setAuth({ status: "authed", user })} />;
  }

  return <AdminDashboard user={auth.user} onLoggedOut={() => setAuth({ status: "guest" })} />;
}
