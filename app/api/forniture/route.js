import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { current, database, databaseSetup } from "../../../lib/auth";
import { setupSuppliesSchema } from "../../../lib/supplies";

export const dynamic = "force-dynamic";

function normalizeType(value) {
  const allowed = new Set(["GAS", "ACQUA", "LUCE", "RIFIUTI"]);
  const type = String(value || "").toUpperCase();
  return allowed.has(type) ? type : null;
}

function parseAttachment(attachment) {
  if (!attachment || !attachment.data || !attachment.name) return null;

  const raw = String(attachment.data);
  const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
  return {
    name: String(attachment.name).slice(0, 255),
    mime: String(attachment.mime || "application/octet-stream").slice(0, 150),
    data: Buffer.from(base64, "base64")
  };
}

function parsePhoto(photo) {
  if (!photo || !photo.data) return null;

  const raw = String(photo.data);
  const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
  return {
    mime: String(photo.mime || "image/jpeg").slice(0, 150),
    data: Buffer.from(base64, "base64")
  };
}

function normalizeLogo(value) {
  if (!value) return null;
  const logo = String(value);
  if (!logo.startsWith("data:image/")) return null;
  if (logo.length > 2_000_000) return null;
  return logo;
}

function normalizeConsumptionUnit(value) {
  if (value === undefined || value === null) return null;
  const unit = String(value).trim();
  return unit ? unit.slice(0, 20) : null;
}

const consumptionUnitsByType = {
  GAS: ["Smc", "m3"],
  ACQUA: ["m3", "L"],
  LUCE: ["kWh"],
  RIFIUTI: ["kg", "L"]
};

function normalizeConsumptionUnitForType(supplyType, value) {
  const unit = normalizeConsumptionUnit(value);
  if (!unit) return null;
  const allowed = consumptionUnitsByType[supplyType] || [];
  const match = allowed.find((item) => item.toLowerCase() === unit.toLowerCase());
  return match || null;
}

function validateConsumptionByType(supplyType, consumption, consumptionUnit) {
  const hasConsumption = !(consumption === "" || consumption === undefined || consumption === null);
  const normalizedUnit = normalizeConsumptionUnitForType(supplyType, consumptionUnit);
  if (hasConsumption && !normalizedUnit) {
    const allowed = (consumptionUnitsByType[supplyType] || []).join("/");
    return { error: `Unita consumo non valida per ${supplyType}. Valori consentiti: ${allowed}` };
  }
  if (!hasConsumption && normalizeConsumptionUnit(consumptionUnit)) {
    return { error: "Inserisci un consumo numerico quando imposti l'unita" };
  }
  return {
    hasConsumption,
    normalizedUnit
  };
}

function normalizeDailySlot(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, 40);
}

function safeParseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeParserConfig(config = {}) {
  if (!config || typeof config !== "object") return { fields: {}, aliases: [] };

  const next = { ...config };
  delete next.visualMap;
  delete next.pageCount;

  if (next.fields && typeof next.fields === "object") {
    next.fields = Object.fromEntries(
      Object.entries(next.fields).flatMap(([fieldName, fieldValue]) => {
        if (typeof fieldValue === "string") {
          const pattern = fieldValue.trim();
          return pattern ? [[fieldName, pattern]] : [];
        }
        if (fieldValue && typeof fieldValue === "object" && typeof fieldValue.pattern === "string") {
          const pattern = fieldValue.pattern.trim();
          return pattern ? [[fieldName, pattern]] : [];
        }
        return [];
      })
    );
  } else {
    next.fields = {};
  }

  if (Array.isArray(next.aliases)) {
    next.aliases = next.aliases.filter(Boolean);
  }

  return next;
}

function parseDailyConsumption(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const check = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return check === value;
}

async function resolveSupplyLabel(db, providerId, supplyType) {
  const [rows] = await db.execute("SELECT name FROM utility_providers WHERE id = ?", [providerId]);
  const providerName = rows[0]?.name ? String(rows[0].name).trim() : "";
  return providerName ? `${supplyType} - ${providerName}` : `Fornitura ${supplyType}`;
}

