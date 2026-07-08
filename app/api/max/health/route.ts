import { NextRequest, NextResponse } from "next/server";
import { getAllChatConfigs } from "../../../../src/config/chats";
import { getEnv } from "../../../../src/utils/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = getEnv("ADMIN_SECRET");
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function parseChatConfigsJson(): { ok: boolean; error?: string } {
  const raw = getEnv("CHAT_CONFIGS_JSON");
  if (!raw) return { ok: true };
  try { JSON.parse(raw); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" }; }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parse = parseChatConfigsJson();
  const configs = Object.values(getAllChatConfigs());
  const configErrors: string[] = [];
  for (const config of configs) {
    if (config.enabled && config.sendTo === "chat" && !config.targetChatId && !getEnv("TARGET_CHAT_ID")) configErrors.push(`${config.chatId}: sendTo=chat, но targetChatId/TARGET_CHAT_ID не настроен`);
    if (config.enabled && config.sendTo === "user" && !config.targetUserId && !getEnv("TARGET_USER_ID")) configErrors.push(`${config.chatId}: sendTo=user, но targetUserId/TARGET_USER_ID не настроен`);
  }
  if (!parse.ok && parse.error) configErrors.push(`CHAT_CONFIGS_JSON: ${parse.error}`);

  return NextResponse.json({
    ok: true,
    env: {
      MAX_BOT_TOKEN: { exists: Boolean(getEnv("MAX_BOT_TOKEN")) },
      MAX_WEBHOOK_SECRET: { exists: Boolean(getEnv("MAX_WEBHOOK_SECRET")) },
      ADMIN_SECRET: { exists: Boolean(getEnv("ADMIN_SECRET")) },
      PUBLIC_WEBHOOK_URL: { exists: Boolean(getEnv("PUBLIC_WEBHOOK_URL")) },
      DATABASE_URL: { exists: Boolean(getEnv("DATABASE_URL")) },
      TARGET_USER_ID: { exists: Boolean(getEnv("TARGET_USER_ID")) },
      TARGET_CHAT_ID: { exists: Boolean(getEnv("TARGET_CHAT_ID")) },
      ADMIN_NOTIFY_UNKNOWN_CHATS: getEnv("ADMIN_NOTIFY_UNKNOWN_CHATS") ?? null,
      CHAT_CONFIGS_JSON: { exists: Boolean(getEnv("CHAT_CONFIGS_JSON")), parse: parse.ok ? "ok" : "error", error: parse.error }
    },
    chatConfigs: configs.map((config) => ({ chatId: config.chatId, name: config.name, mode: config.mode, enabled: config.enabled, sendTo: config.sendTo ?? null, hasTargetChatId: Boolean(config.targetChatId), hasTargetUserId: Boolean(config.targetUserId) })),
    configErrors
  });
}
