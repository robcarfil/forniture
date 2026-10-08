"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SuppliesSidebar from "../../../../../SuppliesSidebar";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

function normalizeHourSlot(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{1,2}$/.test(raw)) {
    const hour = Number(raw);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return String(hour).padStart(2, "0");
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const hour = Number(raw.split(":")[0]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return String(hour).padStart(2, "0");
  }
  return raw.slice(0, 40);
}

// Server-side parser will normalize dates; keep a minimal client-side fallback not to rely on XLSX
function parseIsoFromUnknownDate(value) {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const str = String(value || "").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const normalized = str.replace(/[.]/g, "/");
  const parts = normalized.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d && m && y) return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function parseImportedNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SupplyConsumptionsPage() {
  const params = useParams();
  const router = useRouter();
  const homeId = String(params.id || "");
  const supplyId = String(params.supplyId || "");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [supplyConsumptions, setSupplyConsumptions] = useState([]);
  const [supplyConsumptionsPage, setSupplyConsumptionsPage] = useState({ rows: [], total: 0, page: 1, perPage: 50 });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // { id?, readingDate, consumption, slot, notes }

  async function loadConsumptions(options = { paged: false, page: 1, perPage: 50 }) {
    try {
      if (options.paged) {
        const url = `/api/forniture?entity=supplyConsumption&supplyId=${encodeURIComponent(supplyId)}&page=${options.page}&perPage=${options.perPage}`;
        const data = await readJson(await fetch(url, { credentials: 'include' }));
        setSupplyConsumptionsPage({ rows: data.rows || [], total: Number(data.total || 0), page: Number(data.page || options.page), perPage: Number(data.perPage || options.perPage) });
      } else {
        const data = await readJson(await fetch('/api/forniture', { credentials: 'include' }));
        const rows = (data.supplyConsumptions || []).filter((r) => String(r.supplyId || '') === String(supplyId));
        setSupplyConsumptions(rows);
      }
    } catch (err) {
      // ignore - reporting will be empty
    }
  }

  useEffect(() => {
    // initial full load for reporting
    loadConsumptions({ paged: false });
  }, [supplyId]);

  async function handleFileChange(f) {
    setFile(f);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("baseDate", "");
      form.append("supplyId", supplyId);
      const res = await fetch('/api/forniture/parse', { method: 'POST', body: form, credentials: 'include' });
      const payload = await readJson(res);
      if (!payload.rows || !payload.rows.length) {
        setPreviewRows([]);
        setMessage('Nessuna riga valida trovata nel file (server)');
        return;
      }
      setPreviewRows(payload.rows || []);
      setMessage(`Anteprima pronta: ${payload.rows.length} righe parsate (server)`);
    } catch (err) {
      setPreviewRows([]);
      setMessage(String(err?.message || err) || 'Errore parsing file server');
    }
  }

  // CRUD helpers for manage modal
  function startAdd() {
    setEditingRow({ id: null, readingDate: '', consumption: '', slot: '', notes: '' });
  }
  function startEdit(row) {
    setEditingRow({ id: row.id, readingDate: String(row.readingDate || '').slice(0,10), consumption: String(row.consumption || ''), slot: String(row.slot || ''), notes: row.notes || '' });
  }
  function cancelEdit() {
    setEditingRow(null);
  }

  async function saveEdit() {
    if (!editingRow) return;
    const payload = {
      entity: 'supplyConsumption',
      readingDate: String(editingRow.readingDate || '').slice(0,10),
      consumption: editingRow.consumption,
      slot: editingRow.slot,
      notes: editingRow.notes
    };
    try {
      if (editingRow.id) {
        payload.id = editingRow.id;
        await readJson(await fetch('/api/forniture', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
      } else {
        // new
        payload.supplyId = supplyId;
        await readJson(await fetch('/api/forniture', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
      }
      setMessage('Salvataggio riuscito');
      setEditingRow(null);
      // refresh both full list (report) and paged list if open
      await loadConsumptions({ paged: false });
      if (manageModalOpen) await loadConsumptions({ paged: true, page: supplyConsumptionsPage.page, perPage: supplyConsumptionsPage.perPage });
    } catch (err) {
      setMessage(String(err?.message || err) || 'Errore salvataggio');
    }
  }

  async function deleteRow(id) {
    if (!confirm('Eliminare questa riga di consumo?')) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=supplyConsumption&id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }));
      setMessage('Riga eliminata');
      await loadConsumptions({ paged: false });
      if (manageModalOpen) await loadConsumptions({ paged: true, page: supplyConsumptionsPage.page, perPage: supplyConsumptionsPage.perPage });
    } catch (err) {
      setMessage(String(err?.message || err) || 'Errore eliminazione');
    }
  }


  // Reporting
  const [reportGranularity, setReportGranularity] = useState('day');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [reportRows, setReportRows] = useState([]);
  const [chartType, setChartType] = useState('line');
  const [comparePrevious, setComparePrevious] = useState(false);
  const [showPeakOverlay, setShowPeakOverlay] = useState(true);
  const [showAvgOverlay, setShowAvgOverlay] = useState(true);
  const [showHalfOverlay, setShowHalfOverlay] = useState(true);
  const [prevReportRows, setPrevReportRows] = useState([]);

  function toIso(d) {
    const dt = new Date(d + 'T00:00:00');
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function getWeekYearKey(iso) {
    const dt = new Date(iso + 'T00:00:00');
    // ISO week: get Thursday in current week to determine year
    const day = dt.getUTCDay() || 7; // 1..7
    const thursday = new Date(dt);
    thursday.setUTCDate(dt.getUTCDate() + (4 - day));
    const year = thursday.getUTCFullYear();
    // week number
    const firstJan = new Date(Date.UTC(year,0,1));
    const weekNo = Math.ceil((((thursday - firstJan) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2,'0')}`;
  }

  function aggregate(consumptions, granularity, startIso, endIso) {
    const buckets = new Map();
    const start = startIso ? new Date(startIso + 'T00:00:00') : null;
    const end = endIso ? new Date(endIso + 'T23:59:59') : null;
    for (const r of consumptions) {
      const iso = String(r.readingDate || '').slice(0,10);
      if (!iso) continue;
      const dt = new Date(iso + 'T00:00:00');
      if (start && dt < start) continue;
      if (end && dt > end) continue;
      let key = iso;
      if (granularity === 'week') key = getWeekYearKey(iso);
      if (granularity === 'month') key = iso.slice(0,7);
      if (granularity === 'year') key = iso.slice(0,4);
      if (granularity === 'range' || granularity === 'day') key = iso;
      const prev = buckets.get(key) || { key, total: 0, countDays: new Set() };
      prev.total += Number(r.consumption || 0);
      prev.countDays.add(iso);
      buckets.set(key, prev);
    }
    const rows = Array.from(buckets.values()).map((v) => ({ period: v.key, total: v.total, days: v.countDays.size }));
    rows.sort((a,b) => a.period < b.period ? -1 : a.period > b.period ? 1 : 0);
    return rows;
  }

  function runReport() {
    const startIso = toIso(reportStart);
    const endIso = toIso(reportEnd);
    const rows = aggregate(supplyConsumptions, reportGranularity, startIso, endIso);
    setReportRows(rows);
    // compute previous period rows when requested
    if (comparePrevious) {
      let prevStart = null;
      let prevEnd = null;
      if (startIso && endIso) {
        const s = new Date(startIso + 'T00:00:00');
        const e = new Date(endIso + 'T00:00:00');
        const span = Math.round((e - s) / 86400000) + 1;
        const prevE = new Date(s);
        prevE.setDate(s.getDate() - 1);
        const prevS = new Date(prevE);
        prevS.setDate(prevE.getDate() - (span - 1));
        prevStart = `${prevS.getFullYear()}-${String(prevS.getMonth() + 1).padStart(2,'0')}-${String(prevS.getDate()).padStart(2,'0')}`;
        prevEnd = `${prevE.getFullYear()}-${String(prevE.getMonth() + 1).padStart(2,'0')}-${String(prevE.getDate()).padStart(2,'0')}`;
      } else if (rows.length) {
        // derive previous range by taking same number of buckets before first period
        const first = rows[0].period;
        // assume period labels in ISO or week/month formats; try parse first as date
        const dt = new Date(first + 'T00:00:00');
        if (!Number.isNaN(dt.getTime())) {
          const span = rows.length;
          const prevE = new Date(dt);
          prevE.setDate(dt.getDate() - 1);
          const prevS = new Date(prevE);
          prevS.setDate(prevE.getDate() - (span - 1));
          prevStart = `${prevS.getFullYear()}-${String(prevS.getMonth() + 1).padStart(2,'0')}-${String(prevS.getDate()).padStart(2,'0')}`;
          prevEnd = `${prevE.getFullYear()}-${String(prevE.getMonth() + 1).padStart(2,'0')}-${String(prevE.getDate()).padStart(2,'0')}`;
        }
      }
      if (prevStart && prevEnd) {
        const prevRows = aggregate(supplyConsumptions, reportGranularity, prevStart, prevEnd);
        setPrevReportRows(prevRows);
      } else {
        setPrevReportRows([]);
      }
    } else {
      setPrevReportRows([]);
    }
  }

  const reportStats = useMemo(() => {
    if (!reportRows.length) return { total: 0, avgDaily: 0, peak: 0 };
    const total = reportRows.reduce((s, r) => s + Number(r.total || 0), 0);
    // count unique days covered
    const days = reportRows.reduce((s, r) => s + Number(r.days || 0), 0) || 1;
    const avgDaily = total / days;
    const peak = Math.max(...reportRows.map((r) => Math.abs(Number(r.total || 0))));
    return { total, avgDaily, peak };
  }, [reportRows]);

  function exportReportCsv() {
    if (!reportRows.length) return;
    const header = ['Periodo', 'Consumo totale', 'Giorni inclusi'];
    const lines = [header.join(',')];
    for (const r of reportRows) lines.push([r.period, String(r.total), String(r.days)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_consumi_${supplyId || 'supply'}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // preview generation is handled server-side; client does not perform local buildPreview

  async function confirmImport() {
    if (!previewRows.length) return setMessage("Nessuna riga da importare");
    try {
      const response = await readJson(await fetch('/api/forniture', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'supplyConsumption', supplyId, baseDate: '', rows: previewRows })
      }));
      setMessage(`Import completato: ${response.imported || 0} importati`);
      // clear preview and close modal, reload consumptions
      setPreviewRows([]);
      setUploadModalOpen(false);
      await loadConsumptions();
    } catch (e) {
      setMessage(e.message || 'Errore import');
    }
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />
        <div className="supplies-content">
          <section className="panel summary-header-panel">
            <p className="eyebrow">Gestione Consumi</p>
            <h1>Consumi Fornitura</h1>
            <p>Import guidato dei consumi per la fornitura selezionata.</p>
          </section>

          <section className="panel">
            <h2>Import guidato</h2>
            <p className="muted">Carica un file XLSX/CSV, mappa le colonne ai campi del DB e conferma l'import.</p>

            <p className="muted">I consumi verranno importati direttamente per la fornitura selezionata.</p>

            <div style={{ marginBottom: 12 }}>
              <button type="button" className="ghost" onClick={() => setUploadModalOpen(true)}>Carica dati</button>
              <button
                type="button"
                className="ghost"
                onClick={async () => {
                  setMessage('Apro gestione...');
                  setManageModalOpen(true);
                  try {
                    await loadConsumptions({ paged: true, page: 1, perPage: supplyConsumptionsPage.perPage });
                    setMessage('');
                  } catch (e) {
                    setMessage(String(e?.message || e) || 'Errore apertura gestione');
                  }
                }}
                style={{ marginLeft: 8 }}
              >Gestisci dati</button>
            </div>

            <p className="muted">La mappatura campi è gestita automaticamente; carica il file per vedere l'anteprima.</p>

            {/* preview moved into modal - import flow happens in modal */}

            <section style={{ marginTop: 20 }}>
              <h2>Report consumi</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>
                  Granularità
                  <select value={reportGranularity} onChange={(e) => setReportGranularity(e.target.value)}>
                    <option value="day">Giorno</option>
                    <option value="week">Settimana</option>
                    <option value="month">Mese</option>
                    <option value="year">Anno</option>
                    <option value="range">Intervallo (giorno→giorno)</option>
                  </select>
                </label>
                <label>
                  Data inizio
                  <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
                </label>
                <label>
                  Data fine
                  <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
                </label>
                <div className="home-form-actions">
                  <button type="button" className="ghost" onClick={runReport}>Genera report</button>
                  <button type="button" className="ghost" onClick={exportReportCsv}>Esporta CSV</button>
                </div>
              </div>

              {reportRows.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8, padding: 8, background: '#f0f0f0', borderRadius: 4, fontSize: '12px' }}>
                    Debug: {supplyConsumptions.length} consumi totali | Reporte: {reportRows.length} righe | Grafico: {chartType}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ padding: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                      <strong>Totale periodo</strong>
                      <div style={{ fontSize: 18 }}>{Number(reportStats.total).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</div>
                    </div>
                    <div style={{ padding: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                      <strong>Media giornaliera</strong>
                      <div style={{ fontSize: 18 }}>{Number(reportStats.avgDaily).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</div>
                    </div>
                    <div style={{ padding: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
                      <strong>Picco</strong>
                      <div style={{ fontSize: 18 }}>{Number(reportStats.peak).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <label style={{ marginRight: 8 }}>Grafico</label>
                      <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                        <option value="line">Linea</option>
                        <option value="bar">Istogramma</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <label><input type="checkbox" checked={comparePrevious} onChange={(e) => setComparePrevious(e.target.checked)} /> Confronta periodo precedente</label>
                    <label><input type="checkbox" checked={showPeakOverlay} onChange={(e) => setShowPeakOverlay(e.target.checked)} /> Mostra Picco</label>
                    <label><input type="checkbox" checked={showAvgOverlay} onChange={(e) => setShowAvgOverlay(e.target.checked)} /> Mostra Media</label>
                    <label><input type="checkbox" checked={showHalfOverlay} onChange={(e) => setShowHalfOverlay(e.target.checked)} /> Mostra 50%</label>
                  </div>

                  <div style={{ width: '100%', height: 340, marginBottom: 12, position: 'relative' }}>
                    {chartType === 'line' ? (
                      <Line
                        data={{
                          labels: reportRows.map(r => r.period),
                          datasets: [
                            { label: 'Consumo', data: reportRows.map(r => Number(r.total || 0)), borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.2)', borderWidth: 3, tension: 0.25, pointRadius: 0, spanGaps: true },
                            ...(comparePrevious && prevReportRows.length ? [{ label: 'Precedente', data: reportRows.map(rr => {
                              const found = prevReportRows.find(p => p.period === rr.period);
                              return found ? Number(found.total || 0) : 0;
                            }), borderColor: '#888', backgroundColor: 'rgba(136,136,136,0.2)', borderDash: [4,4], borderWidth: 2, tension: 0.25, pointRadius: 0, spanGaps: true }] : []),
                            ...(showAvgOverlay ? [{ label: 'Media', data: reportRows.map(() => reportStats.avgDaily), borderColor: '#ef6c00', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : []),
                            ...(showPeakOverlay ? [{ label: 'Picco', data: reportRows.map(() => reportStats.peak), borderColor: '#d32f2f', borderDash: [2,4], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : []),
                            ...(showHalfOverlay ? [{ label: '50%', data: reportRows.map(() => reportStats.peak * 0.5), borderColor: '#7b1fa2', borderDash: [3,3], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : [])
                          ]
                        }}
                        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { display: true }, y: { display: true } } }}
                      />
                    ) : (
                      <Bar
                        data={{
                          labels: reportRows.map(r => r.period),
                          datasets: [
                            { label: 'Consumo', data: reportRows.map(r => Number(r.total || 0)), backgroundColor: '#1976d2' },
                            ...(comparePrevious && prevReportRows.length ? [{ type: 'line', label: 'Precedente', data: reportRows.map(rr => {
                              const found = prevReportRows.find(p => p.period === rr.period);
                              return found ? Number(found.total || 0) : 0;
                            }), borderColor: '#888', backgroundColor: 'rgba(136,136,136,0.2)', borderDash: [4,4], tension: 0.25, pointRadius: 0, spanGaps: true }] : []),
                            ...(showAvgOverlay ? [{ type: 'line', label: 'Media', data: reportRows.map(() => reportStats.avgDaily), borderColor: '#ef6c00', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : []),
                            ...(showPeakOverlay ? [{ type: 'line', label: 'Picco', data: reportRows.map(() => reportStats.peak), borderColor: '#d32f2f', borderDash: [2,4], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : []),
                            ...(showHalfOverlay ? [{ type: 'line', label: '50%', data: reportRows.map(() => reportStats.peak * 0.5), borderColor: '#7b1fa2', borderDash: [3,3], borderWidth: 2, pointRadius: 0, fill: false, spanGaps: true }] : [])
                          ]
                        }}
                        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { display: true }, y: { display: true } } }}
                      />
                    )}
                  </div>

                  <table className="supplies-table">
                    <thead><tr><th>Periodo</th><th>Consumo totale</th><th>Giorni</th><th>Grafico</th></tr></thead>
                    <tbody>
                      {(() => {
                        const max = Math.max(...reportRows.map(r => Math.abs(r.total) || 0), 0.0001);
                        return reportRows.map((r) => (
                          <tr key={r.period}>
                            <td>{r.period}</td>
                            <td>{Number(r.total).toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                            <td>{r.days}</td>
                            <td style={{ width: 200 }}>
                              <div style={{ background: '#eee', height: 12, position: 'relative' }}>
                                <div style={{ background: '#4caf50', height: '100%', width: `${(Math.abs(r.total) / max) * 100}%` }} />
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Nessun dato di report disponibile. Genera il report impostando le date.</p>
              )}
            </section>

            {message && <p className="inline-message">{message}</p>}

            {uploadModalOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setUploadModalOpen(false)}>
                <div style={{ width: '90%', maxWidth: 900, background: '#fff', padding: 18, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
                  <h3>Carica consumi per fornitura</h3>
                  <p className="muted">Seleziona un file XLSX/CSV; il server genererà un'anteprima.</p>
                  <div style={{ marginTop: 8 }}>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }} />
                  </div>
                  {previewRows.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <h4>Anteprima ({previewRows.length} righe)</h4>
                      <div className="consumption-table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}>
                        <table className="supplies-table consumption-table">
                          <thead>
                            <tr><th>Giorno</th><th>Consumo</th><th>Fascia</th><th>Note</th></tr>
                          </thead>
                          <tbody>
                            {previewRows.slice(0,500).map((r, i) => (
                              <tr key={i}><td>{r.readingDate}</td><td>{r.consumption}</td><td>{r.slot}</td><td>{r.notes}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="ghost" onClick={() => { setPreviewRows([]); setMessage('Anteprima cancellata'); }}>Annulla anteprima</button>
                        <button type="button" onClick={confirmImport}>Conferma import</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <p className="muted">Nessuna anteprima disponibile. Seleziona un file per iniziare.</p>
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="ghost" onClick={() => setUploadModalOpen(false)}>Chiudi</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {manageModalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 10000 }} onClick={() => setManageModalOpen(false)}>
              <div style={{ width: '100%', height: '100%', background: '#fff', padding: 20, overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <h2>Gestione consumi - Fornitura</h2>
                  <div>
                    <button type="button" className="ghost" onClick={() => { setManageModalOpen(false); setEditingRow(null); }}>Chiudi</button>
                  </div>
                </div>

                <div style={{ marginTop: 12, marginBottom: 12, display: 'flex', gap: 8 }}>
                  <button type="button" onClick={startAdd}>Aggiungi consumo</button>
                  <button type="button" className="ghost" onClick={() => loadConsumptions({ paged: true, page: supplyConsumptionsPage.page, perPage: supplyConsumptionsPage.perPage })}>Ricarica</button>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div>
                      <label>Per pagina: </label>
                      <select value={supplyConsumptionsPage.perPage} onChange={(e) => { const p = Number(e.target.value || 50); loadConsumptions({ paged: true, page: 1, perPage: p }); }}>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div>
                      <button type="button" className="ghost" onClick={() => loadConsumptions({ paged: true, page: Math.max(1, supplyConsumptionsPage.page - 1), perPage: supplyConsumptionsPage.perPage })} disabled={supplyConsumptionsPage.page <= 1}>Prev</button>
                      <span style={{ margin: '0 8px' }}>Pagina {supplyConsumptionsPage.page} di {Math.max(1, Math.ceil(supplyConsumptionsPage.total / supplyConsumptionsPage.perPage || 1))}</span>
                      <button type="button" className="ghost" onClick={() => loadConsumptions({ paged: true, page: supplyConsumptionsPage.page + 1, perPage: supplyConsumptionsPage.perPage })} disabled={supplyConsumptionsPage.page >= Math.ceil(supplyConsumptionsPage.total / supplyConsumptionsPage.perPage || 1)}>Next</button>
                    </div>
                  </div>

                  <table className="supplies-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th>Data</th><th>Consumo</th><th>Fascia</th><th>Note</th><th>Azioni</th></tr>
                    </thead>
                    <tbody>
                      {supplyConsumptionsPage.rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.readingDate}</td>
                          <td>{r.consumption}</td>
                          <td>{r.slot}</td>
                          <td>{r.notes}</td>
                          <td>
                            <button type="button" className="ghost" onClick={() => startEdit(r)}>Modifica</button>
                            <button type="button" className="ghost" onClick={() => deleteRow(r.id)} style={{ marginLeft: 8 }}>Elimina</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {editingRow && (
                  <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
                    <h3>{editingRow.id ? 'Modifica consumo' : 'Nuovo consumo'}</h3>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                      <label>
                        Data
                        <input type="date" value={editingRow.readingDate} onChange={(e) => setEditingRow({ ...editingRow, readingDate: e.target.value })} />
                      </label>
                      <label>
                        Consumo
                        <input type="number" step="any" value={editingRow.consumption} onChange={(e) => setEditingRow({ ...editingRow, consumption: e.target.value })} />
                      </label>
                      <label>
                        Fascia
                        <input type="text" value={editingRow.slot} onChange={(e) => setEditingRow({ ...editingRow, slot: e.target.value })} />
                      </label>
                      <label style={{ flex: 1 }}>
                        Note
                        <input type="text" value={editingRow.notes} onChange={(e) => setEditingRow({ ...editingRow, notes: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="ghost" onClick={cancelEdit}>Annulla</button>
                      <button type="button" onClick={saveEdit}>Salva</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          </section>
        </div>
      </div>
    </main>
  );
}
