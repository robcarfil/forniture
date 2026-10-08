"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CurrentDateTime from "../CurrentDateTime";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [expiredSession, setExpiredSession] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpiredSession(params.get("expired") === "1");

    async function checkSetupState() {
      try {
        const response = await fetch("/api/auth/setup", { credentials: "include" });
        const data = await response.json();
        setNeedsSetup(Boolean(data?.needsSetup));
      } catch (error) {
        setNeedsSetup(false);
      } finally {
        setChecking(false);
      }
    }
    checkSetupState();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) return setMessage(data.error || 'Credenziali non valide');
      try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: data.user } })); } catch (e) {}
      router.replace('/');
    } catch (err) {
      setMessage(String(err.message || 'Errore login'));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="supplies-page">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <CurrentDateTime />
        </div>
        <div className="supplies-layout">
          <div className="supplies-content">
            <section className="panel summary-header-panel">
              <p className="eyebrow">Accesso</p>
              <h1>Caricamento…</h1>
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (needsSetup) {
    return (
      <main className="supplies-page">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <CurrentDateTime />
        </div>
        <div className="supplies-layout">
          <div className="supplies-content">
            <section className="panel summary-header-panel">
              <p className="eyebrow">Setup richiesto</p>
              <h1>Non esiste ancora un utente dell'app</h1>
              <p>Crea il primo amministratore per iniziare.</p>
            </section>

            <section className="panel">
              <div className="home-form-actions">
                <button type="button" onClick={() => router.push('/setup')}>Setup</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="supplies-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <CurrentDateTime />
      </div>
      <div className="supplies-layout">
        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Accesso</p>
            <h1>Login</h1>
            <p>Accedi per gestire le forniture.</p>
          </section>

          <section className="panel">
            {expiredSession && (
              <p className="inline-message inline-message-warning">Sessione scaduta: effettua nuovamente l'accesso.</p>
            )}
            {message && <p className="inline-message">{message}</p>}
            <form className="home-form" onSubmit={submit}>
              <label>
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <div className="home-form-actions">
                <button type="submit" disabled={loading}>Accedi</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
