import { NextResponse } from "next/server";
import { logout } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export async function POST(request) { await logout(request); const response = NextResponse.json({ ok: true }); response.cookies.delete("generapp_session"); return response; }
