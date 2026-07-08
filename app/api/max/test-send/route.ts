import { NextRequest, NextResponse } from "next/server";
import { MaxApiError, sendMessage } from "../../../../src/max/client";
import { getEnv } from "../../../../src/utils/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { targetChatId?: string; targetUserId?: string; text?: string };
function authorized(request: NextRequest): boolean { const secret = getEnv("ADMIN_SECRET"); return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`); }

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Body;
  const targetChatId = body.targetChatId?.trim() || getEnv("TARGET_CHAT_ID");
  const targetUserId = body.targetUserId?.trim() || getEnv("TARGET_USER_ID");
  const target = targetChatId ? { chatId: targetChatId } : targetUserId ? { userId: targetUserId } : {};
  if (!target.chatId && !target.userId) return NextResponse.json({ ok: false, error: "No target configured" }, { status: 400 });
  try {
    await sendMessage(target, body.text?.trim() || "✅ MAX test-send работает");
    return NextResponse.json({ ok: true, targetType: target.chatId ? "chat" : "user", targetProvided: Boolean(body.targetChatId || body.targetUserId) });
  } catch (error) {
    if (error instanceof MaxApiError) return NextResponse.json({ ok: false, error: "MAX API error", status: error.status, body: error.body.slice(0, 2000) }, { status: 502 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
