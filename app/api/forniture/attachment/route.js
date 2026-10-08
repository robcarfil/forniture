import { NextResponse } from "next/server";
import { current, database, databaseSetup } from "../../../../lib/auth";
import { setupSuppliesSchema } from "../../../../lib/supplies";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await current(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  await databaseSetup();
  await setupSuppliesSchema();

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const type = url.searchParams.get("type") || "invoice";
  const preview = url.searchParams.get("preview") === "1";
  if (!id) return NextResponse.json({ error: "Id mancante" }, { status: 400 });

  let query, fileName;
  if (type === "document") {
    query = "SELECT document_name AS documentName, document_mime AS documentMime, document_data AS documentData FROM home_documents WHERE id = ?";
    fileName = "documento";
  } else if (type === "home") {
    query = "SELECT photo_mime AS photoMime, photo_data AS photoData FROM homes WHERE id = ?";
    fileName = "foto-casa";
  } else if (type === "supply-document") {
    query = "SELECT document_name AS documentName, document_mime AS documentMime, document_data AS documentData FROM supply_documents WHERE id = ?";
    fileName = "documento-fornitura";
  } else {
    query = "SELECT attachment_name AS attachmentName, attachment_mime AS attachmentMime, attachment_data AS attachmentData FROM supply_invoices WHERE id = ?";
    fileName = "fattura";
  }

  const [rows] = await database().execute(query, [id]);

  const row = rows[0];
  const dataField = type === "home" ? "photoData" : (type === "document" || type === "supply-document") ? "documentData" : "attachmentData";
  const nameField = (type === "document" || type === "supply-document") ? "documentName" : "attachmentName";
  const mimeField = type === "home" ? "photoMime" : (type === "document" || type === "supply-document") ? "documentMime" : "attachmentMime";
  
  if (!row || !row[dataField]) return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });

  return new NextResponse(row[dataField], {
    status: 200,
    headers: {
      "Content-Type": row[mimeField] || "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename=\"${(row[nameField] || fileName).replace(/\"/g, "")}\"`
    }
  });
}
