"use client";
import { useEffect, useState } from "react";

export default function LayoutSettings() {
  const [settings, setSettings] = useState({ logo: "", name: "GenerApp" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/settings/layout", { credentials: 'include' }).then(r => r.json()).then(data => { if (data.settings) setSettings({ logo: data.settings.brand_logo || "", name: data.settings.brand_name || "GenerApp" }); else setMessage(data.error || "Errore"); }).finally(() => setLoading(false)); }, []);
  function chooseLogo(event) { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_500_000) return setMessage("Il logo deve essere più piccolo di 1,5 MB"); const reader = new FileReader(); reader.onload = () => setSettings(current => ({ ...current, logo: reader.result })); reader.readAsDataURL(file); }
  async function save(event) { event.preventDefault(); setMessage(""); const response = await fetch("/api/settings/layout", { method: "PUT", credentials: 'include', headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }); const data = await response.json(); setMessage(response.ok ? "Impostazioni salvate" : data.error || "Salvataggio non riuscito"); }
  if (loading) return <main className="settings-page"><p>Caricamento...</p></main>;
  return <main className="settings-page"><header className="settings-header"><a href="/">← Dashboard</a><p className="eyebrow">Impostazioni</p><h1>Layout</h1><p>Personalizza il logo e il nome visualizzato nell’applicazione.</p></header><form className="settings-card" onSubmit={save}><div className="settings-section"><div><h2>Identità applicazione</h2><p>Questi dati verranno salvati nel database e usati nell’interfaccia.</p></div><label>Nome dopo il logo<input value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} maxLength={80} required /></label><label>Logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={chooseLogo} /><small>PNG, JPG, SVG o WebP · massimo 1,5 MB</small></label><div className="logo-preview"><span>{settings.logo ? <img src={settings.logo} alt="Anteprima logo" /> : <span className="brand-mark">G</span>}</span><strong>{settings.name || "GenerApp"}</strong></div></div><div className="settings-actions"><span className={message.includes("salvate") ? "success" : "error"}>{message}</span><button type="submit">Salva modifiche</button></div></form></main>;
}
