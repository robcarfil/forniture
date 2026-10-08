import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { current } from "../../../../lib/auth";

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
  let str = String(value || "").trim();
  // remove common weekday abbreviations that may prefix the date (e.g. 'ven 04/09/2026')
  str = str.replace(/^\s*(lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun)\b[\s\-,.]*/i, "");
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

function isHourHeader(value) {
  const normalized = normalizeHourSlot(value);
  return /^\d{2}$/.test(normalized);
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
  // New behavior: expect matrix with first column = date and columns 00..23 as hours
  const mapped = [];
  const headerRow = Array.isArray(matrix[0]) ? matrix[0].map((h) => String(h || "").trim()) : [];

  // Find hour columns: headers that are 00..23
  const hourCols = headerRow
    .map((h, idx) => ({ idx, key: h }))
    .filter(({ key, idx }) => {
      const k = String(key || "").trim();
      return /^0\d$|^1\d$|^2[0-3]$/.test(k);
    });

  // If no hour columns found, fall back to older parsing
  if (!hourCols.length) {
    // reuse previous flexible parsing: try to detect date-columns pattern
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
          mapped.push({ readingDate: column.date, consumption, slot, notes: "" });
        }
      }
    }
    // then fallback to object-rows parsing
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

      const explicitDate = parseIsoFromUnknownDate(findValue(["data", "giorno", "date"], 0));
      if (explicitDate) currentDate = explicitDate;
      const readingDate = explicitDate || currentDate || fallbackDate;
      if (!readingDate) continue;

      const notes = String(findValue(["note", "descrizione", "descr"], -1) || "").trim();

      const hourColumns = entries.filter(([key]) => isHourHeader(key));
      if (hourColumns.length) {
        for (const [hourKey, rawValue] of hourColumns) {
          const consumption = parseImportedNumber(rawValue);
          if (consumption === null) continue;
          mapped.push({ readingDate, consumption, slot: normalizeHourSlot(hourKey), notes });
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

  // Parse table with first column date and hour columns
  for (let r = 1; r < matrix.length; r += 1) {
    const line = Array.isArray(matrix[r]) ? matrix[r] : [];
    const rawDate = line[0];
    const isoDate = parseIsoFromUnknownDate(rawDate) || fallbackDate;
    if (!isoDate) continue;
    for (const hc of hourCols) {
      const headerKey = String(headerRow[hc.idx] || "").trim().padStart(2, "0");
      const rawVal = line[hc.idx];
      const consumption = parseImportedNumber(rawVal);
      if (consumption === null) continue;
      mapped.push({ readingDate: isoDate, consumption, slot: headerKey, notes: "" });
    }
  }

  // dedupe and return
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

export async function POST(request) {
  const user = await current(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const baseDate = String(form.get("baseDate") || "");
    if (!file || !file.stream) return NextResponse.json({ error: "File mancante" }, { status: 400 });
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const parsed = parseConsumptionsFromData(matrix, rows, baseDate || "");
    return NextResponse.json({ parsedCount: parsed.length, rows: parsed });
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
