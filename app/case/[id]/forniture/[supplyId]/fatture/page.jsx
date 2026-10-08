"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import SuppliesSidebar from "../../../../../SuppliesSidebar";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const statuses = [
  { value: "da_pagare", label: "Da pagare" },
  { value: "pagata", label: "Pagata" },
  { value: "scaduta", label: "Scaduta" }
];

const invoiceStatusMeta = {
  da_pagare: { label: "Da pagare", icon: "€", className: "status-da-pagare" },
  pagata: { label: "Pagata", icon: "€", className: "status-pagata" },
  scaduta: { label: "Scaduta", icon: "€", className: "status-scaduta" }
};

const emptyCreate = {
  invoiceNumber: "",
  issueDate: "",
  dueDate: "",
  startDate: "",
  endDate: "",
  amount: "",
  consumption: "",
  consumptionUnit: "",
  status: "da_pagare",
  notes: "",
  parserConfidence: ""
};

const emptyEdit = {
  id: "",
  invoiceNumber: "",
  issueDate: "",
  dueDate: "",
  startDate: "",
  endDate: "",
  amount: "",
  consumption: "",
  consumptionUnit: "",
  status: "da_pagare",
  notes: "",
  parserConfidence: "",
  hasAttachment: false,
  attachmentName: ""
};

const consumptionUnitsByType = {
  GAS: ["Smc", "m3"],
  ACQUA: ["m3", "L"],
  LUCE: ["kWh"],
  RIFIUTI: ["kg", "L"]
};

function getInvoiceDailyConsumption(invoice) {
  if (!invoice || invoice.consumption === null || invoice.consumption === undefined || invoice.consumption === "") return null;
  const amount = Number(invoice.consumption);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const days = getDateDiffInDays(invoice.startDate, invoice.endDate);
  if (!days || days <= 0) return null;
  return amount / days;
}

