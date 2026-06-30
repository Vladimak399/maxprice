import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatConfig, resolveTarget } from "../../src/config/chats.js";
import { sendMessage } from "../../src/max/client.js";
import { extractMaxUpdate } from "../../src/max/updateExtractor.js";
import { parsePriceMessage } from "../../src/parser/priceParser.js";
import { formatReportChunks } from "../../src/parser/reportFormatter.js";
import type { MaxUpdate } from "../../src/types/max.js";
import { isWebhookSecretValid, shouldNotifyUnknownChats } from "../../src/utils/auth.js";

function getRequestBody(req: VercelRequest): unknown {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as unknown;
    } catch {
      return {};
    }
  }

  return req.body ?? {};
}

function unwrapUpdates(body: unknown): MaxUpdate[] {
  if (Array.isArray(body)) return body as MaxUpdate[];

  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.updates)) return record.updates as MaxUpdate[];
    return [record as MaxUpdate];
  }

  return [];
}

function isMessageCreated(updateType: string | null): boolean {
  if (!updateType) return false;
  return updateType === "message_created" || updateType.endsWith("message_created");
}

async function processUpdate(update: MaxUpdate): Promise<void> {
  const extracted = extractMaxUpdate(update);

  if (!isMessageCreated(extracted.updateType)) return;
  if (!extracted.text.trim()) return;

  const config = getChatConfig(extracted.chatId);

  if (!config) {
    console.warn("Unknown chat", { chatId: extracted.chatId, updateType: extracted.updateType });

    if (shouldNotifyUnknownChats()) {
      const target = resolveTarget(null);
      if (target.userId || target.chatId) {
        await sendMessage(target, `Бот получил сообщение из неизвестного чата: ${extracted.chatId ?? "chat_id не найден"}. Добавьте этот chat_id в CHAT_CONFIGS_JSON или src/config/chats.ts.`);
      }
    }

    return;
  }

  if (!config.enabled) {
    console.log("Chat disabled", { chatId: extracted.chatId, name: config.name });
    return;
  }

  if (config.mode !== "price_changes") {
    console.log("Chat mode has no handler yet", { chatId: extracted.chatId, mode: config.mode });
    return;
  }

  const result = parsePriceMessage(extracted.text);
  const chunks = formatReportChunks(result);
  if (chunks.length === 0) return;

  const target = resolveTarget(config);
  if (!target.userId && !target.chatId) {
    console.error("No report target configured", { chatId: extracted.chatId, name: config.name });
    return;
  }

  for (const chunk of chunks) {
    await sendMessage(target, chunk);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isWebhookSecretValid(req)) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const updates = unwrapUpdates(getRequestBody(req));

  try {
    for (const update of updates) {
      await processUpdate(update);
    }
  } catch (error) {
    console.error("Webhook processing error", error);
  }

  res.status(200).json({ ok: true, received: updates.length });
}
