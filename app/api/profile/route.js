import { NextResponse } from "next/server";
import { current, getProfile, updateProfile } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export async function GET(request) { const user = await current(request); if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 }); return NextResponse.json({ profile: await getProfile(user.id) }); }
export async function PUT(request) { const user = await current(request); if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 }); const body = await request.json(); if (typeof body.firstName !== "string" || typeof body.lastName !== "string" || (body.avatar && body.avatar.length > 2_000_000) || (body.password && body.password.length < 8)) return NextResponse.json({ error: "Controlla i dati inseriti. La password deve avere almeno 8 caratteri." }, { status: 400 }); return NextResponse.json({ profile: await updateProfile(user.id, body) }); }
