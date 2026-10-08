import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractInvoiceTextFromUpload, parseInvoiceText } from "../lib/invoice-parsers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures/invoices");
const expectedPath = path.join(fixturesDir, "expected.json");

const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const pdfFiles = Object.keys(expected).filter((fileName) => fileName.endsWith(".pdf"));

const failures = [];

const pageAwareParsed = parseInvoiceText("Fattura N. 123/2024\nScadenza: 31/12/2024", {
  providerName: "Acme Energia",
  providerParsers: [{
    name: "Acme Energia",
    aliases: ["acme", "acme energia"],
    parserType: "regex",
    config: {
      fields: {
        invoiceNumber: "Fattura\\s*N\\.?\\s*([A-Z0-9/]+)",
        dueDate: "Scadenza\\s*[:#-]?\\s*(\\d{2}\\/\\d{2}\\/\\d{4})",
      },
    },
  }],
  pages: ["Fattura N. 123/2024\nScadenza: 31/12/2024"],
});

if (pageAwareParsed.fields.invoiceNumber !== "123/2024" || pageAwareParsed.fields.dueDate !== "2024-12-31") {
  failures.push({ fileName: "page-aware-mapping", mismatches: [
    `invoiceNumber: expected 123/2024 but got ${String(pageAwareParsed.fields.invoiceNumber || "")}`,
    `dueDate: expected 2024-12-31 but got ${String(pageAwareParsed.fields.dueDate || "")}`,
  ]});
}

for (const fileName of pdfFiles) {
  const filePath = path.join(fixturesDir, fileName);
  const buffer = fs.readFileSync(filePath);
  const text = await extractInvoiceTextFromUpload(buffer, fileName);
  const parsed = parseInvoiceText(text, { providerName: expected[fileName].providerName || "" });
  const expectedEntry = expected[fileName];

  const checks = [
    ["template", parsed.template, expectedEntry.template],
    ["invoiceNumber", parsed.fields.invoiceNumber, expectedEntry.invoiceNumber],
    ["issueDate", parsed.fields.issueDate, expectedEntry.issueDate],
    ["dueDate", parsed.fields.dueDate || "", expectedEntry.dueDate || ""],
    ["amount", Number(parsed.fields.amount ?? 0), Number(expectedEntry.amount ?? 0)],
    ["supplierName", String(parsed.fields.supplierName || ""), String(expectedEntry.supplierName || "")],
  ];

  const mismatches = checks
    .filter(([, actual, expectedValue]) => String(actual).trim() !== String(expectedValue).trim())
    .map(([label, actual, expectedValue]) => `${label}: expected ${String(expectedValue)} but got ${String(actual)}`);

  if (mismatches.length) {
    failures.push({ fileName, mismatches });
  }
}

if (failures.length) {
  console.error("Parser regression check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.fileName}`);
    for (const mismatch of failure.mismatches) {
      console.error(`  • ${mismatch}`);
    }
  }
  process.exit(1);
}

console.log(`Parser regression check passed for ${pdfFiles.length} fixtures.`);
