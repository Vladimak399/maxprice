import { NextRequest, NextResponse } from "next/server";
import { analyzeWebhookUpdate } from "../../../../src/handlers/maxWebhook";
import { getEnv } from "../../../../src/utils/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean { const secret = getEnv("ADMIN_SECRET"); return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`); }

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const update = await request.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: false, error: "Expected raw MAX update JSON" }, { status: 400 });
  return NextResponse.json({ ok: true, ...analyzeWebhookUpdate(update as Record<string, unknown>) });
}
