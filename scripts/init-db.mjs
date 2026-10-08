import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");

for (const candidate of [path.join(projectRoot, ".env"), path.join(projectRoot, ".env.local")]) {
  if (!fs.existsSync(candidate)) continue;

  for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").replace(/^['"]|['"]$/g, "");
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

for (const candidate of [path.join(projectRoot, ".env.local")]) {
  if (!fs.existsSync(candidate)) continue;

  for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

const config = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "generapp",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "forniture"
};

const statements = [
  "CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY, username VARCHAR(190) UNIQUE NOT NULL, password TEXT NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'user', active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, first_name VARCHAR(100) NULL, last_name VARCHAR(100) NULL, avatar MEDIUMTEXT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS bank_accounts (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, initial_balance DECIMAL(15,2) NOT NULL DEFAULT 0, currency VARCHAR(3) NOT NULL DEFAULT 'EUR', active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS bank_imports (id VARCHAR(36) PRIMARY KEY, account_id VARCHAR(36) NOT NULL, file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(150), file_data MEDIUMBLOB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS bank_transactions (id VARCHAR(36) PRIMARY KEY, account_id VARCHAR(36) NOT NULL, import_id VARCHAR(36) NULL, transaction_date DATE NOT NULL, description VARCHAR(500) NOT NULL, amount DECIMAL(15,2) NOT NULL, category VARCHAR(100) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE, FOREIGN KEY (import_id) REFERENCES bank_imports(id) ON DELETE SET NULL)",
  "CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value MEDIUMTEXT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS homes (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, address VARCHAR(255) NULL, notes TEXT NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, photo_mime VARCHAR(150) NULL, photo_data MEDIUMBLOB NULL)",
  "CREATE TABLE IF NOT EXISTS utility_providers (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, utility_type VARCHAR(20) NOT NULL, contact VARCHAR(255) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, logo MEDIUMTEXT NULL)",
  "CREATE TABLE IF NOT EXISTS home_supplies (id VARCHAR(36) PRIMARY KEY, home_id VARCHAR(36) NOT NULL, provider_id VARCHAR(36) NOT NULL, supply_type VARCHAR(20) NOT NULL, label VARCHAR(190) NOT NULL, contract_code VARCHAR(120) NULL, pod_pdr VARCHAR(120) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, offer_name VARCHAR(190) NULL, offer_expiry DATE NULL, payment_method VARCHAR(120) NULL, bill_delivery_method VARCHAR(120) NULL, associated_email VARCHAR(190) NULL, associated_power VARCHAR(120) NULL, contract_type VARCHAR(120) NULL, billing_address VARCHAR(255) NULL, tariff VARCHAR(190) NULL, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE, FOREIGN KEY (provider_id) REFERENCES utility_providers(id) ON DELETE RESTRICT)",
  "CREATE TABLE IF NOT EXISTS supply_invoices (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, invoice_number VARCHAR(120) NOT NULL, issue_date DATE NULL, due_date DATE NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'da_pagare', notes TEXT NULL, attachment_name VARCHAR(255) NULL, attachment_mime VARCHAR(150) NULL, attachment_data MEDIUMBLOB NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, consumption DECIMAL(12,3) NULL, consumption_unit VARCHAR(20) NULL, start_date DATE NULL, end_date DATE NULL, parser_confidence DECIMAL(5,4) NULL, FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS invoice_consumptions (id VARCHAR(36) PRIMARY KEY, invoice_id VARCHAR(36) NOT NULL, reading_date DATE NOT NULL, consumption DECIMAL(12,3) NOT NULL, slot VARCHAR(40) NOT NULL DEFAULT '', notes VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_invoice_day_slot (invoice_id, reading_date, slot), FOREIGN KEY (invoice_id) REFERENCES supply_invoices(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS supply_consumptions (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, reading_date DATE NOT NULL, consumption DECIMAL(12,3) NOT NULL, slot VARCHAR(40) NOT NULL DEFAULT '', notes VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_supply_day_slot (supply_id, reading_date, slot), FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS home_documents (id VARCHAR(36) PRIMARY KEY, home_id VARCHAR(36) NOT NULL, document_name VARCHAR(255) NOT NULL, document_type VARCHAR(50) NOT NULL, document_mime VARCHAR(150) NULL, document_data MEDIUMBLOB NULL, upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS supply_documents (id VARCHAR(36) PRIMARY KEY, supply_id VARCHAR(36) NOT NULL, document_name VARCHAR(255) NOT NULL, document_type VARCHAR(50) NOT NULL, document_mime VARCHAR(150) NULL, document_data MEDIUMBLOB NULL, upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supply_id) REFERENCES home_supplies(id) ON DELETE CASCADE)"
];

function hash(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(value, salt, 64).toString("hex")}`;
}

async function main() {
  const connection = await mysql.createConnection(config);

  try {
    for (const statement of statements) {
      await connection.execute(statement);
    }

    const username = process.env.APP_ADMIN_USERNAME || "admin";
    const password = process.env.APP_ADMIN_PASSWORD || "Password123!";
    const [userRows] = await connection.execute("SELECT COUNT(*) AS total FROM users");
    const userCount = Number(userRows[0].total || 0);

    if (userCount === 0) {
      await connection.execute("INSERT INTO users (id, username, password, role, active) VALUES (?, ?, ?, 'admin', 1)", [crypto.randomUUID(), username, hash(password)]);
      console.log(`Default admin created: ${username}`);
    } else {
      console.log("Users already exist. Default admin not created.");
    }

    console.log(`Database initialized successfully: ${config.database}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Database initialization failed:", error.message);
  process.exit(1);
});