function supplyFields(body, supplyType) {
  return {
    offerName: body.offerName?.trim() || null,
    offerExpiry: body.offerExpiry || null,
    paymentMethod: body.paymentMethod?.trim() || null,
    billDeliveryMethod: body.billDeliveryMethod?.trim() || null,
    associatedEmail: body.associatedEmail?.trim() || null,
    associatedPower: supplyType === "LUCE" ? (body.associatedPower?.trim() || null) : null,
    contractType: body.contractType?.trim() || null,
    billingAddress: body.billingAddress?.trim() || null,
    tariff: body.tariff?.trim() || null
  };
}

async function auth(request) {
  const user = await current(request);
  if (!user) return null;
  await databaseSetup();
  await setupSuppliesSchema();
  return user;
}

export async function GET(request) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const db = database();
  const url = new URL(request.url);
  const entity = url.searchParams.get('entity');

  // support server-side paginated fetch for supplyConsumptions
  if (entity === 'supplyConsumption') {
    const supplyId = url.searchParams.get('supplyId');
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const perPage = parseInt(url.searchParams.get('perPage') || '50', 10) || 50;
    if (!supplyId) return NextResponse.json({ error: 'supplyId missing' }, { status: 400 });
    const offset = (page - 1) * perPage;
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM supply_consumptions WHERE supply_id = ?', [supplyId]);
    const [rows] = await db.query('SELECT id, supply_id AS supplyId, reading_date AS readingDate, consumption, slot, notes, created_at AS createdAt FROM supply_consumptions WHERE supply_id = ? ORDER BY reading_date DESC, slot ASC, created_at DESC LIMIT ? OFFSET ?', [supplyId, perPage, offset]);
    return NextResponse.json({ rows, total: Number(total || 0), page, perPage });
  }

  const [homes] = await db.query(
    "SELECT id, name, address, notes, active, photo_mime AS photoMime, created_at AS createdAt FROM homes ORDER BY name"
  );
  const [providers] = await db.query(
    "SELECT id, name, utility_type AS utilityType, contact, logo, active, created_at AS createdAt FROM utility_providers ORDER BY name"
  );
  const [providerParsers] = await db.query(
    "SELECT id, provider_id AS providerId, name, parser_type AS parserType, aliases, config, is_default AS isDefault, active, created_at AS createdAt FROM provider_parsers ORDER BY provider_id, name"
  );
  const providersWithParsers = (providers || []).map((provider) => ({
    ...provider,
    parsers: (providerParsers || [])
      .filter((parser) => parser.providerId === provider.id)
      .map((parser) => ({
        ...parser,
        aliases: safeParseJson(parser.aliases),
        config: safeParseJson(parser.config),
      }))
  }));
  const [supplies] = await db.query(
    "SELECT s.id, s.home_id AS homeId, s.provider_id AS providerId, s.supply_type AS supplyType, s.label, s.contract_code AS contractCode, s.pod_pdr AS podPdr, s.offer_name AS offerName, s.offer_expiry AS offerExpiry, s.payment_method AS paymentMethod, s.bill_delivery_method AS billDeliveryMethod, s.associated_email AS associatedEmail, s.associated_power AS associatedPower, s.contract_type AS contractType, s.billing_address AS billingAddress, s.tariff, s.active, s.created_at AS createdAt, h.name AS homeName, p.name AS providerName FROM home_supplies s JOIN homes h ON h.id = s.home_id JOIN utility_providers p ON p.id = s.provider_id ORDER BY h.name, s.supply_type, s.label"
  );
  const [invoices] = await db.query(
    "SELECT i.id, i.supply_id AS supplyId, i.invoice_number AS invoiceNumber, i.issue_date AS issueDate, i.due_date AS dueDate, i.amount, i.consumption, i.consumption_unit AS consumptionUnit, i.start_date AS startDate, i.end_date AS endDate, i.parser_confidence AS parserConfidence, i.status, i.notes, i.attachment_name AS attachmentName, i.attachment_mime AS attachmentMime, i.created_at AS createdAt, s.label AS supplyLabel, s.supply_type AS supplyType, h.name AS homeName, p.name AS providerName, CASE WHEN i.attachment_data IS NULL THEN 0 ELSE 1 END AS hasAttachment FROM supply_invoices i JOIN home_supplies s ON s.id = i.supply_id JOIN homes h ON h.id = s.home_id JOIN utility_providers p ON p.id = s.provider_id ORDER BY i.issue_date DESC, i.created_at DESC"
  );
  const [invoiceConsumptions] = await db.query(
    "SELECT c.id, c.invoice_id AS invoiceId, c.reading_date AS readingDate, c.consumption, c.slot, c.notes, c.created_at AS createdAt FROM invoice_consumptions c ORDER BY c.reading_date DESC, c.slot ASC, c.created_at DESC"
  );

  const [supplyConsumptions] = await db.query(
    "SELECT c.id, c.supply_id AS supplyId, c.reading_date AS readingDate, c.consumption, c.slot, c.notes, c.created_at AS createdAt FROM supply_consumptions c ORDER BY c.reading_date DESC, c.slot ASC, c.created_at DESC"
  );

  const [homeDocuments] = await db.query(
    "SELECT id, home_id AS homeId, document_name AS documentName, document_type AS documentType, document_mime AS documentMime, upload_date AS uploadDate, created_at AS createdAt, CASE WHEN document_data IS NULL THEN 0 ELSE 1 END AS hasData FROM home_documents ORDER BY upload_date DESC, created_at DESC"
  );

  const [supplyDocuments] = await db.query(
    "SELECT id, supply_id AS supplyId, document_name AS documentName, document_type AS documentType, document_mime AS documentMime, upload_date AS uploadDate, created_at AS createdAt, CASE WHEN document_data IS NULL THEN 0 ELSE 1 END AS hasData FROM supply_documents ORDER BY upload_date DESC, created_at DESC"
  );

  return NextResponse.json({
    homes,
    providers: providersWithParsers,
    providerParsers: (providerParsers || []).map((parser) => ({
      ...parser,
      aliases: safeParseJson(parser.aliases),
      config: safeParseJson(parser.config),
    })),
    supplies,
    invoices,
    invoiceConsumptions,
    supplyConsumptions,
    homeDocuments,
    supplyDocuments
  });
}

