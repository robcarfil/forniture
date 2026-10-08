import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const fixtureDir = path.join(projectRoot, "fixtures", "invoices");

fs.mkdirSync(fixtureDir, { recursive: true });

function createPdfFile(outputPath, lines) {
  const streamText = lines
    .map((line) => {
      const escaped = String(line)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/\r/g, "");
      return `BT /F1 12 Tf 72 ${720 - lines.indexOf(line) * 24} Td (${escaped}) Tj ET`;
    })
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(streamText, "utf8")} >>\nstream\n${streamText}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  fs.writeFileSync(outputPath, pdf, "binary");
}

const fixtures = [
  {
    fileName: "enel-sample.pdf",
    lines: [
      "ENEL ENERGIA",
      "Fattura n. 2024/12345",
      "Data emissione: 12/04/2024",
      "Scadenza: 12/05/2024",
      "Totale da pagare: EUR 245,50"
    ]
  },
  {
    fileName: "a2a-sample.pdf",
    lines: [
      "A2A ENERGIA",
      "Fattura 2024/98765",
      "Data fattura: 03/01/2024",
      "Importo totale: 189,90 EUR",
      "Fornitore: A2A Energia"
    ]
  },
  {
    fileName: "generic-sample.pdf",
    lines: [
      "SOCIETA FORNITRICE SRL",
      "Documento n. FR-2401",
      "Data emissione: 09/02/2024",
      "Importo totale 875,00",
      "IVA 175,00"
    ]
  }
];

for (const fixture of fixtures) {
  createPdfFile(path.join(fixtureDir, fixture.fileName), fixture.lines);
  console.log(`Created ${fixture.fileName}`);
}

console.log(`Invoice fixtures generated in ${fixtureDir}`);
