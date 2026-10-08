#!/usr/bin/env node
// scripts/import_consumptions.js
// Usage: node scripts/import_consumptions.js <file.xlsx> <invoiceId> [baseDate]

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function normalizeHourSlot(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{1,2}$/.test(raw)) {
    const hour = Number(raw);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return String(hour).padStart(2, '0');
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const hour = Number(raw.split(':')[0]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return String(hour).padStart(2, '0');
  }
  return raw.slice(0, 40);
}

function parseIsoFromUnknownDate(value) {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  let str = String(value).trim();
  // remove weekday abbreviations like 'ven ' or 'lun '
  str = str.replace(/^\s*(lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun)\b[\s\-,.]*/i, '');
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const normalized = str.replace(/[.]/g, '/');
  const parts = normalized.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d && m && y) return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function parseImportedNumber(value) {
  if (value === '' || value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
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
    const value = String(cell || '').trim();
    return value || `col_${index}`;
  });
  return matrix.slice(1)
    .map((line) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = Array.isArray(line) ? (line[index] ?? '') : '';
      });
      return row;
    })
    .filter((row) => Object.values(row).some((value) => String(value || '').trim() !== ''));
}

function parseConsumptionsFromData(matrix, rows, fallbackDate) {
  // Prefer table format: first column = date, following columns headers '00'..'23'
  const mapped = [];
  const headerRow = Array.isArray(matrix[0]) ? matrix[0].map((h) => String(h || '').trim()) : [];
  const hourCols = headerRow
    .map((h, idx) => ({ idx, key: h }))
    .filter(({ key }) => /^0\d$|^1\d$|^2[0-3]$/.test(String(key || '').trim()));

  if (hourCols.length) {
    for (let r = 1; r < matrix.length; r += 1) {
      const line = Array.isArray(matrix[r]) ? matrix[r] : [];
      const rawDate = line[0];
      const isoDate = parseIsoFromUnknownDate(rawDate) || fallbackDate;
      if (!isoDate) continue;
      for (const hc of hourCols) {
        const headerKey = String(headerRow[hc.idx] || '').trim().padStart(2, '0');
        const rawVal = line[hc.idx];
        const consumption = parseImportedNumber(rawVal);
        if (consumption === null) continue;
        mapped.push({ readingDate: isoDate, consumption, slot: headerKey, notes: '' });
      }
    }
  } else {
    // Fallback to previous flexible parsing
    let currentDate = '';
    for (const row of rows) {
      const entries = Object.entries(row);
      const findValue = (patterns, fallbackIndex = -1) => {
        for (const [key, val] of entries) {
          const normalized = String(key).toLowerCase();
          if (patterns.some((pattern) => normalized.includes(pattern))) return val;
        }
        return fallbackIndex >= 0 ? entries[fallbackIndex]?.[1] : undefined;
      };

      const explicitDate = parseIsoFromUnknownDate(findValue(['data', 'giorno', 'date'], 0));
      if (explicitDate) currentDate = explicitDate;
      const readingDate = explicitDate || currentDate || fallbackDate;
      if (!readingDate) continue;

      const notes = String(findValue(['note', 'descrizione', 'descr'], -1) || '').trim();

      const hourColumns = entries.filter(([key]) => isHourHeader(key));
      if (hourColumns.length) {
        for (const [hourKey, rawValue] of hourColumns) {
          const consumption = parseImportedNumber(rawValue);
          if (consumption === null) continue;
          mapped.push({ readingDate, consumption, slot: normalizeHourSlot(hourKey), notes });
        }
        continue;
      }

      const consumption = parseImportedNumber(findValue(['consumo', 'kwh', 'smc', 'm3', 'quantita', 'qta'], 1));
      const rawHour = findValue(['ora', 'hour'], -1);
      const rawSlot = findValue(['fascia', 'slot', 'periodo'], 2);
      const slot = normalizeHourSlot(rawHour !== undefined ? rawHour : rawSlot);
      if (consumption === null) continue;
      mapped.push({ readingDate, consumption, slot, notes });
    }
  }

  const dedupKey = (item) => `${item.readingDate}|${item.slot || ''}|${item.consumption}|${item.notes || ''}`;
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

function usageExit() {
  console.error('Usage: node scripts/import_consumptions.js <file.xlsx> <invoiceId> [baseDate: YYYY-MM-DD]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usageExit();
  const [filePathArg, invoiceId, baseDateArg] = args;
  const filePathFull = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(filePathFull)) {
    console.error('File not found:', filePathFull);
    process.exit(2);
  }

  const workbook = XLSX.readFile(filePathFull, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const fallbackDate = baseDateArg || '';
  const parsed = parseConsumptionsFromData(matrix, rows, fallbackDate);

  const output = {
    invoiceId,
    baseDate: fallbackDate,
    parsedCount: parsed.length,
    rows: parsed
  };

  const outPath = path.resolve(process.cwd(), `tmp/consumi_import_${invoiceId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
