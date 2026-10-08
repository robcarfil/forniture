"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SuppliesSidebar from "../../../SuppliesSidebar";

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

async function toDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

const documentTypes = [
  { value: "contratto", label: "Contratto" },
  { value: "bolletta", label: "Bolletta" },
  { value: "certificato", label: "Certificato" },
  { value: "lettera", label: "Lettera" },
  { value: "altro", label: "Altro" }
];

export default function DocumentiPage() {
  const params = useParams();
  const router = useRouter();
  const homeId = params.id;
  
  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("altro");
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [pdfPreview, setPdfPreview] = useState({ url: "", title: "" });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
      const currentHome = (data.homes || []).find(h => h.id === homeId);
      setHome(currentHome || null);
      const homeDocuments = (data.homeDocuments || []).filter(doc => doc.homeId === homeId);
      setDocuments(homeDocuments);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [homeId]);

  async function handleUpload(event) {
    event.preventDefault();
    if (!uploadFile || !documentName.trim()) {
      setMessage("Seleziona un file e inserisci un nome");
      return;
    }

    try {
      const payload = {
        entity: "homeDocument",
        homeId,
        documentName: documentName.trim(),
        documentType,
        document: {
          name: uploadFile.name,
          mime: uploadFile.type,
          data: await toDataUrl(uploadFile)
        }
      };

      await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      );

      setUploadFile(null);
      setDocumentName("");
      setDocumentType("altro");
      setMessage("Documento caricato con successo");
      await loadData();
      closeUploadModal();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteDocument(id) {
    if (!window.confirm("Eliminare questo documento?")) return;
    try {
      await readJson(
        await fetch(`/api/forniture?entity=homeDocument&id=${id}`, {
          method: "DELETE",
          credentials: 'include'
        })
      );
      setMessage("Documento eliminato");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function openPdfPreview(doc) {
    fetch(`/api/forniture/attachment?id=${doc.id}&type=document`)
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        setPdfPreview({ url, title: doc.documentName });
      })
      .catch(err => setMessage(`Errore apertura PDF: ${err.message}`));
  }

  function closeUploadModal() {
    setUploadModalOpen(false);
    setUploadFile(null);
    setDocumentName("");
    setDocumentType("altro");
  }

  if (loading) return <div>Caricamento...</div>;
  if (!home) return <div>Casa non trovata</div>;

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />
        <div className="supplies-content">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <p className="eyebrow">Documenti Casa</p>
                <h1 style={{ margin: 0 }}>{home.name || "Casa"}</h1>
              </div>
              <button className="ghost" onClick={() => router.push("/case")}>← Torna alle case</button>
            </div>

            {message && <p style={{ padding: "1rem", backgroundColor: "#f0f0f0", margin: "0 0 1rem 0", color: "#d32f2f", borderRadius: "4px" }}>{message}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.5fr)", gap: "1.5rem", minHeight: "70vh", alignItems: "stretch" }}>
              {/* Colonna sinistra: Lista documenti */}
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden", minHeight: "70vh" }}>
                <div style={{ padding: "1rem", borderBottom: "1px solid #ddd", backgroundColor: "#f9f9f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>Documenti ({documents.length})</h2>
                  <button className="ghost" onClick={() => setUploadModalOpen(true)} style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}>Carica documento</button>
                </div>
                
                {documents.length === 0 ? (
                  <p style={{ padding: "1rem", textAlign: "center", color: "#999" }}>Nessun documento caricato</p>
                ) : (
                  <div style={{ flex: 1, overflow: "auto" }}>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => {
                          setSelectedDocumentId(doc.id);
                          if (doc.documentMime === "application/pdf") {
                            openPdfPreview(doc);
                          }
                        }}
                        style={{
                          padding: "1rem",
                          borderBottom: "1px solid #eee",
                          cursor: "pointer",
                          backgroundColor: selectedDocumentId === doc.id ? "#e3f2fd" : "white",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = selectedDocumentId === doc.id ? "#e3f2fd" : "#f5f5f5"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedDocumentId === doc.id ? "#e3f2fd" : "white"}
                      >
                        <strong style={{ display: "block", marginBottom: "0.25rem" }}>{doc.documentName}</strong>
                        <small style={{ display: "block", color: "#666", marginBottom: "0.25rem" }}>
                          {documentTypes.find(t => t.value === doc.documentType)?.label || doc.documentType}
                        </small>
                        <small style={{ display: "block", color: "#999" }}>
                          {doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString('it-IT') : "-"}
                        </small>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <a 
                            href={`/api/forniture/attachment?id=${doc.id}&type=document`}
                            className="ghost"
                            style={{ fontSize: "0.875rem" }}
                            title="Scarica"
                            onClick={(e) => e.stopPropagation()}
                          >
                            📥
                          </a>
                          <button 
                            className="danger" 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDocument(doc.id);
                            }}
                            style={{ fontSize: "0.875rem", padding: "0.25rem 0.5rem" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Colonna destra: Preview */}
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden", minHeight: "70vh" }}>
                {/* Preview PDF */}
                {pdfPreview.url ? (
                  <div style={{ padding: "1rem", backgroundColor: "#f9f9f9", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "70vh" }}>
                    <h3 style={{ margin: "0 0 1rem 0" }}>Preview: {pdfPreview.title}</h3>
                    <div style={{ flex: 1, overflow: "auto", borderRadius: "4px", border: "1px solid #ccc", minHeight: 0 }}>
                      <iframe 
                        src={pdfPreview.url} 
                        width="100%" 
                        height="100%" 
                        style={{ border: "none", display: "block", width: "100%", height: "100%", minHeight: "55vh" }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "1rem", color: "#999" }}>
                    Seleziona un documento per visualizzare l'anteprima
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Modal Upload */}
      {uploadModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={() => closeUploadModal()}>
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "2rem", width: "90%", maxWidth: "500px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 1.5rem 0" }}>Carica nuovo documento</h2>
            <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: "500" }}>Nome documento</span>
                <input
                  type="text"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="Es: Contratto luce 2024"
                  required
                  style={{ padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontSize: "1rem" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: "500" }}>Tipo documento</span>
                <select 
                  value={documentType} 
                  onChange={(e) => setDocumentType(e.target.value)}
                  style={{ padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontSize: "1rem" }}
                >
                  {documentTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontWeight: "500" }}>File</span>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                  style={{ padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px" }}
                />
              </label>

              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button type="button" className="ghost" onClick={() => closeUploadModal()} style={{ padding: "0.75rem 1.5rem" }}>Annulla</button>
                <button type="submit" disabled={!uploadFile} style={{ padding: "0.75rem 1.5rem", backgroundColor: uploadFile ? "#1976d2" : "#ccc", color: "white", border: "none", borderRadius: "4px", cursor: uploadFile ? "pointer" : "not-allowed", fontSize: "1rem" }}>
                  Carica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
