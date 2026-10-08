"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupRequiredPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Password123!");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Impossibile creare il primo amministratore");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error.message || "Errore durante l’inizializzazione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Setup richiesto</p>
            <h1>Primo accesso amministratore</h1>
            <p>Questo database non contiene ancora utenti. Crea il primo account amministratore per continuare.</p>
          </section>

          <section className="panel">
            {message && <p className="inline-message">{message}</p>}
            <form className="home-form" onSubmit={handleSubmit}>
              <label>
                Username
                <input value={username} onChange={(event) => setUsername(event.target.value)} required />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </label>
              <div className="home-form-actions">
                <button type="submit" disabled={loading}>
                  {loading ? "Creazione…" : "Crea amministratore"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
