import { NextResponse } from "next/server";
import { current } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request) { try { return NextResponse.json({ user: await current(request) }); } catch (error) { console.error("Session error:", error); return NextResponse.json({ error: "Errore inizializzazione database" }, { status: 500 }); } }
