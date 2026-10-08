"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SuppliesSidebar from "../../../SuppliesSidebar";

const supplyTypes = ["GAS", "ACQUA", "LUCE", "RIFIUTI"];

function emptyForm(homeId) {
  return {
    id: "",
    homeId,
    providerId: "",
    supplyType: "GAS",
    offerName: "",
    offerExpiry: "",
    paymentMethod: "",
    billDeliveryMethod: "",
    associatedEmail: "",
    associatedPower: "",
    contractType: "",
    billingAddress: "",
    tariff: "",
    contractCode: "",
    podPdr: "",
    active: true
  };
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

export default function HomeSuppliesPage() {
  const params = useParams();
  const homeId = String(params.id || "");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [home, setHome] = useState(null);
  const [providers, setProviders] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(emptyForm(homeId));
  const [editing, setEditing] = useState(false);
  const [expandedSupplyId, setExpandedSupplyId] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm(homeId));

  const providersByType = useMemo(() => {
    const map = new Map();
    for (const provider of providers) {
      const list = map.get(provider.utilityType) || [];
      list.push(provider);
      map.set(provider.utilityType, list);
    }
    return map;
  }, [providers]);

  const invoiceTotalsBySupply = useMemo(() => {
    const map = new Map();
    for (const invoice of invoices) {
      const current = map.get(invoice.supplyId) || 0;
      map.set(invoice.supplyId, current + Number(invoice.amount || 0));
    }
    return map;
  }, [invoices]);

  const invoiceCountBySupply = useMemo(() => {
    const map = new Map();
    for (const invoice of invoices) {
      const current = map.get(invoice.supplyId) || 0;
      map.set(invoice.supplyId, current + 1);
    }
    return map;
  }, [invoices]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
      const selectedHome = (data.homes || []).find((item) => item.id === homeId) || null;
      const homeSupplies = (data.supplies || []).filter((item) => item.homeId === homeId);
      const homeSupplyIds = new Set(homeSupplies.map((item) => item.id));
      setHome(selectedHome);
      setProviders(data.providers || []);
      setSupplies(homeSupplies);
      setInvoices((data.invoices || []).filter((item) => homeSupplyIds.has(item.supplyId)));
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm(emptyForm(homeId));
    setCreateForm(emptyForm(homeId));
    if (homeId) loadData();
  }, [homeId]);

  function resetEdit() {
    setEditing(false);
    setForm(emptyForm(homeId));
  }

  function startEdit(supply) {
    setEditing(true);
    setExpandedSupplyId("");
    setForm({
      id: supply.id,
      homeId,
      providerId: supply.providerId,
      supplyType: supply.supplyType || "GAS",
      offerName: supply.offerName || "",
      offerExpiry: supply.offerExpiry ? String(supply.offerExpiry).slice(0, 10) : "",
      paymentMethod: supply.paymentMethod || "",
      billDeliveryMethod: supply.billDeliveryMethod || "",
      associatedEmail: supply.associatedEmail || "",
      associatedPower: supply.associatedPower || "",
      contractType: supply.contractType || "",
      billingAddress: supply.billingAddress || "",
      tariff: supply.tariff || "",
      contractCode: supply.contractCode || "",
      podPdr: supply.podPdr || "",
      active: Boolean(supply.active)
    });
  }

  async function createSupply(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "supply", ...createForm })
        })
      );
      setCreateModalOpen(false);
      setCreateForm(emptyForm(homeId));
      setMessage("Fornitura creata");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveSupply(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "supply", ...form })
        })
      );
      resetEdit();
      setMessage("Fornitura aggiornata");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteSupply(id) {
    if (!window.confirm("Eliminare questa fornitura?")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=supply&id=${id}`, { method: "DELETE", credentials: 'include' }));
      if (form.id === id) resetEdit();
      setMessage("Fornitura eliminata");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function availableProviders(currentType) {
    return providersByType.get(currentType) || [];
  }

  function display(value) {
    return value ? String(value) : "-";
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />
        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Forniture Casa</p>
            <h1>{home ? home.name : "Casa"}</h1>
            <p>Tabella e CRUD delle forniture associate alla casa selezionata.</p>
            <button className="ghost" onClick={() => setCreateModalOpen(true)} disabled={!home}>Nuova fornitura</button>
          </section>

          {message && <p className="inline-message">{message}</p>}

          <section className="panel">
            <h2>Elenco forniture</h2>
            {loading && <p className="muted">Caricamento...</p>}
            {!loading && !supplies.length && <p className="muted">Nessuna fornitura associata a questa casa.</p>}
            {!loading && !!supplies.length && (
              <div className="supplies-table-wrap">
                <table className="supplies-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Fornitore</th>
                      <th>Totale fatture</th>
                      <th>Numero fatture</th>
                      <th>Tariffa</th>
                      <th>Stato</th>
                      <th>Dettagli</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplies.map((supply) => (
                      <Fragment key={supply.id}>
                        <tr>
                          <td>{supply.supplyType}</td>
                          <td>{supply.providerName}</td>
                          <td>
                            <span className={"supply-total-amount " + ((invoiceTotalsBySupply.get(supply.id) || 0) > 0 ? "has-value" : "")}>{Number(invoiceTotalsBySupply.get(supply.id) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                          </td>
                          <td>{invoiceCountBySupply.get(supply.id) || 0}</td>
                          <td>{display(supply.tariff)}</td>
                          <td>{supply.active ? "Attiva" : "Disattiva"}</td>
                          <td>
                            <button type="button" className="ghost compact-action" onClick={() => setExpandedSupplyId((prev) => prev === supply.id ? "" : supply.id)}>{expandedSupplyId === supply.id ? "Nascondi" : "Mostra"}</button>
                          </td>
                          <td>
                            <div className="home-row-actions">
                              <a className="ghost table-link-button" href={`/case/${homeId}/forniture/${supply.id}/documenti`}>Documenti</a>
                              <a className="ghost table-link-button" href={`/case/${homeId}/forniture/${supply.id}/fatture`}>Fatture</a>
                              <a className="ghost table-link-button" href={`/case/${homeId}/forniture/${supply.id}/consumi`}>Consumi</a>
                              <button className="ghost" onClick={() => startEdit(supply)}>Modifica</button>
                              <button className="danger" onClick={() => deleteSupply(supply.id)}>Elimina</button>
                            </div>
                          </td>
                        </tr>
                        {expandedSupplyId === supply.id && (
                          <tr className="supply-detail-row">
                            <td colSpan={8}>
                              <div className="supply-detail-grid">
                                <div><small>Nome offerta</small><strong>{display(supply.offerName)}</strong></div>
                                <div><small>Scadenza offerta</small><strong>{supply.offerExpiry ? String(supply.offerExpiry).slice(0, 10) : "-"}</strong></div>
                                <div><small>Modalita pagamento</small><strong>{display(supply.paymentMethod)}</strong></div>
                                <div><small>Invio bolletta</small><strong>{display(supply.billDeliveryMethod)}</strong></div>
                                <div><small>Email associata</small><strong>{display(supply.associatedEmail)}</strong></div>
                                <div><small>Potenza associata</small><strong>{display(supply.associatedPower)}</strong></div>
                                <div><small>Tipo contratto</small><strong>{display(supply.contractType)}</strong></div>
                                <div><small>Indirizzo fatturazione</small><strong>{display(supply.billingAddress)}</strong></div>
                                <div><small>Codice contratto</small><strong>{display(supply.contractCode)}</strong></div>
                                <div><small>POD/PDR</small><strong>{display(supply.podPdr)}</strong></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {editing && (
            <div className="modal-backdrop" onClick={resetEdit}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Modifica fornitura</h2>
                <form className="home-form" onSubmit={saveSupply}>
                  <label>
                    Tipo fornitura
                    <select
                      value={form.supplyType}
                      onChange={(event) => {
                        const supplyType = event.target.value;
                        setForm((prev) => ({ ...prev, supplyType, providerId: "", associatedPower: "" }));
                      }}
                    >
                      {supplyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    Fornitore
                    <select
                      value={form.providerId}
                      onChange={(event) => setForm((prev) => ({ ...prev, providerId: event.target.value }))}
                      required
                    >
                      <option value="">Seleziona fornitore</option>
                      {availableProviders(form.supplyType).map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nome offerta
                    <input
                      value={form.offerName}
                      onChange={(event) => setForm((prev) => ({ ...prev, offerName: event.target.value }))}
                    />
                  </label>
                  <label>
                    Scadenza offerta
                    <input
                      type="date"
                      value={form.offerExpiry}
                      onChange={(event) => setForm((prev) => ({ ...prev, offerExpiry: event.target.value }))}
                    />
                  </label>
                  <label>
                    Modalita di pagamento
                    <input
                      value={form.paymentMethod}
                      onChange={(event) => setForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                    />
                  </label>
                  <label>
                    Modalita di invio bolletta
                    <input
                      value={form.billDeliveryMethod}
                      onChange={(event) => setForm((prev) => ({ ...prev, billDeliveryMethod: event.target.value }))}
                    />
                  </label>
                  <label>
                    Email associata
                    <input
                      type="email"
                      value={form.associatedEmail}
                      onChange={(event) => setForm((prev) => ({ ...prev, associatedEmail: event.target.value }))}
                    />
                  </label>
                  {form.supplyType === "LUCE" && (
                    <label>
                      Potenza associata
                      <input
                        value={form.associatedPower}
                        onChange={(event) => setForm((prev) => ({ ...prev, associatedPower: event.target.value }))}
                      />
                    </label>
                  )}
                  <label>
                    Tipo contratto
                    <input
                      value={form.contractType}
                      onChange={(event) => setForm((prev) => ({ ...prev, contractType: event.target.value }))}
                    />
                  </label>
                  <label>
                    Indirizzi di fatturazione
                    <input
                      value={form.billingAddress}
                      onChange={(event) => setForm((prev) => ({ ...prev, billingAddress: event.target.value }))}
                    />
                  </label>
                  <label>
                    Tariffa
                    <input
                      value={form.tariff}
                      onChange={(event) => setForm((prev) => ({ ...prev, tariff: event.target.value }))}
                    />
                  </label>
                  <label>
                    Codice contratto
                    <input
                      value={form.contractCode}
                      onChange={(event) => setForm((prev) => ({ ...prev, contractCode: event.target.value }))}
                    />
                  </label>
                  <label>
                    POD/PDR
                    <input
                      value={form.podPdr}
                      onChange={(event) => setForm((prev) => ({ ...prev, podPdr: event.target.value }))}
                    />
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                    />
                    Fornitura attiva
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Salva modifiche</button>
                    <button type="button" className="ghost" onClick={resetEdit}>Annulla</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {createModalOpen && (
            <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Nuova fornitura</h2>
                <form className="home-form" onSubmit={createSupply}>
                  <label>
                    Tipo fornitura
                    <select
                      value={createForm.supplyType}
                      onChange={(event) => {
                        const supplyType = event.target.value;
                        setCreateForm((prev) => ({ ...prev, supplyType, providerId: "", associatedPower: "" }));
                      }}
                    >
                      {supplyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    Fornitore
                    <select
                      value={createForm.providerId}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, providerId: event.target.value }))}
                      required
                    >
                      <option value="">Seleziona fornitore</option>
                      {availableProviders(createForm.supplyType).map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nome offerta
                    <input
                      value={createForm.offerName}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, offerName: event.target.value }))}
                    />
                  </label>
                  <label>
                    Scadenza offerta
                    <input
                      type="date"
                      value={createForm.offerExpiry}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, offerExpiry: event.target.value }))}
                    />
                  </label>
                  <label>
                    Modalita di pagamento
                    <input
                      value={createForm.paymentMethod}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                    />
                  </label>
                  <label>
                    Modalita di invio bolletta
                    <input
                      value={createForm.billDeliveryMethod}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, billDeliveryMethod: event.target.value }))}
                    />
                  </label>
                  <label>
                    Email associata
                    <input
                      type="email"
                      value={createForm.associatedEmail}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, associatedEmail: event.target.value }))}
                    />
                  </label>
                  {createForm.supplyType === "LUCE" && (
                    <label>
                      Potenza associata
                      <input
                        value={createForm.associatedPower}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, associatedPower: event.target.value }))}
                      />
                    </label>
                  )}
                  <label>
                    Tipo contratto
                    <input
                      value={createForm.contractType}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, contractType: event.target.value }))}
                    />
                  </label>
                  <label>
                    Indirizzi di fatturazione
                    <input
                      value={createForm.billingAddress}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, billingAddress: event.target.value }))}
                    />
                  </label>
                  <label>
                    Tariffa
                    <input
                      value={createForm.tariff}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, tariff: event.target.value }))}
                    />
                  </label>
                  <label>
                    Codice contratto
                    <input
                      value={createForm.contractCode}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, contractCode: event.target.value }))}
                    />
                  </label>
                  <label>
                    POD/PDR
                    <input
                      value={createForm.podPdr}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, podPdr: event.target.value }))}
                    />
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Crea fornitura</button>
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
