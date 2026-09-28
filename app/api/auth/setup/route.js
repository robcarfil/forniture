import { NextResponse } from "next/server";
import { createFirstAdmin, needsSetup } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ needsSetup: await needsSetup() }); }
export async function POST(request) { try { const { username, password } = await request.json(); const user = await createFirstAdmin(username, password); return NextResponse.json({ user }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error.message === "INVALID_SETUP" ? "Inserisci uno username e una password di almeno 8 caratteri" : "Il primo amministratore è già stato creato" }, { status: 400 }); } }
