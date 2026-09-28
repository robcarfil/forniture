import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { current, database, databaseSetup } from "../../../../lib/auth";
import { transactionKey } from "../../../../lib/transaction-identity";

export const dynamic = "force-dynamic";
async function auth(request) { const user = await current(request); if (!user) return null; await databaseSetup(); return user; }

export async function GET(request) {
  if (!await auth(request)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const url = new URL(request.url); const id = url.searchParams.get("id");
  if (id) { const [rows] = await database().execute("SELECT file_name, mime_type, file_data FROM bank_imports WHERE id = ?", [id]); if (!rows.length) return NextResponse.json({ error: "Caricamento non trovato" }, { status: 404 }); return new Response(rows[0].file_data, { headers: { "Content-Type": rows[0].mime_type || "application/octet-stream", "Content-Disposition": `attachment; filename="${rows[0].file_name.replace(/\"/g, "")}"` } }); }
  const [imports] = await database().query("SELECT i.id, i.account_id AS accountId, i.file_name AS fileName, i.mime_type AS mimeType, i.created_at AS createdAt, a.name AS accountName, COUNT(t.id) AS transactionCount FROM bank_imports i LEFT JOIN bank_accounts a ON a.id = i.account_id LEFT JOIN bank_transactions t ON t.import_id = i.id GROUP BY i.id, i.account_id, i.file_name, i.mime_type, i.created_at, a.name ORDER BY i.created_at DESC");
  return NextResponse.json({ imports });
}

export async function DELETE(request) { const user = await auth(request); if (!user || user.role !== "admin") return NextResponse.json({ error: "Solo gli amministratori possono eliminare caricamenti" }, { status: 403 }); const id = new URL(request.url).searchParams.get("id"); await database().execute("DELETE FROM bank_imports WHERE id = ?", [id]); return NextResponse.json({ ok: true }); }

export async function POST(request) {
  const user = await auth(request); if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await request.json(); const [imports] = await database().execute("SELECT id, account_id, file_name, mime_type, file_data FROM bank_imports WHERE id = ?", [id]); if (!imports.length) return NextResponse.json({ error: "Caricamento non trovato" }, { status: 404 });
  const source = imports[0]; const newImport = crypto.randomUUID(); await database().execute("INSERT INTO bank_imports (id, account_id, file_name, mime_type, file_data) VALUES (?, ?, ?, ?, ?)", [newImport, source.account_id, source.file_name, source.mime_type, source.file_data]);
  const [rows] = await database().execute("SELECT transaction_date, description, amount, category, category_id, payee_id FROM bank_transactions WHERE import_id = ?", [id]); const [existing] = await database().execute("SELECT transaction_date, description, amount FROM bank_transactions WHERE account_id = ?", [source.account_id]); const known = new Set(existing.map(row => transactionKey(row.transaction_date, row.description, row.amount))); let imported = 0;
  for (const row of rows) { const key = transactionKey(row.transaction_date, row.description, row.amount); if (known.has(key)) continue; known.add(key); await database().execute("INSERT INTO bank_transactions (id, account_id, import_id, transaction_date, description, amount, category, category_id, payee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), source.account_id, newImport, row.transaction_date, row.description, row.amount, row.category, row.category_id, row.payee_id]); imported++; }
  return NextResponse.json({ imported, id: newImport });
}
