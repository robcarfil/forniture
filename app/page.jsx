"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FornitureSummaryPage from "./forniture/page";

export default function HomePage() {
  const [status, setStatus] = useState("loading");
  const router = useRouter();

  useEffect(() => {
    async function checkSetup() {
      try {
        const response = await fetch("/api/auth/setup", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setStatus("ready");
          return;
        }

        if (data.needsSetup) {
          router.replace("/setup");
          setStatus("setup");
          return;
        }

        setStatus("ready");
      } catch (error) {
        setStatus("ready");
      }
    }

    checkSetup();
  }, [router]);

  if (status === "loading") {
    return (
      <main className="supplies-page">
        <div className="supplies-layout">
          <div className="supplies-content">
            <section className="panel summary-header-panel">
              <p className="eyebrow">Avvio</p>
              <h1>Verifica inizializzazione</h1>
              <p>Controllo dello stato dell’applicazione…</p>
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (status === "setup") {
    return null;
  }

  return <FornitureSummaryPage />;
}
