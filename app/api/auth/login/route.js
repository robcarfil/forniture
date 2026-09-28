import { NextResponse } from "next/server";
import { login, sessionCookie } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export async function POST(request) { try { const { username, password } = await request.json(); const result = await login(username, password); if (!result) return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 }); const response = NextResponse.json({ user: result.user }); response.cookies.set(sessionCookie(result.token)); return response; } catch (error) { console.error("Login error:", error); return NextResponse.json({ error: "Errore inizializzazione database" }, { status: 500 }); } }