export async function POST(request) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await request.json();
  const db = database();

  if (body.entity === "home") {
    if (!body.name?.trim()) return NextResponse.json({ error: "Nome casa obbligatorio" }, { status: 400 });
    const id = crypto.randomUUID();
    const photo = parsePhoto(body.photo);
    await db.execute(
      "INSERT INTO homes (id, name, address, notes, active, photo_mime, photo_data) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, body.name.trim(), body.address?.trim() || null, body.notes?.trim() || null, body.active === false ? 0 : 1, photo?.mime || null, photo?.data || null]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "provider") {
    const utilityType = normalizeType(body.utilityType);
    if (!body.name?.trim() || !utilityType) return NextResponse.json({ error: "Fornitore non valido" }, { status: 400 });
    const id = crypto.randomUUID();
    const logo = normalizeLogo(body.logo);
    if (body.logo && !logo) return NextResponse.json({ error: "Logo non valido" }, { status: 400 });
    await db.execute(
      "INSERT INTO utility_providers (id, name, utility_type, contact, logo, active) VALUES (?, ?, ?, ?, ?, ?)",
      [id, body.name.trim(), utilityType, body.contact?.trim() || null, logo, body.active === false ? 0 : 1]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "providerParser") {
    if (!body.providerId) return NextResponse.json({ error: "Fornitore non valido" }, { status: 400 });
    const [providerRows] = await db.execute("SELECT id FROM utility_providers WHERE id = ?", [body.providerId]);
    if (!providerRows[0]?.id) return NextResponse.json({ error: "Fornitore non trovato" }, { status: 400 });

    const name = String(body.name || "Nuovo parser").trim() || "Nuovo parser";
    const aliases = Array.isArray(body.aliases) ? body.aliases : String(body.aliases || "").split(",").map((item) => item.trim()).filter(Boolean);
    const config = body.config && typeof body.config === "object" ? body.config : safeParseJson(body.config);
    const normalisedConfig = normalizeParserConfig({ ...config, aliases: aliases.length ? aliases : (config.aliases || []) });

    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO provider_parsers (id, provider_id, name, parser_type, aliases, config, is_default, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        body.providerId,
        name.slice(0, 190),
        String(body.parserType || "regex").slice(0, 40),
        JSON.stringify(aliases),
        JSON.stringify(normalisedConfig),
        body.isDefault === true ? 1 : 0,
        body.active === false ? 0 : 1,
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "supply") {
    const supplyType = normalizeType(body.supplyType);
    if (!body.homeId || !body.providerId || !supplyType) {
      return NextResponse.json({ error: "Fornitura non valida" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const label = await resolveSupplyLabel(db, body.providerId, supplyType);
    const extra = supplyFields(body, supplyType);
    await db.execute(
      "INSERT INTO home_supplies (id, home_id, provider_id, supply_type, label, contract_code, pod_pdr, offer_name, offer_expiry, payment_method, bill_delivery_method, associated_email, associated_power, contract_type, billing_address, tariff, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        body.homeId,
        body.providerId,
        supplyType,
        label,
        body.contractCode?.trim() || null,
        body.podPdr?.trim() || null,
        extra.offerName,
        extra.offerExpiry,
        extra.paymentMethod,
        extra.billDeliveryMethod,
        extra.associatedEmail,
        extra.associatedPower,
        extra.contractType,
        extra.billingAddress,
        extra.tariff,
        body.active === false ? 0 : 1
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "invoice") {
    if (!body.supplyId || !body.invoiceNumber?.trim()) {
      return NextResponse.json({ error: "Fattura non valida" }, { status: 400 });
    }

    const [supplyRows] = await db.execute("SELECT supply_type AS supplyType FROM home_supplies WHERE id = ?", [body.supplyId]);
    const supplyType = String(supplyRows[0]?.supplyType || "").toUpperCase();
    if (!supplyType) {
      return NextResponse.json({ error: "Fornitura non trovata" }, { status: 400 });
    }

    const consumptionValidation = validateConsumptionByType(supplyType, body.consumption, body.consumptionUnit);
    if (consumptionValidation.error) {
      return NextResponse.json({ error: consumptionValidation.error }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const attachment = parseAttachment(body.attachment);
    const parserConfidenceRaw = body.parserConfidence;
    const parserConfidence = parserConfidenceRaw === undefined || parserConfidenceRaw === null || parserConfidenceRaw === ""
      ? null
      : Number(parserConfidenceRaw);

    await db.execute(
      "INSERT INTO supply_invoices (id, supply_id, invoice_number, issue_date, due_date, amount, consumption, consumption_unit, start_date, end_date, parser_confidence, status, notes, attachment_name, attachment_mime, attachment_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        body.supplyId,
        body.invoiceNumber.trim(),
        body.issueDate || null,
        body.dueDate || null,
        Number(body.amount || 0),
        consumptionValidation.hasConsumption ? Number(body.consumption) : null,
        consumptionValidation.normalizedUnit,
        body.startDate ? body.startDate : null,
        body.endDate ? body.endDate : null,
        Number.isFinite(parserConfidence) ? parserConfidence : null,
        body.status || "da_pagare",
        body.notes?.trim() || null,
        attachment?.name || null,
        attachment?.mime || null,
        attachment?.data || null
      ]
    );

    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "invoiceConsumption") {
    if (!body.invoiceId) {
      return NextResponse.json({ error: "Fattura non valida per consumo" }, { status: 400 });
    }

    const [invoiceRows] = await db.execute("SELECT id FROM supply_invoices WHERE id = ?", [body.invoiceId]);
    if (!invoiceRows[0]?.id) {
      return NextResponse.json({ error: "Fattura non trovata" }, { status: 400 });
    }

    if (Array.isArray(body.rows)) {
      if (!body.rows.length) {
        return NextResponse.json({ error: "Nessun consumo da importare" }, { status: 400 });
      }

      const fallbackDate = isValidIsoDate(body.baseDate) ? String(body.baseDate) : "";

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      for (const row of body.rows) {
        const readingDateRaw = row.readingDate ? String(row.readingDate).slice(0, 10) : "";
        const readingDate = isValidIsoDate(readingDateRaw) ? readingDateRaw : fallbackDate;
        const dailyConsumption = parseDailyConsumption(row.consumption);
        if (!readingDate || dailyConsumption === null) {
          skipped += 1;
          continue;
        }
        const slot = normalizeDailySlot(row.slot);
        const notes = row.notes ? String(row.notes).trim().slice(0, 255) : null;

        try {
          await db.execute(
            "INSERT INTO invoice_consumptions (id, invoice_id, reading_date, consumption, slot, notes) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE consumption = VALUES(consumption), notes = VALUES(notes)",
            [crypto.randomUUID(), body.invoiceId, readingDate, dailyConsumption, slot, notes]
          );
          imported += 1;
        } catch {
          errors += 1;
        }
      }

      if (!imported && (skipped || errors)) {
        return NextResponse.json(
          { error: `Import non riuscito: righe valide 0, scartate ${skipped}, errori ${errors}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ imported, skipped, errors }, { status: 201 });
    }

    const readingDate = body.readingDate ? String(body.readingDate).slice(0, 10) : "";
    const dailyConsumption = parseDailyConsumption(body.consumption);
    if (!readingDate || !isValidIsoDate(readingDate) || dailyConsumption === null) {
      return NextResponse.json({ error: "Data e consumo giornaliero sono obbligatori" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO invoice_consumptions (id, invoice_id, reading_date, consumption, slot, notes) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE consumption = VALUES(consumption), notes = VALUES(notes)",
      [
        id,
        body.invoiceId,
        readingDate,
        dailyConsumption,
        normalizeDailySlot(body.slot),
        body.notes?.trim()?.slice(0, 255) || null
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "supplyConsumption") {
    if (!body.supplyId) {
      return NextResponse.json({ error: "Fornitura non valida per consumo" }, { status: 400 });
    }

    const [supplyRows] = await db.execute("SELECT id FROM home_supplies WHERE id = ?", [body.supplyId]);
    if (!supplyRows[0]?.id) {
      return NextResponse.json({ error: "Fornitura non trovata" }, { status: 400 });
    }

    if (Array.isArray(body.rows)) {
      if (!body.rows.length) {
        return NextResponse.json({ error: "Nessun consumo da importare" }, { status: 400 });
      }

      const fallbackDate = isValidIsoDate(body.baseDate) ? String(body.baseDate) : "";

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      for (const row of body.rows) {
        const readingDateRaw = row.readingDate ? String(row.readingDate).slice(0, 10) : "";
        const readingDate = isValidIsoDate(readingDateRaw) ? readingDateRaw : fallbackDate;
        const dailyConsumption = parseDailyConsumption(row.consumption);
        if (!readingDate || dailyConsumption === null) {
          skipped += 1;
          continue;
        }
        const slot = normalizeDailySlot(row.slot);
        const notes = row.notes ? String(row.notes).trim().slice(0, 255) : null;

        try {
          await db.execute(
            "INSERT INTO supply_consumptions (id, supply_id, reading_date, consumption, slot, notes) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE consumption = VALUES(consumption), notes = VALUES(notes)",
            [crypto.randomUUID(), body.supplyId, readingDate, dailyConsumption, slot, notes]
          );
          imported += 1;
        } catch {
          errors += 1;
        }
      }

      if (!imported && (skipped || errors)) {
        return NextResponse.json(
          { error: `Import non riuscito: righe valide 0, scartate ${skipped}, errori ${errors}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ imported, skipped, errors }, { status: 201 });
    }

    const readingDate = body.readingDate ? String(body.readingDate).slice(0, 10) : "";
    const dailyConsumption = parseDailyConsumption(body.consumption);
    if (!readingDate || !isValidIsoDate(readingDate) || dailyConsumption === null) {
      return NextResponse.json({ error: "Data e consumo giornaliero sono obbligatori" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO supply_consumptions (id, supply_id, reading_date, consumption, slot, notes) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE consumption = VALUES(consumption), notes = VALUES(notes)",
      [
        id,
        body.supplyId,
        readingDate,
        dailyConsumption,
        normalizeDailySlot(body.slot),
        body.notes?.trim()?.slice(0, 255) || null
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "homeDocument") {
    if (!body.homeId || !body.documentName) {
      return NextResponse.json({ error: "Home e nome documento obbligatori" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const document = parseAttachment(body.document);
    
    await db.execute(
      "INSERT INTO home_documents (id, home_id, document_name, document_type, document_mime, document_data) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        body.homeId,
        body.documentName.slice(0, 255),
        body.documentType?.slice(0, 50) || "altro",
        document?.mime || null,
        document?.data || null
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  if (body.entity === "supplyDocument") {
    if (!body.supplyId || !body.documentName) {
      return NextResponse.json({ error: "Fornitura e nome documento obbligatori" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const document = parseAttachment(body.document);
    
    await db.execute(
      "INSERT INTO supply_documents (id, supply_id, document_name, document_type, document_mime, document_data) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        body.supplyId,
        body.documentName.slice(0, 255),
        body.documentType?.slice(0, 50) || "altro",
        document?.mime || null,
        document?.data || null
      ]
    );
    return NextResponse.json({ id }, { status: 201 });
  }

  return NextResponse.json({ error: "Operazione non supportata" }, { status: 400 });
}

export async function PUT(request) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await request.json();
  const db = database();

  if (body.entity === "home") {
    if (!body.id || !body.name?.trim()) {
      return NextResponse.json({ error: "Casa non valida" }, { status: 400 });
    }
    const photo = parsePhoto(body.photo);
    if (photo) {
      await db.execute(
        "UPDATE homes SET name = ?, address = ?, notes = ?, active = ?, photo_mime = ?, photo_data = ? WHERE id = ?",
        [body.name.trim(), body.address?.trim() || null, body.notes?.trim() || null, body.active === false ? 0 : 1, photo.mime, photo.data, body.id]
      );
    } else {
      await db.execute(
        "UPDATE homes SET name = ?, address = ?, notes = ?, active = ? WHERE id = ?",
        [body.name.trim(), body.address?.trim() || null, body.notes?.trim() || null, body.active === false ? 0 : 1, body.id]
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "supplyConsumption") {
    if (!body.id) return NextResponse.json({ error: "Consumo non valido" }, { status: 400 });
    const readingDate = body.readingDate ? String(body.readingDate).slice(0, 10) : "";
    const dailyConsumption = parseDailyConsumption(body.consumption);
    if (!readingDate || dailyConsumption === null) {
      return NextResponse.json({ error: "Data e consumo giornaliero sono obbligatori" }, { status: 400 });
    }
    await db.execute(
      "UPDATE supply_consumptions SET reading_date = ?, consumption = ?, slot = ?, notes = ? WHERE id = ?",
      [readingDate, dailyConsumption, normalizeDailySlot(body.slot), body.notes?.trim()?.slice(0, 255) || null, body.id]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "provider") {
    const utilityType = normalizeType(body.utilityType);
    if (!body.id || !body.name?.trim() || !utilityType) {
      return NextResponse.json({ error: "Fornitore non valido" }, { status: 400 });
    }
    const logo = normalizeLogo(body.logo);
    if (body.logo && !logo) return NextResponse.json({ error: "Logo non valido" }, { status: 400 });
    await db.execute(
      "UPDATE utility_providers SET name = ?, utility_type = ?, contact = ?, logo = ?, active = ? WHERE id = ?",
      [body.name.trim(), utilityType, body.contact?.trim() || null, logo, body.active === false ? 0 : 1, body.id]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "providerParser") {
    if (!body.id || !body.providerId) {
      return NextResponse.json({ error: "Parser non valido" }, { status: 400 });
    }
    const [parserRows] = await db.execute("SELECT id FROM provider_parsers WHERE id = ?", [body.id]);
    if (!parserRows[0]?.id) {
      return NextResponse.json({ error: "Parser non trovato" }, { status: 400 });
    }

    const aliases = Array.isArray(body.aliases) ? body.aliases : String(body.aliases || "").split(",").map((item) => item.trim()).filter(Boolean);
    const config = body.config && typeof body.config === "object" ? body.config : safeParseJson(body.config);
    const normalisedConfig = normalizeParserConfig({ ...config, aliases: aliases.length ? aliases : (config.aliases || []) });

    await db.execute(
      "UPDATE provider_parsers SET name = ?, parser_type = ?, aliases = ?, config = ?, is_default = ?, active = ? WHERE id = ?",
      [
        String(body.name || "Nuovo parser").trim().slice(0, 190),
        String(body.parserType || "regex").slice(0, 40),
        JSON.stringify(aliases),
        JSON.stringify(normalisedConfig),
        body.isDefault === true ? 1 : 0,
        body.active === false ? 0 : 1,
        body.id,
      ]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "supply") {
    const supplyType = normalizeType(body.supplyType);
    if (!body.id || !body.homeId || !body.providerId || !supplyType) {
      return NextResponse.json({ error: "Fornitura non valida" }, { status: 400 });
    }
    const label = await resolveSupplyLabel(db, body.providerId, supplyType);
    const extra = supplyFields(body, supplyType);
    await db.execute(
      "UPDATE home_supplies SET home_id = ?, provider_id = ?, supply_type = ?, label = ?, contract_code = ?, pod_pdr = ?, offer_name = ?, offer_expiry = ?, payment_method = ?, bill_delivery_method = ?, associated_email = ?, associated_power = ?, contract_type = ?, billing_address = ?, tariff = ?, active = ? WHERE id = ?",
      [
        body.homeId,
        body.providerId,
        supplyType,
        label,
        body.contractCode?.trim() || null,
        body.podPdr?.trim() || null,
        extra.offerName,
        extra.offerExpiry,
        extra.paymentMethod,
        extra.billDeliveryMethod,
        extra.associatedEmail,
        extra.associatedPower,
        extra.contractType,
        extra.billingAddress,
        extra.tariff,
        body.active === false ? 0 : 1,
        body.id
      ]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "invoice") {
    if (!body.id || !body.supplyId || !body.invoiceNumber?.trim()) {
      return NextResponse.json({ error: "Fattura non valida" }, { status: 400 });
    }

    const [supplyRows] = await db.execute("SELECT supply_type AS supplyType FROM home_supplies WHERE id = ?", [body.supplyId]);
    const supplyType = String(supplyRows[0]?.supplyType || "").toUpperCase();
    if (!supplyType) {
      return NextResponse.json({ error: "Fornitura non trovata" }, { status: 400 });
    }

    const consumptionValidation = validateConsumptionByType(supplyType, body.consumption, body.consumptionUnit);
    if (consumptionValidation.error) {
      return NextResponse.json({ error: consumptionValidation.error }, { status: 400 });
    }

    const attachment = parseAttachment(body.attachment);
    const removeAttachment = body.removeAttachment === true;
    const parserConfidenceRaw = body.parserConfidence;
    const parserConfidence = parserConfidenceRaw === undefined || parserConfidenceRaw === null || parserConfidenceRaw === ""
      ? null
      : Number(parserConfidenceRaw);

    const baseParams = [
      body.supplyId,
      body.invoiceNumber.trim(),
      body.issueDate || null,
      body.dueDate || null,
      Number(body.amount || 0),
      consumptionValidation.hasConsumption ? Number(body.consumption) : null,
      consumptionValidation.normalizedUnit,
      body.startDate ? body.startDate : null,
      body.endDate ? body.endDate : null,
      Number.isFinite(parserConfidence) ? parserConfidence : null,
      body.status || "da_pagare",
      body.notes?.trim() || null
    ];

    if (attachment) {
      await db.execute(
        "UPDATE supply_invoices SET supply_id = ?, invoice_number = ?, issue_date = ?, due_date = ?, amount = ?, consumption = ?, consumption_unit = ?, start_date = ?, end_date = ?, parser_confidence = ?, status = ?, notes = ?, attachment_name = ?, attachment_mime = ?, attachment_data = ? WHERE id = ?",
        [...baseParams, attachment.name, attachment.mime, attachment.data, body.id]
      );
    } else if (removeAttachment) {
      await db.execute(
        "UPDATE supply_invoices SET supply_id = ?, invoice_number = ?, issue_date = ?, due_date = ?, amount = ?, consumption = ?, consumption_unit = ?, start_date = ?, end_date = ?, parser_confidence = ?, status = ?, notes = ?, attachment_name = NULL, attachment_mime = NULL, attachment_data = NULL WHERE id = ?",
        [...baseParams, body.id]
      );
    } else {
      await db.execute(
        "UPDATE supply_invoices SET supply_id = ?, invoice_number = ?, issue_date = ?, due_date = ?, amount = ?, consumption = ?, consumption_unit = ?, start_date = ?, end_date = ?, parser_confidence = ?, status = ?, notes = ? WHERE id = ?",
        [...baseParams, body.id]
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "invoiceStatus") {
    await db.execute("UPDATE supply_invoices SET status = ? WHERE id = ?", [body.status || "da_pagare", body.id]);
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "invoiceConsumption") {
    if (!body.id) {
      return NextResponse.json({ error: "Consumo non valido" }, { status: 400 });
    }
    const readingDate = body.readingDate ? String(body.readingDate).slice(0, 10) : "";
    const dailyConsumption = parseDailyConsumption(body.consumption);
    if (!readingDate || dailyConsumption === null) {
      return NextResponse.json({ error: "Data e consumo giornaliero sono obbligatori" }, { status: 400 });
    }
    await db.execute(
      "UPDATE invoice_consumptions SET reading_date = ?, consumption = ?, slot = ?, notes = ? WHERE id = ?",
      [readingDate, dailyConsumption, normalizeDailySlot(body.slot), body.notes?.trim()?.slice(0, 255) || null, body.id]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Aggiornamento non supportato" }, { status: 400 });
}

export async function DELETE(request) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id");
  if (!entity || !id) return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });

  const table = entity === "home"
    ? "homes"
    : entity === "provider"
      ? "utility_providers"
      : entity === "providerParser"
        ? "provider_parsers"
        : entity === "supply"
          ? "home_supplies"
          : entity === "invoice"
            ? "supply_invoices"
            : entity === "invoiceConsumption"
              ? "invoice_consumptions"
            : entity === "supplyConsumption"
              ? "supply_consumptions"
            : entity === "homeDocument"
              ? "home_documents"
            : entity === "supplyDocument"
              ? "supply_documents"
            : null;

  if (!table) return NextResponse.json({ error: "Entita non valida" }, { status: 400 });

  await database().execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  return NextResponse.json({ ok: true });
}
