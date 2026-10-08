"use client";

import { useEffect, useState } from "react";
import SuppliesSidebar from "../SuppliesSidebar";

const utilityTypes = ["GAS", "ACQUA", "LUCE", "RIFIUTI"];
const parserFieldOrder = ["issueDate", "dueDate", "amount", "consumption", "period"];
const parserFieldLabels = {
  invoiceNumber: "N. fattura",
  issueDate: "Data emissione",
  dueDate: "Data scadenza",
  amount: "Importo",
  consumption: "Consumo",
  period: "Periodo",
  supplierName: "Fornitore",
  customerName: "Cliente",
};
const parserFieldShortLabels = {
  invoiceNumber: "N",
  issueDate: "DE",
  dueDate: "DS",
  amount: "€",
  consumption: "C",
  period: "P",
  supplierName: "F",
  customerName: "C",
};
const emptyForm = { id: "", name: "", utilityType: "GAS", contact: "", logo: "", active: true };
const emptyCreateForm = { name: "", utilityType: "GAS", contact: "", logo: "" };
const emptyParserFieldMap = () => ({
  invoiceNumber: "",
  issueDate: "",
  dueDate: "",
  amount: "",
  consumption: "",
  period: "",
  supplierName: "",
  customerName: ""
});
const emptyParserForm = () => ({
  id: "",
  providerId: "",
  providerName: "",
  name: "",
  aliases: "",
  parserType: "regex",
  active: true,
  sampleText: "",
  fields: emptyParserFieldMap(),
  expected: emptyParserFieldMap(),
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function resizeLogoDataUrl(file, maxSize) {
  const source = await fileToDataUrl(file);
  if (file.type === "image/svg+xml") return source;

  const image = await loadImage(source);
  const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas non disponibile per ridimensionare il logo");
  context.drawImage(image, 0, 0, width, height);

  const outputType = file.type === "image/webp" ? "image/webp" : "image/png";
  return canvas.toDataURL(outputType, 0.92);
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

function utilityFlag(type) {
  if (type === "ACQUA") return { icon: "💧", label: "Acqua", tone: "water" };
  if (type === "GAS") return { icon: "🔥", label: "Gas", tone: "gas" };
  if (type === "LUCE") return { icon: "💡", label: "Luce", tone: "light" };
  if (type === "RIFIUTI") return { icon: "🗑️", label: "Rifiuti", tone: "waste" };
  return { icon: "•", label: type || "Altro", tone: "default" };
}

function parseCurrencyValue(raw) {
  if (raw == null || raw === "") return null;
  const cleaned = String(raw).trim().replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const candidate = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(",", ".");
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(raw) {
  if (raw == null || raw === "") return "";
  const text = String(raw).trim();
  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!match) return "";
  const [, first, second, third] = match;
  const day = Number(first);
  const month = Number(second);
  const year = Number(third);
  const normalizedYear = year < 100 ? (year >= 50 ? 1900 + year : 2000 + year) : year;
  if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
    return `${normalizedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

function testParserSample(sampleText, fields) {
  const safeSample = String(sampleText || "");
  const result = {};
  for (const [fieldKey, pattern] of Object.entries(fields || {})) {
    if (!pattern || !String(pattern).trim()) continue;
    try {
      const value = safeSample.match(new RegExp(String(pattern).trim(), "i"));
      if (!value) continue;
      const extracted = (value[1] || value[0] || "").trim();
      if (!extracted) continue;
      if (fieldKey === "amount") {
        result[fieldKey] = parseCurrencyValue(extracted);
      } else if (fieldKey === "issueDate" || fieldKey === "dueDate") {
        result[fieldKey] = parseDateValue(extracted);
      } else {
        result[fieldKey] = extracted.replace(/\s+/g, " ").trim();
      }
    } catch {
      // Ignore invalid regex while previewing; the user can fix it interactively.
    }
  }
  return result;
}

export default function FornitoriPage() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [createLogoSize, setCreateLogoSize] = useState(320);
  const [editLogoSize, setEditLogoSize] = useState(320);
  const [parserModalOpen, setParserModalOpen] = useState(false);
  const [parserForm, setParserForm] = useState(emptyParserForm());
  const [parserPdfFile, setParserPdfFile] = useState(null);
  const [parserPreview, setParserPreview] = useState({});

  async function chooseLogo(file, setter, size) {
    if (!file) return;
    if (file.size > 1_500_000) return setMessage("Il logo deve essere più piccolo di 1,5 MB");
    try {
      const resized = await resizeLogoDataUrl(file, Number(size) || 320);
      setter((prev) => ({ ...prev, logo: resized }));
      setMessage(file.type === "image/svg+xml" ? "Logo SVG caricato senza ridimensionamento" : "Logo ridimensionato con successo");
    } catch {
      setMessage("Impossibile ridimensionare il logo selezionato");
    }
  }

  async function loadProviders() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
      setProviders(data.providers || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProviders();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditing(false);
  }

  function startEdit(provider) {
    setEditing(true);
    setForm({
      id: provider.id,
      name: provider.name || "",
      utilityType: provider.utilityType || "GAS",
      contact: provider.contact || "",
      logo: provider.logo || "",
      active: Boolean(provider.active)
    });
  }

  async function createProvider(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "provider", ...createForm })
        })
      );
      setMessage("Fornitore creato");
      setCreateForm(emptyCreateForm);
      setCreateModalOpen(false);
      await loadProviders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveProvider(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "provider", ...form })
        })
      );
      setMessage("Fornitore aggiornato");
      resetForm();
      await loadProviders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteProvider(id) {
    if (!window.confirm("Eliminare questo fornitore?")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=provider&id=${id}`, { method: "DELETE", credentials: 'include' }));
      setMessage("Fornitore eliminato");
      if (form.id === id) resetForm();
      await loadProviders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function getParserTagFieldList() {
    const fieldNames = new Set([...parserFieldOrder, ...Object.keys(parserForm.fields || {})]);
    return [...fieldNames];
  }

  function openParserEditor(provider, parser = null) {
    const parserConfig = parser?.config && typeof parser.config === "object" ? parser.config : {};
    const fieldMap = parserConfig.fields || {};
    const expected = parserConfig.expected && typeof parserConfig.expected === "object" ? parserConfig.expected : {};
    setParserForm({
      id: parser?.id || "",
      providerId: provider.id,
      providerName: provider.name,
      name: parser?.name || `${provider.name} parser`,
      aliases: Array.isArray(parser?.aliases) ? parser.aliases.join(", ") : (Array.isArray(parserConfig.aliases) ? parserConfig.aliases.join(", ") : ""),
      parserType: parser?.parserType || "regex",
      active: parser ? Boolean(parser.active) : true,
      sampleText: parserConfig.sampleText || "",
      fields: {
        invoiceNumber: fieldMap.invoiceNumber?.pattern || fieldMap.invoiceNumber || "",
        issueDate: fieldMap.issueDate?.pattern || fieldMap.issueDate || "",
        dueDate: fieldMap.dueDate?.pattern || fieldMap.dueDate || "",
        amount: fieldMap.amount?.pattern || fieldMap.amount || "",
        consumption: fieldMap.consumption?.pattern || fieldMap.consumption || "",
        period: fieldMap.period?.pattern || fieldMap.period || "",
        supplierName: fieldMap.supplierName?.pattern || fieldMap.supplierName || "",
        customerName: fieldMap.customerName?.pattern || fieldMap.customerName || ""
      },
      expected: {
        invoiceNumber: expected.invoiceNumber || "",
        issueDate: expected.issueDate || "",
        dueDate: expected.dueDate || "",
        amount: expected.amount || "",
        consumption: expected.consumption || "",
        period: expected.period || "",
        supplierName: expected.supplierName || "",
        customerName: expected.customerName || ""
      }
    });
    setParserPdfFile(null);
    setParserPreview({});
    setParserModalOpen(true);
  }

  function updateParserField(fieldName, value) {
    setParserForm((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        [fieldName]: value
      }
    }));
  }

  async function uploadParserSamplePdf(file) {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("providerName", parserForm.providerName || "");

      const payload = await readJson(await fetch("/api/invoices/parse", {
        method: "POST",
        credentials: "include",
        body: formData
      }));

      const sampleText = payload?.rawTextPreview || payload?.fields?.rawTextPreview || "";
      if (sampleText) {
        setParserForm((prev) => ({ ...prev, sampleText }));
      }
      setParserPreview(payload?.fields || {});
      setMessage(`PDF campione caricato: ${Math.round((Number(payload?.confidence) || 0) * 100)}% di confidenza.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function extractParserSampleText() {
    if (!parserPdfFile) {
      setMessage("Seleziona prima un PDF campione da estrarre.");
      return;
    }

    await uploadParserSamplePdf(parserPdfFile);
  }

  function resetParserSample() {
    setParserPdfFile(null);
    setParserForm((prev) => ({ ...prev, sampleText: "" }));
    setParserPreview({});
    setMessage("PDF e testo di esempio resettati.");
  }

  function previewParserSample() {
    const preview = testParserSample(parserForm.sampleText, parserForm.fields);
    setParserPreview(preview);
    if (Object.keys(preview).length === 0) {
      setMessage("Nessun campo soddisfa il testo di esempio. Verifica i pattern regex.");
      return;
    }
    setMessage("Render provvisorio aggiornato");
  }

  function compareParserFixture() {
    const preview = testParserSample(parserForm.sampleText, parserForm.fields);
    const mismatches = Object.entries(parserForm.expected || {}).reduce((acc, [fieldName, expectedValue]) => {
      if (!expectedValue || !String(expectedValue).trim()) return acc;
      const actual = preview[fieldName];
      const normalizedActual = actual == null ? "" : String(actual).trim();
      const normalizedExpected = String(expectedValue).trim();
      if (normalizedActual !== normalizedExpected) {
        acc.push({ fieldName, expected: normalizedExpected, actual: normalizedActual });
      }
      return acc;
    }, []);
    setParserPreview(preview);
    if (mismatches.length) {
      setMessage(`Fixture non allineata: ${mismatches.map((item) => `${item.fieldName} (atteso ${item.expected}, ottenuto ${item.actual || "vuoto"})`).join("; ")}`);
      return;
    }
    setMessage("Fixture del parser corretta rispetto ai valori attesi.");
  }

  async function saveProviderParser(event) {
    event.preventDefault();
    try {
      const config = {
        sampleText: parserForm.sampleText?.trim() || "",
        fields: Object.fromEntries(
          Object.entries(parserForm.fields || {})
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([fieldName, pattern]) => [fieldName, { pattern: pattern.trim() }])
        ),
        expected: Object.fromEntries(
          Object.entries(parserForm.expected || {})
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([fieldName, value]) => [fieldName, value.trim()])
        )
      };
      const aliases = parserForm.aliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        entity: "providerParser",
        providerId: parserForm.providerId,
        name: parserForm.name || `${parserForm.providerName || "Fornitore"} parser`,
        parserType: parserForm.parserType || "regex",
        aliases,
        config,
        active: parserForm.active,
        isDefault: false
      };
      if (parserForm.id) payload.id = parserForm.id;
      await readJson(await fetch("/api/forniture", {
        method: parserForm.id ? "PUT" : "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }));
      setMessage(parserForm.id ? "Parser aggiornato" : "Parser creato");
      setParserModalOpen(false);
      setParserPdfFile(null);
      setParserPreview({});
      setParserForm(emptyParserForm());
      await loadProviders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteProviderParser(providerId, parserId) {
    if (!window.confirm("Eliminare questo parser?")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=providerParser&id=${parserId}`, { method: "DELETE", credentials: 'include' }));
      setMessage("Parser eliminato");
      await loadProviders();
      if (parserModalOpen && parserForm.providerId === providerId) {
        setParserModalOpen(false);
        setParserForm(emptyParserForm());
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />

        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Gestione Fornitori</p>
            <h1>Fornitori</h1>
            <p>CRUD completo dei fornitori per GAS, ACQUA, LUCE e RIFIUTI.</p>
            <button className="ghost" onClick={() => setCreateModalOpen(true)}>Nuovo fornitore</button>
          </section>

          {message && <p className="inline-message">{message}</p>}

          {editing && (
            <section className="panel home-form-panel">
              <div className="crud-title"><h2>Modifica fornitore</h2></div>
              <form className="home-form" onSubmit={saveProvider}>
                <label>
                  Nome fornitore
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Tipo fornitura
                  <select
                    value={form.utilityType}
                    onChange={(event) => setForm((prev) => ({ ...prev, utilityType: event.target.value }))}
                  >
                    {utilityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Contatto
                  <input
                    value={form.contact}
                    onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
                  />
                </label>
                <label>
                  Logo
                  <div className="logo-size-row">
                    <span>Dimensione max lato (px)</span>
                    <select value={editLogoSize} onChange={(event) => setEditLogoSize(Number(event.target.value))}>
                      <option value={96}>96</option>
                      <option value={128}>128</option>
                      <option value={192}>192</option>
                      <option value={256}>256</option>
                      <option value={320}>320</option>
                      <option value={512}>512</option>
                    </select>
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(event) => chooseLogo(event.target.files?.[0], setForm, editLogoSize)}
                  />
                  {form.logo && <img className="provider-form-logo" src={form.logo} alt="Logo fornitore" />}
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  />
                  Fornitore attivo
                </label>
                <div className="home-form-actions">
                  <button type="submit">Salva modifiche</button>
                  <button type="button" className="ghost" onClick={resetForm}>Annulla</button>
                </div>
              </form>
            </section>
          )}

          <section className="panel">
            <h2>Elenco fornitori</h2>
            {loading && <p className="muted">Caricamento...</p>}
            {!loading && !providers.length && <p className="muted">Nessun fornitore configurato.</p>}
            {!loading && providers.map((provider) => (
              <article className="line-item home-line-item" key={provider.id}>
                <div className="provider-item-main">
                  {provider.logo ? <img className="provider-logo" src={provider.logo} alt="" /> : <span className="provider-logo-fallback">{(provider.name || "F")[0].toUpperCase()}</span>}
                  <div>
                  <strong>{provider.name}</strong>
                  <small className={`utility-badge ${utilityFlag(provider.utilityType).tone}`}>
                    <span className="utility-icon" aria-hidden="true">{utilityFlag(provider.utilityType).icon}</span>
                    {utilityFlag(provider.utilityType).label}
                  </small>
                  <small>{provider.contact || "Nessun contatto"}</small>
                  </div>
                </div>
                <div className="home-row-actions">
                  <button className="ghost" onClick={() => startEdit(provider)}>Modifica</button>
                  <button className="ghost" onClick={() => openParserEditor(provider)}>Parser</button>
                  <button className="danger" onClick={() => deleteProvider(provider.id)}>Elimina</button>
                </div>
                {(provider.parsers || []).length > 0 && (
                  <div className="provider-parser-list">
                    {(provider.parsers || []).map((parser) => (
                      <span className="provider-parser-chip" key={parser.id}>
                        <button type="button" className="chip-button" onClick={() => openParserEditor(provider, parser)}>{parser.name}</button>
                        <button type="button" className="chip-delete" onClick={() => deleteProviderParser(provider.id, parser.id)} aria-label={`Elimina ${parser.name}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>

          {parserModalOpen && (
            <div className="modal-backdrop" onClick={() => setParserModalOpen(false)}>
              <section className="modal-card parser-modal" onClick={(event) => event.stopPropagation()}>
                <h2>Parser personalizzato · {parserForm.providerName || "Fornitore"}</h2>
                <form className="home-form parser-editor-form" onSubmit={saveProviderParser}>
                  <div className="parser-form-header-grid">
                    <label>
                      Nome parser
                      <input
                        value={parserForm.name}
                        onChange={(event) => setParserForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Alias / nomi alternativi
                      <input
                        value={parserForm.aliases}
                        placeholder="es. enel, enel energia"
                        onChange={(event) => setParserForm((prev) => ({ ...prev, aliases: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="parser-layout">
                    <div className="parser-main-column">
                      <div className="parser-section">
                        <div className="parser-section-header">
                          <strong>Testo di esempio fattura</strong>
                        </div>
                        <div className="parser-sample-upload-row">
                          <label className="parser-sample-upload-label">
                            PDF campione
                            <input
                              type="file"
                              accept="application/pdf"
                              onChange={(event) => {
                                const file = event.target.files?.[0] || null;
                                setParserPdfFile(file);
                              }}
                            />
                          </label>
                          <div className="parser-sample-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={extractParserSampleText}
                              disabled={!parserPdfFile}
                            >
                              Estrai testo PDF
                            </button>
                            <button
                              type="button"
                              className="ghost parser-clear-sample"
                              onClick={resetParserSample}
                            >
                              Cancella PDF / testo estratto
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="parser-sample-textarea"
                          rows={14}
                          value={parserForm.sampleText}
                          onChange={(event) => setParserForm((prev) => ({ ...prev, sampleText: event.target.value }))}
                          placeholder="Incolla qui il testo di esempio della fattura o usa il PDF campione per estrarlo automaticamente..."
                        />
                      </div>
                    </div>

                    <div className="parser-side-column">
                      <div className="parser-section">
                        <div className="parser-section-header">
                          <strong>Regex per campi</strong>
                        </div>
                        <div className="parser-helper-box">
                          <small>Definisci i pattern per recuperare i dati dal testo della fattura. Puoi usare il testo estratto dal PDF per testare i regex in modo più rapido.</small>
                        </div>
                        <div className="parser-field-grid">
                          {getParserTagFieldList().map((fieldName) => (
                            <label key={fieldName}>
                              {parserFieldLabels[fieldName] || fieldName}
                              <input
                                value={parserForm.fields?.[fieldName] || ""}
                                onChange={(event) => updateParserField(fieldName, event.target.value)}
                                placeholder="Regex di esempio: /fattura\s*n\.?\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="parser-section">
                        <div className="parser-section-header">
                          <strong>Valori attesi</strong>
                        </div>
                        <div className="parser-field-grid">
                          {getParserTagFieldList().map((fieldName) => (
                            <label key={`expected-${fieldName}`}>
                              {`Valore atteso - ${parserFieldLabels[fieldName] || fieldName}`}
                              <input
                                value={parserForm.expected?.[fieldName] || ""}
                                onChange={(event) => setParserForm((prev) => ({ ...prev, expected: { ...prev.expected, [fieldName]: event.target.value } }))}
                                placeholder="Valore atteso da confrontare con il sample"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="parser-footer-row">
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={parserForm.active}
                        onChange={(event) => setParserForm((prev) => ({ ...prev, active: event.target.checked }))}
                      />
                      Parser attivo
                    </label>
                    <div className="home-form-actions">
                      <button type="button" className="ghost" onClick={previewParserSample}>Render provvisorio</button>
                      <button type="button" className="ghost" onClick={compareParserFixture}>Confronta fixture</button>
                      <button type="submit">Salva parser</button>
                      <button type="button" className="ghost" onClick={() => setParserModalOpen(false)}>Chiudi</button>
                    </div>
                  </div>

                  {Object.keys(parserPreview).length > 0 && (
                    <div className="parser-preview-box">
                      <strong>Anteprima estrazione</strong>
                      <pre>{JSON.stringify(parserPreview, null, 2)}</pre>
                    </div>
                  )}
                </form>
              </section>
            </div>
          )}

          {createModalOpen && (
            <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Nuovo fornitore</h2>
                <form className="home-form" onSubmit={createProvider}>
                  <label>
                    Nome fornitore
                    <input
                      value={createForm.name}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Tipo fornitura
                    <select
                      value={createForm.utilityType}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, utilityType: event.target.value }))}
                    >
                      {utilityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Contatto
                    <input
                      value={createForm.contact}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, contact: event.target.value }))}
                    />
                  </label>
                  <label>
                    Logo
                    <div className="logo-size-row">
                      <span>Dimensione max lato (px)</span>
                      <select value={createLogoSize} onChange={(event) => setCreateLogoSize(Number(event.target.value))}>
                        <option value={96}>96</option>
                        <option value={128}>128</option>
                        <option value={192}>192</option>
                        <option value={256}>256</option>
                        <option value={320}>320</option>
                        <option value={512}>512</option>
                      </select>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => chooseLogo(event.target.files?.[0], setCreateForm, createLogoSize)}
                    />
                    {createForm.logo && <img className="provider-form-logo" src={createForm.logo} alt="Logo fornitore" />}
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Crea fornitore</button>
                    <button type="button" className="ghost" onClick={() => setCreateModalOpen(false)}>Chiudi</button>
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
