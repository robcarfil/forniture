import { NextResponse } from "next/server";
import { APP_NAME, APP_VERSION } from "../../../lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    app: APP_NAME,
    version: APP_VERSION,
    builtAt: new Date().toISOString()
  });
}
