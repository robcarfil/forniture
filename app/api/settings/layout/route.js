import { NextResponse } from "next/server";
import { current, getAppSettings, saveAppSettings } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request) {
  return NextResponse.json({ settings: await getAppSettings() });
}
export async function PUT(request) {
  const user = await current(request);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  const body = await request.json();
  if (typeof body.name !== "string" || !body.name.trim() || (body.logo && body.logo.length > 2_000_000)) return NextResponse.json({ error: "Nome non valido o logo troppo grande" }, { status: 400 });
  return NextResponse.json({ settings: await saveAppSettings({ logo: body.logo, name: body.name.trim() }) });
}
