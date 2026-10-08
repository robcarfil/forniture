import { NextResponse } from "next/server";
import { current } from "../../../../lib/auth";
import {
  extractInvoiceTextAndPagesFromUpload,
  detectInvoiceTemplate,
  parseInvoiceText,
} from "../../../../lib/invoice-parsers";

export const dynamic = "force-dynamic";

function normalizeProviderParsers(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request) {
  const user = await current(request);
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const templateHint = String(form.get("templateHint") || "").trim();
    const providerName = String(form.get("providerName") || form.get("supplierName") || "").trim();
    const providerParsers = normalizeProviderParsers(form.get("providerParsers"));

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractInvoiceTextAndPagesFromUpload(buffer, file.name || "invoice");
    const text = extraction?.text || "";
    const template = detectInvoiceTemplate(text, templateHint, providerName, providerParsers);
    const parsed = parseInvoiceText(text, {
      templateHint: template?.name || templateHint,
      providerName,
      providerParsers,
      pages: extraction?.pages || [text],
    });

    return NextResponse.json({
      ok: true,
      template: parsed.template,
      confidence: parsed.confidence,
      fields: parsed.fields,
      rawTextPreview: text.slice(0, 2500),
      pages: extraction?.pages || [text],
    });
  } catch (error) {
    console.error("Invoice parse error:", error);
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
