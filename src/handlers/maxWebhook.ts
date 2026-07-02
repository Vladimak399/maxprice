import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatConfig, resolveTarget } from "../config/chats";
import { handleKnowledgeUpdate } from "../knowledge/bot";
import { handleMaxAdminCommand, handleSurveyAnswer, hasOpenSurveySession, isSurveyCommand, startOrContinueSurvey } from "../hrSurvey/bot";
import { sendMessage } from "../max/client";
import { extractMaxUpdate } from "../max/updateExtractor";
import { parsePriceMessage } from "../parser/priceParser";
import { formatReportChunks } from "../parser/reportFormatter";
import type { MaxUpdate } from "../types/max";
import { isWebhookSecretValid, shouldNotifyUnknownChats } from "../utils/auth";

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
  return Boolean(updateType && (updateType === "message_created" || updateType.endsWith("message_created")));
}

async function processPriceUpdate(update: MaxUpdate, chatId: string): Promise<void> {
  const extracted = extractMaxUpdate(update);
  const config = getChatConfig(chatId);
  if (!config) return;
  const chunks = formatReportChunks(parsePriceMessage(extracted.text));
  if (chunks.length === 0) return;
  const target = resolveTarget(config);
  if (!target.userId && !target.chatId) {
    console.error("No report target configured", { chatId, name: config.name });
    return;
  }
  for (const chunk of chunks) await sendMessage(target, chunk);
}

async function processUpdate(update: MaxUpdate): Promise<void> {
  const extracted = extractMaxUpdate(update);

  if (extracted.updateType === "bot_started") {
    await handleKnowledgeUpdate(extracted);
    return;
  }
  if (!isMessageCreated(extracted.updateType) || !extracted.text.trim()) return;

  const config = getChatConfig(extracted.chatId);
  if (config) {
    if (!config.enabled) return;
    if (config.mode === "price_changes" && extracted.chatId) {
      await processPriceUpdate(update, extracted.chatId);
      return;
    }
    await handleKnowledgeUpdate(extracted);
    return;
  }

  const isPrivateDialog = Boolean(extracted.userId && extracted.chatId && !extracted.chatId.startsWith("-"));
  if (isPrivateDialog) {
    if (await handleMaxAdminCommand(extracted)) return;
    if (isSurveyCommand(extracted.text)) {
      await startOrContinueSurvey(extracted);
      return;
    }
    if (await hasOpenSurveySession(extracted)) {
      await handleSurveyAnswer(extracted);
      return;
    }
    await handleKnowledgeUpdate(extracted);
    return;
  }

  console.warn("Unknown chat", { chatId: extracted.chatId, updateType: extracted.updateType });
  if (shouldNotifyUnknownChats()) {
    const target = resolveTarget(null);
    if (target.userId || target.chatId) {
      await sendMessage(target, `Бот получил сообщение из неизвестного чата: ${extracted.chatId ?? "chat_id не найден"}. Добавьте этот chat_id в CHAT_CONFIGS_JSON.`);
    }
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
    for (const update of updates) await processUpdate(update);
  } catch (error) {
    console.error("Webhook processing error", error);
  }
  res.status(200).json({ ok: true, received: updates.length });
}
