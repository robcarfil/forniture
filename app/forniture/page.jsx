"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SuppliesSidebar from "../SuppliesSidebar";

function money(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR"
  });
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

export default function FornitureSummaryPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ homes: [], supplies: [], invoices: [] });
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const me = await readJson(await fetch("/api/auth/me", { credentials: 'include' }));
        if (!mounted) return;
        setUser(me.user || null);
        if (!me.user) {
          router.replace('/login');
          return;
        }
        const summary = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
        if (!mounted) return;
        setData(summary);
      } catch (err) {
        if (!mounted) return;
        setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const onAuth = (ev) => {
      const u = ev?.detail?.user || null;
      if (u) {
        // just refetch summary
        (async () => {
          setLoading(true);
          try {
            const summary = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
            setData(summary);
            setUser(u);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        setUser(null);
        router.replace('/login');
      }
    };
    window.addEventListener('auth:changed', onAuth);
    return () => { mounted = false; window.removeEventListener('auth:changed', onAuth); };
  }, [router]);

  const cards = useMemo(() => {
    const supplyByHome = new Map();
    const supplyById = new Map();

    for (const supply of data.supplies) {
      supplyById.set(supply.id, supply);
      supplyByHome.set(supply.homeId, (supplyByHome.get(supply.homeId) || 0) + 1);
    }

    const invoiceTotalsByHome = new Map();
    for (const invoice of data.invoices) {
      const supply = supplyById.get(invoice.supplyId);
      if (!supply) continue;
      const homeId = supply.homeId;
      invoiceTotalsByHome.set(homeId, (invoiceTotalsByHome.get(homeId) || 0) + Number(invoice.amount || 0));
    }

    return data.homes.map((home) => ({
      id: home.id,
      name: home.name,
      address: home.address,
      suppliesCount: supplyByHome.get(home.id) || 0,
      invoicesTotal: invoiceTotalsByHome.get(home.id) || 0
    }));
  }, [data]);

  if (loading) return <main className="supplies-page"><p>Caricamento riepilogo...</p></main>;

  if (!user) {
    return (
      <main className="supplies-page">
        <div className="supplies-layout">
          <SuppliesSidebar />
          <div className="supplies-content">
            <section className="panel summary-header-panel">
              <h1>Riepilogo forniture</h1>
              <p>Per accedere al riepilogo devi effettuare il login.</p>
              <a className="summary-link" href="/">Vai alla home</a>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />
        <div className="supplies-content">
          <section className="summary-header-panel panel">
            <p className="eyebrow">Riepilogo</p>
            <h1>Forniture per casa</h1>
            <p>Vista sintetica con numero forniture e totale fatture per ogni casa.</p>
          </section>

          {error && <p className="inline-message">{error}</p>}

          <section className="home-summary-grid">
            {cards.map((card) => (
              <article className="panel home-summary-card" key={card.id}>
                <div className="home-summary-top">
                  <h2>{card.name}</h2>
                  <span>{card.suppliesCount} forniture</span>
                </div>
                <p className="muted">{card.address || "Indirizzo non specificato"}</p>
                <div className="home-summary-stats">
                  <div>
                    <small>Numero forniture</small>
                    <strong>{card.suppliesCount}</strong>
                  </div>
                  <div>
                    <small>Totale fatture</small>
                    <strong>{money(card.invoicesTotal)}</strong>
                  </div>
                </div>
                <a className="ghost home-supplies-link" href={`/case/${card.id}/forniture`}>
                  Apri forniture casa
                </a>
              </article>
            ))}
          </section>

          {!cards.length && <p className="muted">Nessuna casa presente per il riepilogo.</p>}
        </div>
      </div>
    </main>
  );
}
