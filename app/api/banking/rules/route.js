import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { current, database, databaseSetup } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

async function auth(request) {
  const user = await current(request);
  if (!user) return null;
  await databaseSetup();
  await database().query("CREATE TABLE IF NOT EXISTS transaction_categories (id VARCHAR(36) PRIMARY KEY, name VARCHAR(150) NOT NULL, parent_id VARCHAR(36) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  await database().query("CREATE TABLE IF NOT EXISTS transaction_payees (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, category_id VARCHAR(36) NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  await database().query("CREATE TABLE IF NOT EXISTS transaction_rules (id VARCHAR(36) PRIMARY KEY, name VARCHAR(190) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, match_field VARCHAR(30) NOT NULL, match_operator VARCHAR(30) NOT NULL, match_value VARCHAR(255) NOT NULL, action_category_id VARCHAR(36) NULL, action_payee_id VARCHAR(36) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  return user;
}

export async function GET(request) {
  if (!await auth(request)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const [rules] = await database().query("SELECT r.id, r.name, r.active, r.match_field AS matchField, r.match_operator AS matchOperator, r.match_value AS matchValue, r.action_category_id AS categoryId, r.action_payee_id AS payeeId, c.name AS categoryName, p.name AS payeeName FROM transaction_rules r LEFT JOIN transaction_categories c ON c.id = r.action_category_id LEFT JOIN transaction_payees p ON p.id = r.action_payee_id ORDER BY r.created_at DESC");
  return NextResponse.json({ rules });
}

export async function POST(request) {
  const user = await auth(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Solo gli amministratori possono gestire le regole" }, { status: 403 });
  const body = await request.json();
  if (body.apply && body.ruleId && body.accountId) { const [ruleRows] = await database().execute("SELECT * FROM transaction_rules WHERE id = ? AND active = 1", [body.ruleId]); if (!ruleRows.length) return NextResponse.json({ error: "Regola non trovata o disattivata" }, { status: 404 }); const rule = ruleRows[0]; const [transactions] = await database().execute("SELECT id, transaction_date, description, amount FROM bank_transactions WHERE account_id = ?", [body.accountId]); const matches = transactions.filter(item => { const value = rule.match_field === "description" ? String(item.description).toLowerCase() : rule.match_field === "date" ? String(item.transaction_date).slice(0, 10) : Number(item.amount); const expected = rule.match_field === "description" ? rule.match_value.toLowerCase() : rule.match_field === "date" ? rule.match_value : Number(String(rule.match_value).replace(",", ".")); return rule.match_operator === "contains" ? value.includes(expected) : rule.match_operator === "gte" ? value >= expected : rule.match_operator === "lte" ? value <= expected : value === expected; }); if (matches.length) { const placeholders = matches.map(() => "?").join(","); const fields = []; const values = []; if (rule.action_category_id) { fields.push("category_id = ?"); values.push(rule.action_category_id); } if (rule.action_payee_id) { fields.push("payee_id = ?"); values.push(rule.action_payee_id); } if (fields.length) await database().execute(`UPDATE bank_transactions SET ${fields.join(", ")} WHERE id IN (${placeholders})`, [...values, ...matches.map(item => item.id)]); } return NextResponse.json({ applied: matches.length }); }
  if (!body.name?.trim() || !body.matchField || !body.matchOperator || !String(body.matchValue ?? "").trim() || (!body.categoryId && !body.payeeId)) return NextResponse.json({ error: "Compila nome, corrispondenza e almeno un'azione" }, { status: 400 });
  if (!body.name?.trim() || !body.matchField || !body.matchOperator || !String(body.matchValue ?? "").trim() || (!body.categoryId && !body.payeeId)) return NextResponse.json({ error: "Compila nome, corrispondenza e almeno un'azione" }, { status: 400 });
  const id = crypto.randomUUID();
  await database().execute("INSERT INTO transaction_rules (id, name, active, match_field, match_operator, match_value, action_category_id, action_payee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, body.name.trim(), body.active === false ? 0 : 1, body.matchField, body.matchOperator, String(body.matchValue).trim(), body.categoryId || null, body.payeeId || null]);
  return NextResponse.json({ id }, { status: 201 });
}

export async function PUT(request) {
  const user = await auth(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  const body = await request.json();
  await database().execute("UPDATE transaction_rules SET name = ?, active = ?, match_field = ?, match_operator = ?, match_value = ?, action_category_id = ?, action_payee_id = ? WHERE id = ?", [body.name.trim(), body.active ? 1 : 0, body.matchField, body.matchOperator, String(body.matchValue).trim(), body.categoryId || null, body.payeeId || null, body.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await auth(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  await database().execute("DELETE FROM transaction_rules WHERE id = ?", [new URL(request.url).searchParams.get("id")]);
  return NextResponse.json({ ok: true });
}
