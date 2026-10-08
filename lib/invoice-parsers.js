const DEFAULT_TEMPLATE = "generic-italian";

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

function normalizeProviderToken(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(text = "") {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeFieldRules(value = {}) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([fieldName, fieldRule]) => {
      const pattern = typeof fieldRule === "string"
        ? fieldRule.trim()
        : fieldRule && typeof fieldRule === "object" && typeof fieldRule.pattern === "string"
          ? fieldRule.pattern.trim()
          : "";

      return pattern ? [[fieldName, pattern]] : [];
    })
  );
}

function parseCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let cleaned = raw.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    cleaned = cleaned.replace(new RegExp(`\\${thousandSeparator}`, "g"), "");
    cleaned = cleaned.replace(decimalSeparator, ".");
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts.length > 1 && parts[1].length <= 2) {
      cleaned = `${parts[0]}.${parts[1]}`;
    }
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateStrict(value) {
  if (!value && value !== 0) return null;
  const text = String(value).trim();
  if (!text) return null;

  const patterns = [
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const [, a, b, c] = match;
    if (pattern.source.startsWith("(\\d{4}")) {
      const year = Number(a);
      const month = Number(b);
      const day = Number(c);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } else {
      const day = Number(a);
      const month = Number(b);
      const third = Number(c);
      const year = third < 100 ? (third >= 50 ? 1900 + third : 2000 + third) : third;

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }

      const swappedMonth = Number(a);
      const swappedDay = Number(b);
      if (swappedMonth >= 1 && swappedMonth <= 12 && swappedDay >= 1 && swappedDay <= 31) {
        return `${year}-${String(swappedMonth).padStart(2, "0")}-${String(swappedDay).padStart(2, "0")}`;
      }
    }
  }

  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) {
    return `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-${String(iso.getDate()).padStart(2, "0")}`;
  }

  return null;
}

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
  }
  return "";
}

function extractNumberFromPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1] || match[0];
      if (value) return parseCurrency(value);
    }
  }
  return null;
}

function getTemplateScores(text) {
  const normalized = normalizeText(text);
  const templates = [
    {
      name: "standard-italian-invoice",
      patterns: [
        /fattura/i,
        /data\s+(emissione|fattura)/i,
        /totale/i,
        /iva/i,
        /codice\s+fiscale/i,
      ],
    },
    {
      name: "generic-italian",
      patterns: [
        /fornitore|emittente/i,
        /importo|totale/i,
        /numero\s*(fattura|invoice)/i,
      ],
    },
  ];

  return templates.map((template) => {
    let score = 0;
    for (const pattern of template.patterns) {
      if (pattern.test(normalized)) score += 1;
    }
    return { ...template, score };
  });
}

