import { database } from "./auth";

export async function setupSuppliesSchema() {
  const db = database();

  await db.query(
    "CREATE TABLE IF NOT EXISTS homes (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, address VARCHAR(255) NULL, notes TEXT NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  try {
    await db.query("ALTER TABLE homes ADD COLUMN photo_mime VARCHAR(150) NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await db.query("ALTER TABLE homes ADD COLUMN photo_data MEDIUMBLOB NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  await db.query(
    "CREATE TABLE IF NOT EXISTS utility_providers (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, utility_type VARCHAR(20) NOT NULL, contact VARCHAR(255) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  try {
    await db.query("ALTER TABLE utility_providers ADD COLUMN logo MEDIUMTEXT NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  await db.query(
    "CREATE TABLE IF NOT EXISTS provider_parsers (id VARCHAR(36) PRIMARY KEY, provider_id VARCHAR(36) NOT NULL, name VARCHAR(190) NOT NULL, parser_type VARCHAR(40) NOT NULL DEFAULT 'regex', aliases JSON NULL, config JSON NOT NULL, is_default TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (provider_id) REFERENCES utility_providers(id) ON DELETE CASCADE)"
  );

  await db.query(
    "CREATE TABLE IF NOT EXISTS home_supplies (id VARCHAR(36) PRIMARY KEY, home_id VARCHAR(36) NOT NULL, provider_id VARCHAR(36) NOT NULL, supply_type VARCHAR(20) NOT NULL, label VARCHAR(190) NOT NULL, contract_code VARCHAR(120) NULL, pod_pdr VARCHAR(120) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE, FOREIGN KEY (provider_id) REFERENCES utility_providers(id) ON DELETE RESTRICT)"
  );

  for (const column of [
    "offer_name VARCHAR(190) NULL",
    "offer_expiry DATE NULL",
    "payment_method VARCHAR(120) NULL",
    "bill_delivery_method VARCHAR(120) NULL",
    "associated_email VARCHAR(190) NULL",
    "associated_power VARCHAR(120) NULL",
    "contract_type VARCHAR(120) NULL",
    "billing_address VARCHAR(255) NULL",
    "tariff VARCHAR(190) NULL"
  ]) {
    try {
      await db.query(`ALTER TABLE home_supplies ADD COLUMN ${column}`);
    } catch (error) {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  await db.query(
    "CREATE TABLE IF NOT EXISTS supply_invoices (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, invoice_number VARCHAR(120) NOT NULL, issue_date DATE NULL, due_date DATE NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'da_pagare', notes TEXT NULL, attachment_name VARCHAR(255) NULL, attachment_mime VARCHAR(150) NULL, attachment_data MEDIUMBLOB NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)"
  );

  try {
    await db.query("ALTER TABLE supply_invoices ADD COLUMN consumption DECIMAL(12,3) NULL AFTER amount");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await db.query("ALTER TABLE supply_invoices ADD COLUMN consumption_unit VARCHAR(20) NULL AFTER consumption");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await db.query("ALTER TABLE supply_invoices ADD COLUMN start_date DATE NULL AFTER consumption_unit");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await db.query("ALTER TABLE supply_invoices ADD COLUMN end_date DATE NULL AFTER start_date");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await db.query("ALTER TABLE supply_invoices ADD COLUMN parser_confidence DECIMAL(5,4) NULL AFTER end_date");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }

  await db.query(
    "CREATE TABLE IF NOT EXISTS invoice_consumptions (id VARCHAR(36) PRIMARY KEY, invoice_id VARCHAR(36) NOT NULL, reading_date DATE NOT NULL, consumption DECIMAL(12,3) NOT NULL, slot VARCHAR(40) NOT NULL DEFAULT '', notes VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_invoice_day_slot (invoice_id, reading_date, slot), FOREIGN KEY (invoice_id) REFERENCES supply_invoices(id) ON DELETE CASCADE)"
  );

  await db.query(
    "CREATE TABLE IF NOT EXISTS supply_consumptions (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, reading_date DATE NOT NULL, consumption DECIMAL(12,3) NOT NULL, slot VARCHAR(40) NOT NULL DEFAULT '', notes VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_supply_day_slot (supply_id, reading_date, slot), FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)"
  );

  await db.query(
    "CREATE TABLE IF NOT EXISTS home_documents (id VARCHAR(36) PRIMARY KEY, home_id VARCHAR(36) NOT NULL, document_name VARCHAR(255) NOT NULL, document_type VARCHAR(50) NOT NULL, document_mime VARCHAR(150) NULL, document_data MEDIUMBLOB NULL, upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE)"
  );

  await db.query(
    "CREATE TABLE IF NOT EXISTS supply_documents (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, document_name VARCHAR(255) NOT NULL, document_type VARCHAR(50) NOT NULL, document_mime VARCHAR(150) NULL, document_data MEDIUMBLOB NULL, upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)"
  );
}
