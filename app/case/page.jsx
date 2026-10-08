"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SuppliesSidebar from "../SuppliesSidebar";

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

async function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const emptyForm = { id: "", name: "", address: "", notes: "", active: true };

export default function CasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [homes, setHomes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [createForm, setCreateForm] = useState({ name: "", address: "", notes: "" });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [createPhotoFile, setCreatePhotoFile] = useState(null);

  async function loadHomes() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
      setHomes(data.homes || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHomes();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setPhotoFile(null);
    setEditing(false);
  }

  function startEdit(home) {
    setEditing(true);
    setPhotoFile(null);
    setForm({
      id: home.id,
      name: home.name || "",
      address: home.address || "",
      notes: home.notes || "",
      active: Boolean(home.active)
    });
  }

  async function saveHome(event) {
    event.preventDefault();
    try {
      const payload = { entity: "home", ...form };
      if (photoFile) {
        payload.photo = {
          mime: photoFile.type,
          data: await toDataUrl(photoFile)
        };
      }
      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      );
      setMessage("Casa aggiornata");
      resetForm();
      await loadHomes();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createHome(event) {
    event.preventDefault();
    try {
      const payload = { entity: "home", ...createForm };
      if (createPhotoFile) {
        payload.photo = {
          mime: createPhotoFile.type,
          data: await toDataUrl(createPhotoFile)
        };
      }
      await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      );
      setMessage("Casa creata");
      setCreateForm({ name: "", address: "", notes: "" });
      setCreatePhotoFile(null);
      setCreateModalOpen(false);
      await loadHomes();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteHome(id) {
    if (!window.confirm("Eliminare questa casa? Verranno rimosse anche forniture e fatture collegate.")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=home&id=${id}`, { method: "DELETE", credentials: 'include' }));
      setMessage("Casa eliminata");
      if (form.id === id) resetForm();
      await loadHomes();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function openDocumentiModal(home) {
    router.push(`/case/${home.id}/documenti`);
  }



  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />

        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Gestione Case</p>
            <h1>Case</h1>
            <p>Elenco completo con creazione, modifica e cancellazione.</p>
            <button className="ghost" onClick={() => setCreateModalOpen(true)}>Nuova casa</button>
          </section>

          {message && <p className="inline-message">{message}</p>}

          {editing && (
            <section className="panel home-form-panel">
              <div className="crud-title">
                <h2>Modifica casa</h2>
              </div>
              <form className="home-form" onSubmit={saveHome}>
                <label>
                  Nome casa
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Indirizzo
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </label>
                <label>
                  Note
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </label>
                <label>
                  Foto casa
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                  />
                  {photoFile && <small>Nuova foto: {photoFile.name}</small>}
                  {!photoFile && form.id && (
                    <small>
                      <a href={`/api/forniture/attachment?id=${form.id}&type=home&preview=1`} target="_blank" rel="noopener noreferrer">
                        Visualizza foto attuale
                      </a>
                    </small>
                  )}
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  />
                  Casa attiva
                </label>
                <div className="home-form-actions">
                  <button type="submit">Salva modifiche</button>
                  <button type="button" className="ghost" onClick={resetForm}>Annulla</button>
                </div>
              </form>
            </section>
          )}

          <section className="panel">
            <h2>Elenco case</h2>
            {loading && <p className="muted">Caricamento...</p>}
            {!loading && !homes.length && <p className="muted">Nessuna casa configurata.</p>}
            {!loading && homes.map((home) => (
              <article className="line-item home-line-item" key={home.id} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                {home.photoMime && (
                  <img 
                    src={`/api/forniture/attachment?id=${home.id}&type=home&preview=1`} 
                    alt="Foto casa"
                    style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <strong>{home.name}</strong>
                  <small>{home.address || "Nessun indirizzo"}</small>
                  <small>{home.notes || "Nessuna nota"}</small>
                </div>
                <div className="home-row-actions">
                  <button className="ghost" onClick={() => openDocumentiModal(home)}>Documenti</button>
                  <button className="ghost" onClick={() => startEdit(home)}>Modifica</button>
                  <button className="danger" onClick={() => deleteHome(home.id)}>Elimina</button>
                </div>
              </article>
            ))}
          </section>

          {createModalOpen && (
            <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Nuova casa</h2>
                <form className="home-form" onSubmit={createHome}>
                  <label>
                    Nome casa
                    <input
                      value={createForm.name}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Indirizzo
                    <input
                      value={createForm.address}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, address: event.target.value }))}
                    />
                  </label>
                  <label>
                    Note
                    <textarea
                      value={createForm.notes}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </label>
                  <label>
                    Foto casa
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setCreatePhotoFile(event.target.files?.[0] || null)}
                    />
                    {createPhotoFile && <small>Foto: {createPhotoFile.name}</small>}
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Crea casa</button>
                    <button type="button" className="ghost" onClick={() => {
                      setCreateModalOpen(false);
                      setCreatePhotoFile(null);
                    }}>Chiudi</button>
                  </div>
                </form>
              </section>
            </div>
          )}


        </div>
      </div>
    </main>
  );
}