function parseInvoiceLineKeys(text) {
  const normalized = normalizeText(text);

  const invoiceNumber = extractFirstMatch(normalized, [
    /(?:documento|fattura|invoice)\s*(?:n(?:\.|°|umero)?|numero)?\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
    /fattura\s*(?:n(?:\.|°|umero)?|no\.?|numero)\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
    /(?:numero\s*(?:fattura|documento)|n\.?\s*fattura|invoice\s*no\.?|bill\s*no\.?)\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
    /(?:numero|n\.?)[^\n]{0,12}(?:fattura|invoice)\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
  ]);

  const issueDate = extractFirstMatch(normalized, [
    /(?:data\s*(?:emissione|fattura)|issued\s*date|date\s*of\s*issue)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:emessa\s*il|data\s*emessa\s*il|emissione\s*il)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ]);

  const dueDate = extractFirstMatch(normalized, [
    /(?:scadenza|due\s*date|payment\s*due)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
  ]);

  const amount = extractFirstMatch(normalized, [
    /(?:totale\s*(?:da\s*pagare|fattura|documento|dovuta)|amount\s*due|total\s*amount|importo\s*totale)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
    /(?:totale|amount|importo)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
  ]);

  const vat = extractFirstMatch(normalized, [
    /(?:iva|vat)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
  ]);

  const supplier = extractFirstMatch(normalized, [
    /(?:fornitore|emittente|vendor|supplier)\s*[:#-]?\s*([A-Za-z0-9À-ÿ&.,'\-/ ]{3,120})/i,
  ]) || normalized.match(/^([A-ZÀ-ÖØ-Þ0-9&.,'\-/ ]{8,}?)(?=\s+(?:documento|fattura|invoice|data|importo|scadenza))/i)?.[1] || "";

  const customer = extractFirstMatch(normalized, [
    /(?:cliente|customer|destinatario)\s*[:#-]?\s*([A-Za-z0-9À-ÿ&.,'\-/ ]{3,120})/i,
  ]);

  return {
    invoiceNumber: invoiceNumber || "",
    issueDate: issueDate ? parseDateStrict(issueDate) : "",
    dueDate: dueDate ? parseDateStrict(dueDate) : "",
    amount: amount ? parseCurrency(amount) : null,
    vat: vat ? parseCurrency(vat) : null,
    supplierName: supplier ? supplier.replace(/\s+/g, " ").trim().toUpperCase() : "",
    customerName: customer ? customer.replace(/\s+/g, " ").trim() : "",
  };
}

function normalizeProviderParserDefinitions(providerParsers = []) {
  const entries = Array.isArray(providerParsers) ? providerParsers : [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const config = entry.config && typeof entry.config === "object" ? entry.config : {};
      const aliases = Array.isArray(entry.aliases) ? entry.aliases : (Array.isArray(config.aliases) ? config.aliases : []);
      return {
        id: entry.id || entry.name || "custom-parser",
        name: entry.name || config.name || "Custom parser",
        aliases: aliases.filter(Boolean),
        parserType: entry.parserType || config.parserType || "regex",
        fields: normalizeFieldRules(config.fields || {}),
      };
    })
    .filter(Boolean);
}

function applyRegexFieldRules(rawText, baseFields, rules = {}) {
  const fields = { ...baseFields };
  for (const [fieldName, fieldRule] of Object.entries(rules || {})) {
    const pattern = typeof fieldRule === "string" ? fieldRule : (fieldRule && typeof fieldRule === "object" ? fieldRule.pattern : "");
    if (!pattern) continue;

    try {
      const match = rawText.match(new RegExp(pattern, "i"));
      if (!match) continue;
      const value = match[1] || match[0];
      if (!value) continue;

      if (fieldName === "amount") {
        fields.amount = parseCurrency(value);
      } else if (fieldName === "issueDate" || fieldName === "dueDate") {
        fields[fieldName] = parseDateStrict(value) || fields[fieldName] || "";
      } else if (fieldName === "supplierName") {
        fields.supplierName = String(value).replace(/\s+/g, " ").trim().toUpperCase();
      } else {
        fields[fieldName] = String(value).replace(/\s+/g, " ").trim();
      }
    } catch {
      // ignore invalid custom extractor patterns.
    }
  }
  return fields;
}

export function getInvoiceParserRegistry() {
  return [
    {
      name: "enel-energia",
      aliases: ["enel", "enel energia", "enelenergia"],
      extract(text, baseFields) {
        const raw = normalizeText(text);
        return {
          ...baseFields,
          invoiceNumber: baseFields.invoiceNumber || extractFirstMatch(raw, [
            /(?:fattura|invoice|documento)\s*(?:n\.?|numero)?\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
            /n\.?\s*\d{1,4}\/\d{2,4}/i,
          ]) || "",
          issueDate: baseFields.issueDate || extractFirstMatch(raw, [
            /(?:data\s*emissione|emessa\s*il|data\s*fattura)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ]) ? parseDateStrict(extractFirstMatch(raw, [
            /(?:data\s*emissione|emessa\s*il|data\s*fattura)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ])) : "",
          dueDate: baseFields.dueDate || extractFirstMatch(raw, [
            /(?:scadenza|data\s*scadenza)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ]) ? parseDateStrict(extractFirstMatch(raw, [
            /(?:scadenza|data\s*scadenza)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ])) : "",
          amount: baseFields.amount ?? extractNumberFromPatterns(raw, [
            /(?:totale\s*fattura|totale\s*da\s*pagare|importo\s*totale|amount\s*due)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
          ]),
          supplierName: (baseFields.supplierName || "Enel Energia").toUpperCase(),
        };
      },
    },
    {
      name: "a2a",
      aliases: ["a2a", "a2a energia", "a2a service", "a2a spa"],
      extract(text, baseFields) {
        const raw = normalizeText(text);
        return {
          ...baseFields,
          invoiceNumber: baseFields.invoiceNumber || extractFirstMatch(raw, [
            /(?:fattura|invoice)\s*(?:n\.?|numero)?\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
          ]) || "",
          issueDate: baseFields.issueDate || extractFirstMatch(raw, [
            /(?:data\s*fattura|data\s*emissione|emessa\s*il)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ]) ? parseDateStrict(extractFirstMatch(raw, [
            /(?:data\s*fattura|data\s*emissione|emessa\s*il)\s*[:#-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
          ])) : "",
          amount: baseFields.amount ?? extractNumberFromPatterns(raw, [
            /(?:importo\s*totale|totale\s*fattura|totale|amount)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
          ]),
          supplierName: (baseFields.supplierName || "A2A").toUpperCase(),
        };
      },
    },
    {
      name: "acquedotto",
      aliases: ["acquedotto", "acqua", "water", "acea", "a2a acquedotto"],
      extract(text, baseFields) {
        const raw = normalizeText(text);
        return {
          ...baseFields,
          invoiceNumber: baseFields.invoiceNumber || extractFirstMatch(raw, [
            /(?:n\.\s*fattura|numero\s*fattura|documento\s*n\.?|bill\s*no\.?)\s*[:#-]?\s*([A-Z0-9\/\-\.]+)/i,
          ]) || "",
          amount: baseFields.amount ?? extractNumberFromPatterns(raw, [
            /(?:importo\s*totale|totale\s*fattura|totale\s*da\s*pagare|amount)\s*[:#-]?\s*([A-Za-z]{0,5}\s*[€£$]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
          ]),
          supplierName: (baseFields.supplierName || "Acquedotto").toUpperCase(),
        };
      },
    },
  ];
}

export function resolveInvoiceParser(providerName = "", text = "", providerParsers = []) {
  const normalizedText = normalizeText(text);
  const providerKey = normalizeProviderToken(providerName);
  const customParsers = normalizeProviderParserDefinitions(providerParsers);

  const customMatch = customParsers.find((parser) => {
    if (!parser.aliases?.length && !providerName) return false;
    const aliases = parser.aliases.map(normalizeProviderToken);
    return aliases.some((alias) => {
      if (!alias) return false;
      return providerKey && (providerKey.includes(alias) || alias.includes(providerKey));
    });
  });

  if (customMatch) {
    return {
      name: customMatch.name,
      aliases: customMatch.aliases,
      extract(textValue, baseFields) {
        return applyRegexFieldRules(normalizeText(textValue), baseFields, customMatch.fields || {});
      },
    };
  }

  const matches = getInvoiceParserRegistry().filter((parser) => {
    if (!parser.aliases?.length) return false;
    return parser.aliases.some((alias) => {
      const aliasKey = normalizeProviderToken(alias);
      return providerKey && (providerKey.includes(aliasKey) || aliasKey.includes(providerKey));
    });
  });

  if (matches.length) {
    return matches[0];
  }

  const genericKeywords = ["enel", "a2a", "acqua", "acea", "gdf", "suez", "italgas", "gas", "energia", "fornitore"];
  const textKey = normalizeProviderToken(normalizedText);
  const keywordMatch = genericKeywords.find((keyword) => textKey.includes(keyword));
  if (keywordMatch) {
    const parser = getInvoiceParserRegistry().find((item) => item.aliases.some((alias) => normalizeProviderToken(alias).includes(keywordMatch)));
    return parser || null;
  }

  return null;
}

export function detectInvoiceTemplate(text, templateHint = "", providerName = "", providerParsers = []) {
  if (templateHint) {
    return { name: templateHint, score: 1 };
  }

  const providerParser = resolveInvoiceParser(providerName, text, providerParsers);
  if (providerParser) {
    return { name: providerParser.name, score: 1 };
  }

  const normalized = normalizeText(text);
  const hasSupplierContext = /(fornitore|emittente|societa|azienda|client)/i.test(normalized);
  const hasStructuredVat = /(codice fiscale|partita iva|p\.iva)/i.test(normalized);
  const hasItalianInvoiceContext = /(data\s*(emissione|fattura)|importo\s*totale|totale\s*da\s*pagare)/i.test(normalized);

  if (hasItalianInvoiceContext && !hasStructuredVat && hasSupplierContext) {
    return { name: "generic-italian", score: 0.9 };
  }

  const scores = getTemplateScores(normalized);
  const best = scores.sort((a, b) => b.score - a.score)[0] || { name: DEFAULT_TEMPLATE, score: 0 };
  return best.score > 0 ? best : { name: DEFAULT_TEMPLATE, score: 0.35 };
}

export function parseInvoiceText(text, options = {}) {
  const normalizedText = normalizeText(text);
  const providerParsers = Array.isArray(options.providerParsers) ? options.providerParsers : [];
  const pageTexts = Array.isArray(options.pages) ? options.pages.map((pageText) => normalizeText(pageText)) : [];
  const template = detectInvoiceTemplate(normalizedText, options.templateHint || "", options.providerName || "", providerParsers);
  const baseFields = parseInvoiceLineKeys(normalizedText);
  const providerParser = resolveInvoiceParser(options.providerName || "", normalizedText, providerParsers);
  const fields = providerParser ? providerParser.extract(normalizedText, baseFields, pageTexts) : baseFields;

  return {
    template: template.name,
    confidence: Math.min(0.99, 0.5 + (template.score || 0) * 0.1 + (fields.invoiceNumber || fields.amount ? 0.2 : 0)),
    fields: {
      ...fields,
      rawTextPreview: normalizedText.slice(0, 1000),
    },
  };
}

async function extractTextFromPdfBuffer(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableWorker: false,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return {
    text: pages.join("\n\n"),
    pages,
  };
}

export async function extractInvoiceTextAndPagesFromUpload(buffer, fileName = "invoice") {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Nessun contenuto del file disponibile");
  }

  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return extractTextFromPdfBuffer(buffer);
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return { text, pages: [text] };
}

export async function extractInvoiceTextFromUpload(buffer, fileName = "invoice") {
  const { text } = await extractInvoiceTextAndPagesFromUpload(buffer, fileName);
  return text;
}

export function createParserRefinementPlan(samples = []) {
  return {
    procedure: [
      "1. raccogli un campione di PDF reali per ogni fornitore o layout.",
      "2. annota i valori attesi dei campi principali: numero, data, importo, IVA, fornitore.",
      "3. esegui il parser e confronta con i dati attesi.",
      "4. identifica i pattern che falliscono e aggiungi nuove regole di matching.",
      "5. aggiungi una nuova entry al registry dei parser o una nuova regola nel parser generico.",
      "6. esegui la suite di test sui campioni ed escludi eventuali false positives.",
      "7. versiona il parser e mantieni un changelog per i miglioramenti.",
    ],
    sampleCount: Array.isArray(samples) ? samples.length : 0,
    templateHint: "Create one parser per supplier/layout and store sample fixtures for regression testing.",
  };
}