function defaultConsumptionUnit(type) {
  return (consumptionUnitsByType[type] || [""])[0] || "";
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

function parseHourFromSlot(slot) {
  const normalized = normalizeHourSlot(slot);
  if (!/^\d{2}$/.test(normalized)) return null;
  const hour = Number(normalized);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function parseIsoFromUnknownDate(value) {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const str = String(value).trim();
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

function formatDateItaly(isoDate) {
  if (!isoDate) return "-";
  const dateStr = String(isoDate).slice(0, 10); // yyyy-mm-dd
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function getDateDiffInDays(startIsoDate, endIsoDate) {
  if (!startIsoDate || !endIsoDate) return 0;
  const start = new Date(`${String(startIsoDate).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(endIsoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function isHourHeader(value) {
  const normalized = normalizeHourSlot(value);
  return /^\d{2}$/.test(normalized);
}

function getInvoiceYear(invoice) {
  if (!invoice) return null;
  const raw = String(invoice.startDate || invoice.issueDate || "").slice(0, 4);
  if (/^\d{4}$/.test(raw)) return Number(raw);
  return null;
}

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftIsoDate(isoDate, daysDelta) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + daysDelta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `Errore API (${response.status})`);
  return payload;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SupplyInvoicesPage() {
  const params = useParams();
  const homeId = String(params.id || "");
  const supplyId = String(params.supplyId || "");
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [home, setHome] = useState(null);
  const [supply, setSupply] = useState(null);
  const [providers, setProviders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [attachment, setAttachment] = useState(null);
  const [editAttachment, setEditAttachment] = useState(null);
  const [removeEditAttachment, setRemoveEditAttachment] = useState(false);
  const [pdfPreview, setPdfPreview] = useState({ open: false, url: "", title: "" });
  const [supplyConsumptions, setSupplyConsumptions] = useState([]);
  const [consumptionModal, setConsumptionModal] = useState({ open: false, invoiceId: "", invoiceNumber: "" });
  const [consumptionForm, setConsumptionForm] = useState({ readingDate: "", consumption: "", slot: "", notes: "" });
  const [invoiceSortKey, setInvoiceSortKey] = useState("endDate");
  const [invoiceSortDir, setInvoiceSortDir] = useState("desc");
  const [consumptionUploadFile, setConsumptionUploadFile] = useState(null);
  const [consumptionPasteText, setConsumptionPasteText] = useState("");
  const [pendingImportRows, setPendingImportRows] = useState([]);
  const [pendingImportSource, setPendingImportSource] = useState("");
  const [invoiceParsePreview, setInvoiceParsePreview] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [editingConsumptionRow, setEditingConsumptionRow] = useState({ id: "", readingDate: "", consumption: "", slot: "", notes: "" });
  const [selectedConsumptionRowIds, setSelectedConsumptionRowIds] = useState([]);
  const [hourTooltip, setHourTooltip] = useState({ visible: false, x: 0, y: 0, text: "" });
  const [availableConsumptionDates, setAvailableConsumptionDates] = useState([]);
  const [consumptionPage, setConsumptionPage] = useState(1);
  const [selectedConsumptionDate, setSelectedConsumptionDate] = useState(isoToday());
  const [compareConsumptionEnabled, setCompareConsumptionEnabled] = useState(false);
  const [compareConsumptionDate, setCompareConsumptionDate] = useState(isoToday());
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [consumptionMenuOpenId, setConsumptionMenuOpenId] = useState("");
  const [consumptionFilterDate, setConsumptionFilterDate] = useState("");
  const [consumptionSortBy, setConsumptionSortBy] = useState(""); // 'readingDate' | 'consumption'
  const [consumptionSortDir, setConsumptionSortDir] = useState("asc"); // 'asc' | 'desc'
  const [consumptionDateRange, setConsumptionDateRange] = useState({ startDate: "", endDate: "" });
  const [invoiceYearWindowStart, setInvoiceYearWindowStart] = useState(0);
  const [selectedInvoiceYear, setSelectedInvoiceYear] = useState("");
  const [chartCollapsed, setChartCollapsed] = useState(false);

  const invoiceYears = useMemo(() => {
    const years = [...new Set(invoices.map((invoice) => getInvoiceYear(invoice)).filter(Boolean))].sort((a, b) => b - a);
    return years;
  }, [invoices]);

  useEffect(() => {
    if (!invoiceYears.length) {
      setSelectedInvoiceYear("");
      setInvoiceYearWindowStart(0);
      return;
    }

    if (!selectedInvoiceYear || !invoiceYears.includes(Number(selectedInvoiceYear))) {
      setSelectedInvoiceYear(String(invoiceYears[0]));
    }
  }, [invoiceYears, selectedInvoiceYear]);

  const visibleInvoiceYears = useMemo(() => {
    if (!invoiceYears.length) return [];
    return invoiceYears.slice(invoiceYearWindowStart, invoiceYearWindowStart + 3);
  }, [invoiceYears, invoiceYearWindowStart]);

  const filteredInvoices = useMemo(() => {
    if (!selectedInvoiceYear) return invoices;
    return invoices.filter((invoice) => getInvoiceYear(invoice) === Number(selectedInvoiceYear));
  }, [invoices, selectedInvoiceYear]);

  const totalAmount = useMemo(() => filteredInvoices.reduce((sum, item) => sum + Number(item.amount || 0), 0), [filteredInvoices]);
  const totalConsumption = useMemo(() => filteredInvoices.reduce((sum, item) => sum + (Number(item.consumption || 0) || 0), 0), [filteredInvoices]);
  const periodOrderedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((a, b) => {
      const aKey = a.startDate ? String(a.startDate).slice(0, 10) : a.issueDate ? String(a.issueDate).slice(0, 10) : "";
      const bKey = b.startDate ? String(b.startDate).slice(0, 10) : b.issueDate ? String(b.issueDate).slice(0, 10) : "";
      return aKey.localeCompare(bKey);
    });
  }, [filteredInvoices]);
  const invoiceConsumptionDeltaById = useMemo(() => {
    const map = {};
    for (let index = 1; index < periodOrderedInvoices.length; index += 1) {
      const current = periodOrderedInvoices[index];
      const previous = periodOrderedInvoices[index - 1];
      const currentRate = getInvoiceDailyConsumption(current);
      const previousRate = getInvoiceDailyConsumption(previous);
      if (currentRate === null || previousRate === null || previousRate === 0) continue;
      map[current.id] = ((currentRate - previousRate) / previousRate) * 100;
    }
    return map;
  }, [periodOrderedInvoices]);
  const sortedInvoices = useMemo(() => {
    const items = [...filteredInvoices];
    if (!invoiceSortKey) return items;

    items.sort((a, b) => {
      const aValue = a[invoiceSortKey] ? String(a[invoiceSortKey]).slice(0, 10) : "";
      const bValue = b[invoiceSortKey] ? String(b[invoiceSortKey]).slice(0, 10) : "";
      if (aValue === bValue) {
        const aStart = a.startDate ? String(a.startDate).slice(0, 10) : "";
        const bStart = b.startDate ? String(b.startDate).slice(0, 10) : "";
        if (aStart === bStart) {
          const aEnd = a.endDate ? String(a.endDate).slice(0, 10) : "";
          const bEnd = b.endDate ? String(b.endDate).slice(0, 10) : "";
          return aEnd.localeCompare(bEnd) * (invoiceSortDir === "asc" ? 1 : -1);
        }
        return aStart.localeCompare(bStart) * (invoiceSortDir === "asc" ? 1 : -1);
      }
      return aValue.localeCompare(bValue) * (invoiceSortDir === "asc" ? 1 : -1);
    });

    return items;
  }, [filteredInvoices, invoiceSortKey, invoiceSortDir]);
  const toggleInvoiceSort = (key) => {
    setInvoiceSortKey((currentKey) => {
      const nextDir = currentKey === key && invoiceSortDir === "asc" ? "desc" : "asc";
      setInvoiceSortDir(nextDir);
      return key;
    });
  };
  const currentProvider = useMemo(() => providers.find((item) => item.id === supply?.providerId) || null, [providers, supply?.providerId]);
  const isGasSupply = supply?.supplyType === "GAS";
  const typeMeta = useMemo(() => ({
    GAS: { icon: "⛽", label: "GAS" },
    ACQUA: { icon: "💧", label: "ACQUA" },
    LUCE: { icon: "⚡", label: "LUCE" },
    RIFIUTI: { icon: "🗑️", label: "RIFIUTI" }
  }), []);
  const supplyTypeMeta = supply?.supplyType ? typeMeta[supply.supplyType] || { icon: "🔧", label: supply.supplyType } : { icon: "🔧", label: "Fornitura" };
  const providerInitial = (currentProvider?.name || supply?.providerName || "F").trim().charAt(0).toUpperCase();
  
  const consumptionIntervalChart = useMemo(() => {
    const invoicesWithConsumption = filteredInvoices.filter(
      (inv) => inv.consumption && inv.consumption !== "" && Number(inv.consumption) > 0
    );
    
    if (invoicesWithConsumption.length === 0) {
      return { labels: [], data: [], min: 0, max: 0, avg: 0 };
    }
    
    const consumptionValues = invoicesWithConsumption.map((inv) => Number(inv.consumption));
    const minValue = Math.min(...consumptionValues);
    const maxValue = Math.max(...consumptionValues);
    const avgValue = consumptionValues.reduce((sum, val) => sum + val, 0) / consumptionValues.length;
    
    return {
      labels: invoicesWithConsumption.map((inv) => inv.invoiceNumber),
      data: consumptionValues,
      min: minValue,
      max: maxValue,
      avg: avgValue,
    };
  }, [filteredInvoices]);
  
  const unitOptions = useMemo(() => consumptionUnitsByType[supply?.supplyType] || [""], [supply?.supplyType]);
  const currentInvoiceConsumptions = useMemo(() => {
    const base = supplyConsumptions; // consumptions are now per-supply, not per-invoice
    // filter by invoice date range if set
    let filtered = base;
    if (consumptionDateRange.startDate || consumptionDateRange.endDate) {
      filtered = filtered.filter((it) => {
        const readingDate = String(it.readingDate || "").slice(0, 10);
        if (consumptionDateRange.startDate && readingDate < consumptionDateRange.startDate) return false;
        if (consumptionDateRange.endDate && readingDate > consumptionDateRange.endDate) return false;
        return true;
      });
    }
    // quick date filter
    filtered = consumptionFilterDate ? filtered.filter((it) => String(it.readingDate || "").slice(0, 10) === consumptionFilterDate) : filtered;
    // sorting
    if (!consumptionSortBy) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      let va = a[consumptionSortBy];
      let vb = b[consumptionSortBy];
      if (consumptionSortBy === "readingDate") {
        va = String(va || "");
        vb = String(vb || "");
        if (va < vb) return consumptionSortDir === "asc" ? -1 : 1;
        if (va > vb) return consumptionSortDir === "asc" ? 1 : -1;
        return 0;
      }
      // numeric sort for consumption
      if (consumptionSortBy === "consumption") {
        const na = Number(a.consumption || 0);
        const nb = Number(b.consumption || 0);
        if (na < nb) return consumptionSortDir === "asc" ? -1 : 1;
        if (na > nb) return consumptionSortDir === "asc" ? 1 : -1;
        return 0;
      }
      return 0;
    });
    return sorted;
  }, [supplyConsumptions, consumptionModal.invoiceId, consumptionFilterDate, consumptionSortBy, consumptionSortDir, consumptionDateRange]);
  const consumptionUnitLabel = defaultConsumptionUnit(supply?.supplyType);

  const dailyChart = useMemo(() => {
    const hourly = Array.from({ length: 24 }, () => 0);
    for (const row of currentInvoiceConsumptions) {
      const day = row.readingDate ? String(row.readingDate).slice(0, 10) : "";
      if (day !== selectedConsumptionDate) continue;
      const hour = parseHourFromSlot(row.slot);
      if (hour === null) continue;
      hourly[hour] += Number(row.consumption || 0);
    }
    const total = hourly.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(...hourly, 0);
    const avg = total / 24;
    return { hourly, total, avg, peak };
  }, [currentInvoiceConsumptions, selectedConsumptionDate]);

  const compareChart = useMemo(() => {
    const hourly = Array.from({ length: 24 }, () => 0);
    if (!compareConsumptionEnabled) return { hourly, max: 0 };
    for (const row of currentInvoiceConsumptions) {
      const day = row.readingDate ? String(row.readingDate).slice(0, 10) : "";
      if (day !== compareConsumptionDate) continue;
      const hour = parseHourFromSlot(row.slot);
      if (hour === null) continue;
      hourly[hour] += Number(row.consumption || 0);
    }
    return { hourly, max: Math.max(...hourly, 0) };
  }, [compareConsumptionDate, compareConsumptionEnabled, currentInvoiceConsumptions]);

  const chartMax = Math.max(dailyChart.peak, compareChart.max, 0.1);
  const consumptionsPerPage = 12;
  const totalConsumptionPages = Math.max(1, Math.ceil(currentInvoiceConsumptions.length / consumptionsPerPage));
  const visibleConsumptions = useMemo(() => {
    const start = (consumptionPage - 1) * consumptionsPerPage;
    return currentInvoiceConsumptions.slice(start, start + consumptionsPerPage);
  }, [consumptionPage, currentInvoiceConsumptions]);
  const allVisibleSelected = visibleConsumptions.length > 0 && visibleConsumptions.every((item) => selectedConsumptionRowIds.includes(item.id));

  useEffect(() => {
    if (consumptionPage > totalConsumptionPages) {
      setConsumptionPage(totalConsumptionPages);
    }
  }, [consumptionPage, totalConsumptionPages]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/forniture", { credentials: 'include' }));
      const currentHome = (data.homes || []).find((item) => item.id === homeId) || null;
      const currentSupply = (data.supplies || []).find((item) => item.id === supplyId) || null;
      const currentInvoices = (data.invoices || []).filter((item) => item.supplyId === supplyId);
      const currentInvoiceIds = new Set(currentInvoices.map((item) => item.id));
      setHome(currentHome);
      setSupply(currentSupply);
      setProviders(data.providers || []);
      setInvoices(currentInvoices);
      setSupplyConsumptions((data.supplyConsumptions || []).filter((item) => item.supplyId === supplyId));
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (homeId && supplyId) loadData();
  }, [homeId, supplyId]);

  useEffect(() => {
    setCreateForm((prev) => {
      if (!supply?.supplyType) return prev;
      if (prev.consumptionUnit) return prev;
      return { ...prev, consumptionUnit: defaultConsumptionUnit(supply.supplyType) };
    });
  }, [supply?.supplyType]);

  async function parseInvoiceFromUpload(file) {
    if (!file) {
      setInvoiceParsePreview(null);
      return null;
    }

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("providerName", currentProvider?.name || supply?.providerName || "");
      form.append("templateHint", currentProvider?.name || supply?.providerName || "");
      form.append("providerParsers", JSON.stringify(currentProvider?.parsers || []));

      const payload = await readJson(await fetch("/api/invoices/parse", {
        method: "POST",
        credentials: "include",
        body: form
      }));

      setInvoiceParsePreview({
        fileName: file.name,
        template: payload?.template || "generic-italian",
        confidence: Number(payload?.confidence || 0),
        fields: payload?.fields || {},
        providerName: currentProvider?.name || supply?.providerName || ""
      });

      setMessage(`Fattura analizzata (${payload?.template || "generico"}): ${Math.round((Number(payload?.confidence) || 0) * 100)}%`);
      return payload;
    } catch (error) {
      setInvoiceParsePreview(null);
      const details = error instanceof Error ? error.message : "errore sconosciuto";
      setMessage(`Impossibile analizzare il file fattura: ${details}`);
      return null;
    }
  }

  function updateInvoiceParseField(field, value) {
    setInvoiceParsePreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: {
          ...(prev.fields || {}),
          [field]: value
        }
      };
    });
  }

  function applyParsedInvoicePreview() {
    if (!invoiceParsePreview) return;
    const fields = invoiceParsePreview.fields || {};
    const appliedName = [fields.supplierName, fields.customerName].filter(Boolean).join(" - ") || "";
    const appliedAmount = fields.amount == null || fields.amount === "" ? "" : String(fields.amount);

    setCreateForm((prev) => ({
      ...prev,
      invoiceNumber: fields.invoiceNumber || prev.invoiceNumber,
      issueDate: fields.issueDate || prev.issueDate,
      dueDate: fields.dueDate || prev.dueDate,
      amount: appliedAmount || prev.amount,
      notes: prev.notes || appliedName,
      parserConfidence: String(invoiceParsePreview.confidence || 0)
    }));
    setInvoiceParsePreview(null);
    setMessage(`Dati fattura importati con confidenza ${Math.round((invoiceParsePreview.confidence || 0) * 100)}%`);
  }

  async function createInvoice(event) {
    event.preventDefault();
    try {
      const payload = {
        entity: "invoice",
        supplyId,
        ...createForm,
        parserConfidence: createForm.parserConfidence || null,
        startDate: createForm.startDate ? createForm.startDate : null,
        endDate: createForm.endDate ? createForm.endDate : null
      };
      if (attachment) {
        payload.attachment = {
          name: attachment.name,
          mime: attachment.type,
          data: await toDataUrl(attachment)
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
      setCreateForm(emptyCreate);
      setAttachment(null);
      setInvoiceParsePreview(null);
      setCreateModalOpen(false);
      setMessage("Fattura creata");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateStatus(id, status) {
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "invoiceStatus", id, status })
        })
      );
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function startEdit(invoice) {
    setEditForm({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || "",
      issueDate: invoice.issueDate ? String(invoice.issueDate).slice(0, 10) : "",
      dueDate: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "",
      startDate: invoice.startDate ? String(invoice.startDate).slice(0, 10) : "",
      endDate: invoice.endDate ? String(invoice.endDate).slice(0, 10) : "",
      amount: String(invoice.amount ?? ""),
      consumption: invoice.consumption === null || invoice.consumption === undefined ? "" : String(invoice.consumption),
      consumptionUnit: invoice.consumptionUnit || defaultConsumptionUnit(supply?.supplyType),
      status: invoice.status || "da_pagare",
      notes: invoice.notes || "",
      parserConfidence: invoice.parserConfidence != null ? String(invoice.parserConfidence) : "",
      hasAttachment: Boolean(invoice.hasAttachment),
      attachmentName: invoice.attachmentName || ""
    });
    setEditAttachment(null);
    setRemoveEditAttachment(false);
    setEditModalOpen(true);
  }

  function closeEdit() {
    setEditModalOpen(false);
    setEditForm(emptyEdit);
    setEditAttachment(null);
    setRemoveEditAttachment(false);
  }

  async function saveInvoice(event) {
    event.preventDefault();
    try {
      const payload = {
        entity: "invoice",
        id: editForm.id,
        supplyId,
        invoiceNumber: editForm.invoiceNumber,
        issueDate: editForm.issueDate,
        dueDate: editForm.dueDate,
        startDate: editForm.startDate ? editForm.startDate : null,
        endDate: editForm.endDate ? editForm.endDate : null,
        amount: editForm.amount,
        consumption: editForm.consumption,
        consumptionUnit: editForm.consumptionUnit,
        status: editForm.status,
        notes: editForm.notes,
        parserConfidence: editForm.parserConfidence || null,
        removeAttachment: removeEditAttachment
      };
      if (editAttachment) {
        payload.attachment = {
          name: editAttachment.name,
          mime: editAttachment.type,
          data: await toDataUrl(editAttachment)
        };
      }

      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      );
      const editMessage = editAttachment
        ? "Fattura aggiornata: allegato sostituito"
        : removeEditAttachment
          ? "Fattura aggiornata: allegato rimosso"
          : "Fattura aggiornata";
      closeEdit();
      setMessage(editMessage);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm("Eliminare questa fattura?")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=invoice&id=${id}`, { method: "DELETE", credentials: 'include' }));
      setMessage("Fattura eliminata");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function openPdfPreview(invoice) {
    setPdfPreview({
      open: true,
      url: `/api/forniture/attachment?id=${invoice.id}&preview=1`,
      title: invoice.attachmentName || invoice.invoiceNumber || "Allegato PDF"
    });
  }

  function closePdfPreview() {
    setPdfPreview({ open: false, url: "", title: "" });
  }

  function openConsumptionModal(invoice) {
    // open consumption modal at supply level with optional date range filter
    const supplyRows = supplyConsumptions.filter((item) => item.supplyId === supplyId);
    
    // determine date range: if invoice has startDate/endDate, use those; otherwise use all available dates
    let startDate = invoice?.startDate ? String(invoice.startDate).slice(0, 10) : "";
    let endDate = invoice?.endDate ? String(invoice.endDate).slice(0, 10) : "";
    
    // filter rows by date range
    let filteredRows = supplyRows;
    if (startDate || endDate) {
      filteredRows = supplyRows.filter((it) => {
        const readingDate = String(it.readingDate || "").slice(0, 10);
        if (startDate && readingDate < startDate) return false;
        if (endDate && readingDate > endDate) return false;
        return true;
      });
    }
    
    const latestDate = filteredRows
      .map((item) => String(item.readingDate || "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1) || isoToday();

    setConsumptionModal({ open: true, invoiceId: invoice?.id || "", invoiceNumber: invoice?.invoiceNumber || "" });
    setConsumptionDateRange({ startDate, endDate });
    setConsumptionForm({ readingDate: latestDate, consumption: "", slot: "", notes: "" });
    setSelectedConsumptionDate(latestDate);
    // compute available dates for this supply (within the invoice range if set)
    const uniqDates = Array.from(new Set(filteredRows.map((r) => String(r.readingDate || "").slice(0, 10)).filter(Boolean))).sort();
    setAvailableConsumptionDates(uniqDates);
    const latestIndex = uniqDates.indexOf(latestDate);
    const prevDate = latestIndex > 0 ? uniqDates[latestIndex - 1] : shiftIsoDate(latestDate, -1);
    setCompareConsumptionDate(prevDate);
    setCompareConsumptionEnabled(false);
    setConsumptionUploadFile(null);
    setPendingImportRows([]);
    setPendingImportSource("");
    setEditingConsumptionRow({ id: "", readingDate: "", consumption: "", slot: "", notes: "" });
    setSelectedConsumptionRowIds([]);
    setConsumptionPage(1);
  }

  function closeConsumptionModal() {
    setConsumptionModal({ open: false, invoiceId: "", invoiceNumber: "" });
    setConsumptionDateRange({ startDate: "", endDate: "" });
    setConsumptionUploadFile(null);
    setConsumptionPasteText("");
    setPendingImportRows([]);
    setPendingImportSource("");
    setEditingConsumptionRow({ id: "", readingDate: "", consumption: "", slot: "", notes: "" });
    setSelectedConsumptionRowIds([]);
    setConsumptionPage(1);
  }

  function toggleConsumptionMenu(id) {
    setConsumptionMenuOpenId((prev) => (prev === id ? "" : id));
    // after opening, adjust placement so dropdown fits in viewport
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const targetId = consumptionMenuOpenId === id ? "" : id;
        if (!targetId) return;
        try {
          const container = document.querySelector(`.inline-dropdown[data-invoice-id=\"${targetId}\"]`);
          if (!container) return;
          const panel = container.querySelector('.dropdown-panel');
          if (!panel) return;
          const rect = panel.getBoundingClientRect();
          if (rect.bottom > (window.innerHeight || document.documentElement.clientHeight) - 8) {
            container.classList.add('open-top');
          } else {
            container.classList.remove('open-top');
          }
        } catch (e) {
          // ignore
        }
      });
    }
  }

  async function addDailyConsumption(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "supplyConsumption",
            supplyId,
            readingDate: consumptionForm.readingDate,
            consumption: consumptionForm.consumption,
            slot: normalizeHourSlot(consumptionForm.slot),
            notes: consumptionForm.notes
          })
        })
      );
      setConsumptionForm({ readingDate: "", consumption: "", slot: "", notes: "" });
      setMessage("Consumo giornaliero salvato");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteDailyConsumption(id) {
    if (!window.confirm("Eliminare questo consumo giornaliero?")) return;
    try {
      await readJson(await fetch(`/api/forniture?entity=supplyConsumption&id=${id}`, { method: "DELETE", credentials: 'include' }));
      setMessage("Consumo giornaliero eliminato");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function toggleConsumptionSelection(id) {
    setSelectedConsumptionRowIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  function toggleVisibleConsumptionSelection() {
    const visibleIds = visibleConsumptions.map((item) => item.id);
    setSelectedConsumptionRowIds((prev) => {
      if (visibleIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  async function deleteSelectedConsumptions() {
    if (!selectedConsumptionRowIds.length) return;
    if (!window.confirm(`Eliminare ${selectedConsumptionRowIds.length} righe selezionate?`)) return;
    try {
      await Promise.all(
        selectedConsumptionRowIds.map((id) =>
          fetch(`/api/forniture?entity=supplyConsumption&id=${id}`, { method: "DELETE", credentials: 'include' }).then(readJson)
        )
      );
      setSelectedConsumptionRowIds([]);
      setMessage("Righe consumo eliminate");
      await loadData();
    } catch (error) {
      setMessage(error.message || "Errore eliminazione massiva");
    }
  }

  function toggleConsumptionSort(column) {
    if (consumptionSortBy === column) {
      setConsumptionSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setConsumptionSortBy(column);
      setConsumptionSortDir("asc");
    }
    setConsumptionPage(1);
  }

  function exportSelectedCsv() {
    if (!selectedConsumptionRowIds.length) return;
    const rows = supplyConsumptions.filter((r) => selectedConsumptionRowIds.includes(r.id));
    const header = ["Giorno", "Consumo", "Fascia", "Note"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const parts = [String(r.readingDate || ""), String(r.consumption ?? ""), String(r.slot || ""), String(r.notes || "")];
      // escape double quotes
      const escaped = parts.map((p) => (String(p).includes(",") || String(p).includes('\"') ? `"${String(p).replace(/"/g, '""')}"` : p));
      lines.push(escaped.join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consumi_${supply?.label || supplyId || "export"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function startEditDailyConsumption(item) {
    setEditingConsumptionRow({
      id: item.id,
      readingDate: item.readingDate ? String(item.readingDate).slice(0, 10) : "",
      consumption: String(item.consumption ?? ""),
      slot: item.slot || "",
      notes: item.notes || ""
    });
  }

  function cancelEditDailyConsumption() {
    setEditingConsumptionRow({ id: "", readingDate: "", consumption: "", slot: "", notes: "" });
  }

  async function saveDailyConsumptionEdit(event) {
    event.preventDefault();
    try {
      await readJson(
        await fetch("/api/forniture", {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "supplyConsumption",
            id: editingConsumptionRow.id,
            readingDate: editingConsumptionRow.readingDate,
            consumption: editingConsumptionRow.consumption,
            slot: normalizeHourSlot(editingConsumptionRow.slot),
            notes: editingConsumptionRow.notes
          })
        })
      );
      cancelEditDailyConsumption();
      setMessage("Consumo giornaliero aggiornato");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function normalizeImportedDate(value) {
    return parseIsoFromUnknownDate(value);
  }

  function parseImportedNumber(value) {
    if (value === "" || value === undefined || value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function matrixToObjectRows(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) return [];
    const headersRaw = Array.isArray(matrix[0]) ? matrix[0] : [];
    const headers = headersRaw.map((cell, index) => {
      const value = String(cell || "").trim();
      return value || `col_${index}`;
    });
    return matrix.slice(1)
      .map((line) => {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = Array.isArray(line) ? (line[index] ?? "") : "";
        });
        return row;
      })
      .filter((row) => Object.values(row).some((value) => String(value || "").trim() !== ""));
  }

  function parseConsumptionsFromData(matrix, rows, fallbackDate) {
    const mapped = [];

    const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
    const dateColumns = headerRow
      .map((cell, index) => ({ index, date: parseIsoFromUnknownDate(cell) }))
      .filter((item) => item.index > 0 && item.date);
    if (dateColumns.length >= 2 && matrix.length > 1) {
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const line = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
        const hourCandidate = normalizeHourSlot(line[0]);
        const slot = /^\d{2}$/.test(hourCandidate) ? hourCandidate : "";
        for (const column of dateColumns) {
          const rawValue = line[column.index];
          const consumption = parseImportedNumber(rawValue);
          if (consumption === null) continue;
          mapped.push({
            readingDate: column.date,
            consumption,
            slot,
            notes: ""
          });
        }
      }
    }

    let currentDate = "";
    for (const row of rows) {
      const entries = Object.entries(row);
      const findValue = (patterns, fallbackIndex = -1) => {
        for (const [key, val] of entries) {
          const normalized = String(key).toLowerCase();
          if (patterns.some((pattern) => normalized.includes(pattern))) return val;
        }
        return fallbackIndex >= 0 ? entries[fallbackIndex]?.[1] : undefined;
      };

      const explicitDate = normalizeImportedDate(findValue(["data", "giorno", "date"], 0));
      if (explicitDate) currentDate = explicitDate;
      const readingDate = explicitDate || currentDate || fallbackDate;
      if (!readingDate) continue;

      const notes = String(findValue(["note", "descrizione", "descr"], -1) || "").trim();

      const hourColumns = entries.filter(([key]) => isHourHeader(key));
      if (hourColumns.length) {
        for (const [hourKey, rawValue] of hourColumns) {
          const consumption = parseImportedNumber(rawValue);
          if (consumption === null) continue;
          mapped.push({
            readingDate,
            consumption,
            slot: normalizeHourSlot(hourKey),
            notes
          });
        }
        continue;
      }

      const consumption = parseImportedNumber(findValue(["consumo", "kwh", "smc", "m3", "quantita", "qta"], 1));
      const rawHour = findValue(["ora", "hour"], -1);
      const rawSlot = findValue(["fascia", "slot", "periodo"], 2);
      const slot = normalizeHourSlot(rawHour !== undefined ? rawHour : rawSlot);
      if (consumption === null) continue;
      mapped.push({ readingDate, consumption, slot, notes });
    }

    const dedupKey = (item) => `${item.readingDate}|${item.slot || ""}|${item.consumption}|${item.notes || ""}`;
    const unique = [];
    const seen = new Set();
    for (const item of mapped) {
      const key = dedupKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return unique;
  }

  async function uploadDailyConsumptions(event) {
    event.preventDefault();
    if (!consumptionUploadFile) return;

    try {
      const form = new FormData();
      form.append("file", consumptionUploadFile);
      form.append("baseDate", selectedConsumptionDate || "");
      form.append("supplyId", supplyId || "");
      const res = await fetch("/api/forniture/parse", { method: "POST", body: form, credentials: 'include' });
      const payload = await readJson(res);
      if (!payload.rows || !payload.rows.length) {
        setMessage("Nessuna riga valida trovata nel file consumi (server)");
        return;
      }
      setConsumptionUploadFile(null);
      setPendingImportRows(payload.rows || []);
      setPendingImportSource("file");
      setMessage(`Anteprima pronta: ${payload.rows.length} righe parse dal file (server)`);
    } catch (error) {
      const details = error instanceof Error ? error.message : "errore sconosciuto";
      setMessage(`Errore durante import file consumi: ${details}`);
    }
  }

  function parsePastedMatrix(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return [];
    const delimiter = raw.includes("\t")
      ? "\t"
      : ((raw.match(/;/g)?.length || 0) >= (raw.match(/,/g)?.length || 0) ? ";" : ",");
    return raw
      .split("\n")
      .map((line) => line.split(delimiter).map((cell) => String(cell || "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));
  }

  async function importPastedConsumptions(event) {
    event.preventDefault();
    try {
      const matrix = parsePastedMatrix(consumptionPasteText);
      if (!matrix.length) {
        setMessage("Incolla prima una tabella consumi valida");
        return;
      }
      const rows = matrixToObjectRows(matrix);
      const unique = parseConsumptionsFromData(matrix, rows, selectedConsumptionDate);
      if (!unique.length) {
        setMessage("Nessuna riga valida trovata nel testo incollato");
        return;
      }
      setPendingImportRows(unique);
      setPendingImportSource("incolla");
      setMessage(`Anteprima pronta: ${unique.length} righe parse da incolla`);
      setConsumptionPasteText("");
    } catch (error) {
      const details = error instanceof Error ? error.message : "errore sconosciuto";
      setMessage(`Errore import da incolla: ${details}`);
    }
  }

  async function confirmParsedImport() {
    if (!pendingImportRows.length) return;
    try {
      const response = await readJson(
        await fetch("/api/forniture", {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "supplyConsumption",
            supplyId,
            baseDate: selectedConsumptionDate,
            rows: pendingImportRows
          })
        })
      );
      const imported = Number(response.imported || 0);
      const skipped = Number(response.skipped || 0);
      const errors = Number(response.errors || 0);
      setMessage(`Import ${pendingImportSource || "consumi"} completato: ${imported} importati, ${skipped} scartati, ${errors} errori`);
      setPendingImportRows([]);
      setPendingImportSource("");
      // close upload and details modals after successful import
      setUploadModalOpen(false);
      setDetailsModalOpen(false);
      await loadData();
    } catch (error) {
      setMessage(error.message || "Errore conferma import");
    }
  }

  function cancelParsedImport() {
    setPendingImportRows([]);
    setPendingImportSource("");
    setMessage("Anteprima import annullata");
    setDetailsModalOpen(false);
  }

  return (
    <main className="supplies-page">
      <div className="supplies-layout">
        <SuppliesSidebar />
        <div className="supplies-content">
          <section className="panel summary-header-panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0 }}>
                {home?.photoMime ? (
                  <img
                    src={`/api/forniture/attachment?id=${home.id}&type=home&preview=1`}
                    alt="Foto casa"
                    style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "12px", flexShrink: 0, border: "1px solid rgba(0,0,0,0.08)" }}
                  />
                ) : (
                  <div style={{ width: "72px", height: "72px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "#ececec", color: "#666", fontWeight: 700, fontSize: "1.5rem" }}>
                    { (home?.name || "C").charAt(0).toUpperCase() }
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <p className="eyebrow" style={{ margin: 0, marginBottom: "0.35rem" }}>Fatture Fornitura</p>
                  <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 3vw, 3.2rem)", lineHeight: 1.08, wordBreak: "break-word" }}>
                    {home?.name || "Casa"} - {supplyTypeMeta.icon}
                  </h1>
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <a className="ghost table-link-button" href="/case">Torna alle case</a>
                <a className="ghost table-link-button" href={`/case/${homeId}/forniture`}>Torna alle forniture</a>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: "170px", padding: "0.7rem 0.9rem", borderRadius: "12px", background: "linear-gradient(135deg, #eefaf5 0%, #e6f0ff 100%)", border: "1px solid rgba(17, 94, 79, 0.12)", boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6b74", fontWeight: 700 }}>Totale fatture</div>
                  <div style={{ marginTop: "0.35rem", fontSize: "1.5rem", fontWeight: 800, color: "#1f2937", lineHeight: 1.2 }}>{totalAmount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</div>
                </div>
                <div style={{ minWidth: "170px", padding: "0.7rem 0.9rem", borderRadius: "12px", background: "linear-gradient(135deg, #fff7ea 0%, #eef7ff 100%)", border: "1px solid rgba(202, 138, 4, 0.15)", boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6b74", fontWeight: 700 }}>Totale consumi</div>
                  <div style={{ marginTop: "0.35rem", fontSize: "1.5rem", fontWeight: 800, color: "#1f2937", lineHeight: 1.2 }}>{totalConsumption.toLocaleString("it-IT")} {defaultConsumptionUnit(supply?.supplyType) || ""}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                {invoiceYears.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <button className="ghost" type="button" onClick={() => setInvoiceYearWindowStart((current) => Math.max(0, current - 1))} disabled={invoiceYearWindowStart === 0} aria-label="Anni precedenti">←</button>
                    {visibleInvoiceYears.map((year) => (
                      <button
                        key={year}
                        type="button"
                        className={selectedInvoiceYear === String(year) ? "primary" : "ghost"}
                        onClick={() => setSelectedInvoiceYear(String(year))}
                        style={{ minWidth: "74px" }}
                      >
                        {year}
                      </button>
                    ))}
                    <button className="ghost" type="button" onClick={() => setInvoiceYearWindowStart((current) => current + 1)} disabled={invoiceYearWindowStart + 3 >= invoiceYears.length} aria-label="Anni successivi">→</button>
                  </div>
                )}
                <button className="ghost" onClick={() => {
                  setCreateForm((prev) => ({
                    ...prev,
                    consumptionUnit: prev.consumptionUnit || defaultConsumptionUnit(supply?.supplyType)
                  }));
                  setCreateModalOpen(true);
                }}>Nuova fattura</button>
                <button className="ghost" onClick={() => router.push(`/case/${homeId}/forniture/${supplyId}/documenti`)}>📄 Documenti fornitura</button>
              </div>
            </div>

          </section>

          {message && <p className="inline-message">{message}</p>}

          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Elenco fatture</h2>
            </div>
            {!loading && !!filteredInvoices.length && consumptionIntervalChart.labels.length > 0 && (
              <div style={{ marginBottom: "2rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: chartCollapsed ? 0 : "1rem" }}>
                  <h3 style={{ margin: 0 }}>Distribuzione dei consumi</h3>
                  <button
                    className="ghost icon-only-button chart-toggle-button"
                    type="button"
                    onClick={() => setChartCollapsed((current) => !current)}
                    aria-label={chartCollapsed ? "Espandi grafico" : "Comprimi grafico"}
                    title={chartCollapsed ? "Espandi grafico" : "Comprimi grafico"}
                  >
                    {chartCollapsed ? "▾" : "▴"}
                  </button>
                </div>
                {!chartCollapsed && (
                  <div style={{ position: "relative", width: "100%", maxWidth: "800px", height: "350px", margin: "0 auto" }}>
                    <Bar
                      data={{
                        labels: consumptionIntervalChart.labels,
                        datasets: [
                          {
                            label: `Consumo (${consumptionUnitLabel})`,
                            data: consumptionIntervalChart.data,
                            backgroundColor: "rgba(75, 192, 192, 0.7)",
                            borderColor: "rgba(75, 192, 192, 1)",
                            borderWidth: 1,
                            type: "bar",
                            yAxisID: "y",
                            order: 2,
                          },
                          {
                            label: `Massimo: ${consumptionIntervalChart.max.toFixed(2)}`,
                            data: Array(consumptionIntervalChart.labels.length).fill(consumptionIntervalChart.max),
                            borderColor: "rgba(255, 99, 99, 1)",
                            backgroundColor: "transparent",
                            borderWidth: 2,
                            borderDash: [5, 5],
                            type: "line",
                            yAxisID: "y",
                            pointRadius: 0,
                            order: 1,
                          },
                          {
                            label: `Minimo: ${consumptionIntervalChart.min.toFixed(2)}`,
                            data: Array(consumptionIntervalChart.labels.length).fill(consumptionIntervalChart.min),
                            borderColor: "rgba(54, 162, 235, 1)",
                            backgroundColor: "transparent",
                            borderWidth: 2,
                            borderDash: [5, 5],
                            type: "line",
                            yAxisID: "y",
                            pointRadius: 0,
                            order: 1,
                          },
                          {
                            label: `Media: ${consumptionIntervalChart.avg.toFixed(2)}`,
                            data: Array(consumptionIntervalChart.labels.length).fill(consumptionIntervalChart.avg),
                            borderColor: "rgba(255, 193, 7, 1)",
                            backgroundColor: "transparent",
                            borderWidth: 2,
                            type: "line",
                            yAxisID: "y",
                            pointRadius: 0,
                            order: 1,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                          mode: "index",
                          intersect: false,
                        },
                        plugins: {
                          legend: {
                            display: true,
                            position: "top",
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            max: Math.max(consumptionIntervalChart.max * 1.1, 1),
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {loading && <p className="muted">Caricamento...</p>}
            {!loading && !filteredInvoices.length && <p className="muted">Nessuna fattura associata a questo anno.</p>}
            {!loading && !!filteredInvoices.length && (
              <div className="supplies-table-wrap">
                <table className="supplies-table invoices-table">
                  <thead>
                    <tr>
                      <th>Numero</th>
                      <th className="sortable-header" onClick={() => toggleInvoiceSort("issueDate")}>Date contabili {invoiceSortKey === "issueDate" ? (invoiceSortDir === "asc" ? "▲" : "▼") : ""}</th>
                      <th className="sortable-header" onClick={() => toggleInvoiceSort("startDate")}>Inizio consumi {invoiceSortKey === "startDate" ? (invoiceSortDir === "asc" ? "▲" : "▼") : ""}</th>
                      <th className="sortable-header" onClick={() => toggleInvoiceSort("endDate")}>Fine consumi {invoiceSortKey === "endDate" ? (invoiceSortDir === "asc" ? "▲" : "▼") : ""}</th>
                      <th>Importo</th>
                      <th>Variazione</th>
                      <th>Consumo</th>
                      <th>Stato</th>
                      <th>Allegato</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceNumber}</td>
                        <td>
                          <div className="invoice-accounting-dates">
                            <div><small>Emissione:</small> <span>{formatDateItaly(invoice.issueDate)}</span></div>
                            <div><small>Scadenza:</small> <span>{formatDateItaly(invoice.dueDate)}</span></div>
                          </div>
                        </td>
                        <td>{formatDateItaly(invoice.startDate)}</td>
                        <td>{formatDateItaly(invoice.endDate)}</td>
                        <td className="invoice-amount-cell">
                          <span className="supply-total-amount has-value">{Number(invoice.amount || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                        </td>
                        <td>
                          {invoiceConsumptionDeltaById[invoice.id] === undefined ? "-" : (
                            <span className={`invoice-consumption-delta ${invoiceConsumptionDeltaById[invoice.id] < 0 ? "decrease" : invoiceConsumptionDeltaById[invoice.id] > 0 ? "increase" : "neutral"}`}>
                              {invoiceConsumptionDeltaById[invoice.id] < 0 ? "↓ " : invoiceConsumptionDeltaById[invoice.id] > 0 ? "↑ " : "→ "}
                              {Math.abs(invoiceConsumptionDeltaById[invoice.id]).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td>
                          {invoice.consumption === null || invoice.consumption === undefined || invoice.consumption === ""
                            ? "-"
                            : (
                              <div className="invoice-consumption-block">
                                <span className="invoice-consumption-value">{`${Number(invoice.consumption).toLocaleString("it-IT")} ${invoice.consumptionUnit || ""}`.trim()}</span>
                                <small className="invoice-consumption-days">in {getDateDiffInDays(invoice.startDate, invoice.endDate)} giorni</small>
                              </div>
                            )}
                        </td>
                        <td>
                          <span
                            className={`invoice-status-icon ${invoiceStatusMeta[invoice.status]?.className || "status-da-pagare"}`}
                            title={invoiceStatusMeta[invoice.status]?.label || invoice.status || "Stato"}
                            aria-label={invoiceStatusMeta[invoice.status]?.label || invoice.status || "Stato"}
                          >
                            {invoiceStatusMeta[invoice.status]?.icon || "€"}
                          </span>
                        </td>
                        <td>
                          {invoice.hasAttachment ? (
                            <div className="home-row-actions">
                              <a className="icon-link" href={`/api/forniture/attachment?id=${invoice.id}`} title="Scarica allegato" aria-label="Scarica allegato" style={{ fontSize: "1.2em", textDecoration: "none" }}>📥</a>
                              {invoice.attachmentMime === "application/pdf" && (
                                <button className="ghost icon-only-button pdf-preview-button" onClick={() => openPdfPreview(invoice)} title="Anteprima PDF" aria-label="Anteprima PDF">📄</button>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className="home-row-actions">
                            {!isGasSupply && (
                              <button className="ghost icon-only-button" title="Gestisci consumi" aria-label="Gestisci consumi" onClick={() => openConsumptionModal(invoice)}>📊</button>
                            )}
                            <button className="ghost icon-only-button" title="Modifica fattura" aria-label="Modifica fattura" onClick={() => startEdit(invoice)}>✏️</button>
                            <button className="danger icon-only-button" title="Elimina fattura" aria-label="Elimina fattura" onClick={() => deleteInvoice(invoice.id)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm8 0h2v9h-2V9zM10 9h2v9h-2V9z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {createModalOpen && (
            <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Nuova fattura</h2>
                <form className="home-form" onSubmit={createInvoice}>
                  <label>
                    Numero fattura
                    <input
                      value={createForm.invoiceNumber}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
                      required
                    />
                  </label>
                  <div className="date-row">
                    <label>
                      Emissione
                      <input
                        type="date"
                        value={createForm.issueDate}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, issueDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      Scadenza
                      <input
                        type="date"
                        value={createForm.dueDate}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="date-row">
                    <label>
                      Data inizio consumi
                      <input
                        type="date"
                        value={createForm.startDate}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      Data fine consumi
                      <input
                        type="date"
                        value={createForm.endDate}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    Importo
                    <input
                      type="number"
                      step="0.01"
                      value={createForm.amount}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, amount: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Consumo
                    <input
                      type="number"
                      step="0.001"
                      value={createForm.consumption}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, consumption: event.target.value }))}
                    />
                  </label>
                  <label>
                    Unita consumo
                    <select
                      value={createForm.consumptionUnit}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, consumptionUnit: event.target.value }))}
                    >
                      {unitOptions.map((unit) => <option key={unit || "none"} value={unit}>{unit || "-"}</option>)}
                    </select>
                  </label>
                  <label>
                    Stato
                    <select
                      value={createForm.status}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Allegato / PDF da analizzare
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt"
                      onChange={async (event) => {
                        const file = event.target.files?.[0] || null;
                        setAttachment(file);
                        if (file) {
                          await parseInvoiceFromUpload(file);
                        } else {
                          setInvoiceParsePreview(null);
                        }
                      }}
                    />
                  </label>
                  {invoiceParsePreview && (
                    <div className="parser-preview-panel" style={{ border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: "12px", padding: "0.85rem 1rem", display: "grid", gap: "0.8rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <strong>Dashboard conferma dati fattura</strong>
                        <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>
                          {invoiceParsePreview.template}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "#374151" }}>
                        File: <strong>{invoiceParsePreview.fileName}</strong> · Confidenza: <strong>{Math.round((invoiceParsePreview.confidence || 0) * 100)}%</strong>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          Numero fattura
                          <input
                            value={invoiceParsePreview.fields.invoiceNumber || ""}
                            onChange={(event) => updateInvoiceParseField("invoiceNumber", event.target.value)}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          Data emissione
                          <input
                            type="date"
                            value={invoiceParsePreview.fields.issueDate || ""}
                            onChange={(event) => updateInvoiceParseField("issueDate", event.target.value)}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          Scadenza
                          <input
                            type="date"
                            value={invoiceParsePreview.fields.dueDate || ""}
                            onChange={(event) => updateInvoiceParseField("dueDate", event.target.value)}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          Importo
                          <input
                            type="number"
                            step="0.01"
                            value={invoiceParsePreview.fields.amount ?? ""}
                            onChange={(event) => updateInvoiceParseField("amount", event.target.value)}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "0.35rem", gridColumn: "1 / -1" }}>
                          Fornitore
                          <input
                            value={invoiceParsePreview.fields.supplierName || ""}
                            onChange={(event) => updateInvoiceParseField("supplierName", event.target.value)}
                          />
                        </label>
                      </div>

                      <div className="home-form-actions" style={{ justifyContent: "flex-start" }}>
                        <button type="button" onClick={applyParsedInvoicePreview}>Conferma dati</button>
                        <button type="button" className="ghost" onClick={() => { setInvoiceParsePreview(null); setAttachment(null); }}>Rifiuta</button>
                      </div>
                    </div>
                  )}
                  <label>
                    Note
                    <textarea
                      value={createForm.notes}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Crea fattura</button>
                    <button type="button" className="ghost" onClick={() => setCreateModalOpen(false)}>Chiudi</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {editModalOpen && (
            <div className="modal-backdrop" onClick={closeEdit}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Modifica fattura</h2>
                <form className="home-form" onSubmit={saveInvoice}>
                  <label>
                    Numero fattura
                    <input
                      value={editForm.invoiceNumber}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
                      required
                    />
                  </label>
                  <div className="date-row">
                    <label>
                      Emissione
                      <input
                        type="date"
                        value={editForm.issueDate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, issueDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      Scadenza
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="date-row">
                    <label>
                      Data inizio consumi
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, startDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      Data fine consumi
                      <input
                        type="date"
                        value={editForm.endDate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, endDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    Importo
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, amount: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Consumo
                    <input
                      type="number"
                      step="0.001"
                      value={editForm.consumption}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, consumption: event.target.value }))}
                    />
                  </label>
                  <label>
                    Unita consumo
                    <select
                      value={editForm.consumptionUnit}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, consumptionUnit: event.target.value }))}
                    >
                      {unitOptions.map((unit) => <option key={`edit-${unit || "none"}`} value={unit}>{unit || "-"}</option>)}
                    </select>
                  </label>
                  <label>
                    Stato
                    <select
                      value={editForm.status}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      {statuses.map((status) => <option key={`edit-${status.value}`} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Allegato
                    {editForm.hasAttachment && !removeEditAttachment && !editAttachment && (
                      <small>
                        Allegato attuale: {editForm.attachmentName || "presente"} - <a className="table-link-button" href={`/api/forniture/attachment?id=${editForm.id}`}>Scarica</a>
                      </small>
                    )}
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setEditAttachment(file);
                        if (file) setRemoveEditAttachment(false);
                      }}
                    />
                    {editAttachment && <small>Nuovo file: {editAttachment.name}</small>}
                    {editForm.hasAttachment && (
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={removeEditAttachment}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setRemoveEditAttachment(checked);
                            if (checked) setEditAttachment(null);
                          }}
                        />
                        Rimuovi allegato esistente
                      </label>
                    )}
                  </label>
                  <label>
                    Note
                    <textarea
                      value={editForm.notes}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </label>
                  <div className="home-form-actions">
                    <button type="submit">Salva fattura</button>
                    <button type="button" className="ghost" onClick={closeEdit}>Chiudi</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {pdfPreview.open && (
            <div className="modal-backdrop" onClick={closePdfPreview}>
              <section className="modal-card pdf-preview-card" onClick={(event) => event.stopPropagation()}>
                <div className="home-form-actions">
                  <h2>Anteprima PDF: {pdfPreview.title}</h2>
                  <button type="button" className="ghost" onClick={closePdfPreview}>Chiudi</button>
                </div>
                <iframe
                  title={pdfPreview.title}
                  src={pdfPreview.url}
                  className="pdf-preview-frame"
                />
              </section>
            </div>
          )}

          {consumptionModal.open && (
            <div className="modal-backdrop" onClick={closeConsumptionModal}>
              <section className="modal-card consumption-modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Consumi giornalieri fattura {consumptionModal.invoiceNumber} {consumptionDateRange.startDate || consumptionDateRange.endDate ? `(${formatDateItaly(consumptionDateRange.startDate || "")} - ${formatDateItaly(consumptionDateRange.endDate || "")})` : ""}</h2>

                <section className="consumption-chart-panel">
                  <div className="consumption-chart-toolbar">
                    <button type="button" className="ghost" onClick={() => {
                      // go to previous available date if present
                      const idx = availableConsumptionDates.indexOf(selectedConsumptionDate);
                      if (idx > 0) setSelectedConsumptionDate(availableConsumptionDates[idx - 1]);
                    }} disabled={availableConsumptionDates.indexOf(selectedConsumptionDate) <= 0}>◀</button>
                    <label>
                      Giorno
                      <input
                        type="date"
                        value={selectedConsumptionDate}
                        onChange={(event) => {
                          const v = event.target.value;
                          // clamp to available range if dates exist
                          if (availableConsumptionDates.length) {
                            const min = availableConsumptionDates[0];
                            const max = availableConsumptionDates[availableConsumptionDates.length - 1];
                            if (v < min) return setSelectedConsumptionDate(min);
                            if (v > max) return setSelectedConsumptionDate(max);
                          }
                          setSelectedConsumptionDate(v);
                        }}
                        min={availableConsumptionDates[0] || undefined}
                        max={availableConsumptionDates[availableConsumptionDates.length - 1] || undefined}
                      />
                    </label>
                    <button type="button" className="ghost" onClick={() => {
                      const idx = availableConsumptionDates.indexOf(selectedConsumptionDate);
                      if (idx >= 0 && idx < availableConsumptionDates.length - 1) setSelectedConsumptionDate(availableConsumptionDates[idx + 1]);
                    }} disabled={availableConsumptionDates.indexOf(selectedConsumptionDate) === -1 || availableConsumptionDates.indexOf(selectedConsumptionDate) >= availableConsumptionDates.length - 1}>▶</button>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={compareConsumptionEnabled}
                        onChange={(event) => setCompareConsumptionEnabled(event.target.checked)}
                      />
                      Confronta
                    </label>
                    {compareConsumptionEnabled && (
                      <label>
                        Confronta con
                        <input
                          type="date"
                          value={compareConsumptionDate}
                          onChange={(event) => setCompareConsumptionDate(event.target.value)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="consumption-chart-grid">
                    <div className="hourly-chart" style={{ position: 'relative' }}>
                      {/* overlay lines: max, mid, average */}
                      <div className="hourly-chart-lines">
                        {(() => {
                          const lines = [];
                          const innerHeight = 176; // match .hourly-bars height
                          const pushLine = (value, key, cls, label) => {
                            if (!Number.isFinite(value) || value <= 0) return;
                            const y = Math.max(0, innerHeight - (value / chartMax) * innerHeight);
                            lines.push(
                              <div key={key} className={`chart-line ${cls}`} style={{ top: `${y}px` }}>
                                <span className="chart-line-label">{label} {Number(value).toLocaleString('it-IT', { maximumFractionDigits: 3 })} {consumptionUnitLabel}</span>
                              </div>
                            );
                          };
                          pushLine(dailyChart.peak, 'line-peak', 'line-peak', 'Picco');
                          pushLine(chartMax / 2, 'line-mid', 'line-mid', 'Metà');
                          pushLine(dailyChart.avg, 'line-avg', 'line-avg', 'Media');
                          return lines;
                        })()}
                      </div>
                    {dailyChart.hourly.map((value, hour) => {
                      const compareValue = compareChart.hourly[hour] || 0;
                      const valueHeight = Math.max(2, (value / chartMax) * 170);
                      const compareHeight = Math.max(2, (compareValue / chartMax) * 170);
                      const labelText = `${String(hour).padStart(2, "0")}: ${Number(value || 0).toLocaleString("it-IT")} ${consumptionUnitLabel}`;
                      return (
                        <div className="hourly-chart-col" key={`hour-${hour}`}>
                          <div className="hourly-bars">
                            {compareConsumptionEnabled && compareValue > 0 && (
                              <span className="hourly-bar compare" style={{ height: `${compareHeight}px` }} />
                            )}
                            <span
                              className="hourly-bar main"
                              style={{ height: `${valueHeight}px` }}
                              onMouseEnter={(e) => setHourTooltip({ visible: true, x: e.clientX, y: e.clientY, text: labelText })}
                              onMouseMove={(e) => setHourTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }))}
                              onMouseLeave={() => setHourTooltip({ visible: false, x: 0, y: 0, text: "" })}
                            />
                          </div>
                          <span className="hourly-label">{String(hour).padStart(2, "0")}</span>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  <div className="consumption-kpis">
                    <article>
                      <small>Totale giorno</small>
                      <strong>{dailyChart.total.toLocaleString("it-IT", { maximumFractionDigits: 3 })} {consumptionUnitLabel}</strong>
                    </article>
                    <article>
                      <small>Media oraria</small>
                      <strong>{dailyChart.avg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} {consumptionUnitLabel}</strong>
                    </article>
                    <article>
                      <small>Picco di consumo</small>
                      <strong>{dailyChart.peak.toLocaleString("it-IT", { maximumFractionDigits: 3 })} {consumptionUnitLabel}</strong>
                    </article>
                  </div>
                </section>

                {/* Inserimento manuale rimosso: usare Import/Dettagli per gestire righe consumi */}
                  {/* Import da file/incolla rimosso dalla modal dei consumi */}

                <p className="muted">I consumi dettagliati sono disponibili nella modal "Dettagli".</p>

                {uploadModalOpen && (
                  <div className="modal-backdrop" onClick={() => setUploadModalOpen(false)}>
                    <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                      <h2>Carica consumi</h2>
                      <form className="home-form" onSubmit={uploadDailyConsumptions}>
                        <label>
                          Upload file consumi (XLSX/CSV)
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={(event) => setConsumptionUploadFile(event.target.files?.[0] || null)}
                          />
                        </label>
                        <div className="home-form-actions" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <button type="submit" disabled={!consumptionUploadFile}>Importa consumi</button>
                        </div>
                      </form>

                      <form className="home-form" onSubmit={importPastedConsumptions}>
                        <label>
                          Incolla tabella consumi (da Excel/Sheets)
                          <textarea
                            className="consumption-paste-area"
                            value={consumptionPasteText}
                            onChange={(event) => setConsumptionPasteText(event.target.value)}
                            placeholder="Incolla qui una tabella: supporta colonne data/ora/consumo o formato con ore 00-23"
                          />
                        </label>
                        <div className="home-form-actions">
                          <button type="submit" disabled={!consumptionPasteText.trim()}>Importa da incolla</button>
                        </div>
                      </form>

                              {/* Anteprima import (mostrata qui): */}
                              {pendingImportRows.length > 0 && (
                                <>
                                  <h3>Anteprima righe parse ({pendingImportRows.length})</h3>
                                  <div className="consumption-table-wrap">
                                    <table className="supplies-table consumption-table">
                                      <thead>
                                        <tr>
                                          <th>Giorno</th>
                                          <th>Consumo</th>
                                          <th>Fascia</th>
                                          <th>Note</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pendingImportRows.map((row, index) => (
                                          <tr key={`${row.readingDate}-${row.slot}-${row.consumption}-${index}`}>
                                            <td>{row.readingDate || "-"}</td>
                                            <td>{Number(row.consumption || 0).toLocaleString("it-IT")}</td>
                                            <td>{row.slot || "-"}</td>
                                            <td>{row.notes || "-"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="home-form-actions">
                                    <button type="button" onClick={confirmParsedImport} disabled={!pendingImportRows.length}>Conferma import definitivo</button>
                                    <button type="button" className="ghost" onClick={cancelParsedImport}>Annulla</button>
                                  </div>
                                </>
                              )}

                              <div className="home-form-actions">
                                <button type="button" className="ghost" onClick={() => { setUploadModalOpen(false); setConsumptionUploadFile(null); setConsumptionPasteText(""); }}>Chiudi</button>
                              </div>
                    </section>
                  </div>
                )}

                <div className="home-form-actions">
                  <button type="button" className="ghost" onClick={() => setUploadModalOpen(true)}>Carica consumi</button>
                  <button type="button" className="ghost" onClick={() => { setConsumptionFilterDate(selectedConsumptionDate); setConsumptionPage(1); setDetailsModalOpen(true); }}>Dettagli</button>
                  <button type="button" className="ghost" onClick={closeConsumptionModal}>Chiudi</button>
                </div>
              </section>
            </div>
          )}

          {detailsModalOpen && (
            <div className="modal-backdrop" onClick={() => setDetailsModalOpen(false)}>
              <section className="modal-card" onClick={(event) => event.stopPropagation()}>
                <h2>Dettaglio righe importate ({pendingImportRows.length})</h2>
                <p className="muted">Mostro tutte le righe parse pronte per l'import e i consumi registrati per la fattura.</p>

                <div className="consumption-table-toolbar">
                  <button type="button" className="ghost" onClick={exportSelectedCsv} disabled={!selectedConsumptionRowIds.length}>Export CSV ({selectedConsumptionRowIds.length})</button>
                </div>

                <div className="consumption-table-wrap">
                  <table className="supplies-table consumption-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleVisibleConsumptionSelection}
                            aria-label="Seleziona pagina"
                          />
                        </th>
                        <th onClick={() => toggleConsumptionSort("readingDate")} style={{ cursor: "pointer" }}>
                          Giorno {consumptionSortBy === "readingDate" ? (consumptionSortDir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th onClick={() => toggleConsumptionSort("consumption")} style={{ cursor: "pointer" }}>
                          Consumo {consumptionSortBy === "consumption" ? (consumptionSortDir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th>Fascia</th>
                        <th>Note</th>
                        <th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!currentInvoiceConsumptions.length && (
                        <tr>
                          <td colSpan={6}>Nessun consumo giornaliero registrato.</td>
                        </tr>
                      )}
                      {visibleConsumptions.map((item) => (
                        <Fragment key={item.id}>
                          <tr>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedConsumptionRowIds.includes(item.id)}
                                onChange={() => toggleConsumptionSelection(item.id)}
                                aria-label={`Seleziona riga ${item.id}`}
                              />
                            </td>
                            <td>{formatDateItaly(item.readingDate)}</td>
                            <td>{Number(item.consumption || 0).toLocaleString("it-IT")}</td>
                            <td>{item.slot || "-"}</td>
                            <td>{item.notes || "-"}</td>
                            <td>
                              <div className="home-row-actions">
                                <button className="ghost icon-only-button" title="Modifica consumo" aria-label="Modifica consumo" onClick={() => startEditDailyConsumption(item)}>✏️</button>
                                <button className="danger icon-only-button" title="Elimina consumo" aria-label="Elimina consumo" onClick={() => deleteDailyConsumption(item.id)}>
                                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm8 0h2v9h-2V9zM10 9h2v9h-2V9z" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editingConsumptionRow.id === item.id && (
                            <tr className="consumption-edit-row">
                              <td colSpan={6}>
                                <form className="home-form consumption-inline-edit" onSubmit={saveDailyConsumptionEdit}>
                                  <div className="date-row">
                                    <label>
                                      Giorno
                                      <input
                                        type="date"
                                        value={editingConsumptionRow.readingDate}
                                        onChange={(event) => setEditingConsumptionRow((prev) => ({ ...prev, readingDate: event.target.value }))}
                                        required
                                      />
                                    </label>
                                    <label>
                                      Consumo
                                      <input
                                        type="number"
                                        step="0.001"
                                        value={editingConsumptionRow.consumption}
                                        onChange={(event) => setEditingConsumptionRow((prev) => ({ ...prev, consumption: event.target.value }))}
                                        required
                                      />
                                    </label>
                                  </div>
                                  <div className="date-row">
                                    <label>
                                      Ora/Fascia
                                      <input
                                        value={editingConsumptionRow.slot}
                                        onChange={(event) => setEditingConsumptionRow((prev) => ({ ...prev, slot: event.target.value }))}
                                      />
                                    </label>
                                    <label>
                                      Note
                                      <input
                                        value={editingConsumptionRow.notes}
                                        onChange={(event) => setEditingConsumptionRow((prev) => ({ ...prev, notes: event.target.value }))}
                                      />
                                    </label>
                                  </div>
                                  <div className="home-form-actions">
                                    <button type="submit">Salva riga</button>
                                    <button type="button" className="ghost" onClick={cancelEditDailyConsumption}>Annulla</button>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="consumption-table-actions">
                  <button type="button" className="danger" onClick={deleteSelectedConsumptions} disabled={!selectedConsumptionRowIds.length}>Elimina selezionate ({selectedConsumptionRowIds.length})</button>
                  <div className="consumption-pagination">
                    <button type="button" className="ghost" onClick={() => setConsumptionPage((prev) => Math.max(1, prev - 1))} disabled={consumptionPage <= 1}>Precedente</button>
                    <span>Pagina {consumptionPage} di {totalConsumptionPages}</span>
                    <button type="button" className="ghost" onClick={() => setConsumptionPage((prev) => Math.min(totalConsumptionPages, prev + 1))} disabled={consumptionPage >= totalConsumptionPages}>Successiva</button>
                  </div>
                </div>

                <div className="home-form-actions">
                  <button type="button" className="ghost" onClick={() => setDetailsModalOpen(false)}>Chiudi</button>
                </div>
              </section>
            </div>
          )}

          {hourTooltip.visible && (
            <div className="hourly-tooltip" style={{ position: 'fixed', left: hourTooltip.x + 12, top: hourTooltip.y + 12 }}>
              {hourTooltip.text}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
