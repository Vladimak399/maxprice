import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatConfig, resolveTarget } from "../config/chats";
import { handleKnowledgeUpdate } from "../knowledge/bot";
import { isDatabaseConfigured } from "../knowledge/db";
import { isProductKnowledgeIntent } from "../knowledge/productSuppliersBot";
import { handleKnowledgeMenu, handleMaxAdminCommand, handleSurveyAnswer, handleSurveyExit, hasOpenSurveySession, isAdminCommand, isMenuCommand, isSurveyCommand, isSurveyExitCommand, sendMainMenu, sendSurveyIsolationNotice, startOrContinueSurvey } from "../hrSurvey/bot";
import { resolvePrivateMessageRoute } from "./privateRouting";
import { rememberMaxBotUser } from "../hrSurvey/repository";
import { sendMessage } from "../max/client";
import { extractMaxUpdate } from "../max/updateExtractor";
import { parsePriceMessage } from "../parser/priceParser";
import { formatReportChunks } from "../parser/reportFormatter";
import type { ExtractedMaxUpdate, MaxUpdate } from "../types/max";
import { isWebhookSecretValid, shouldNotifyUnknownChats } from "../utils/auth";

const BASIC_COMMANDS = new Set(["/start", "start", "меню", "/menu", "help", "помощь", "debug"]);
const DB_UNAVAILABLE_MESSAGE = "Бот работает. База данных не настроена, поэтому HR-опросы и база знаний недоступны. Мониторинг цен работает через настроенные чаты.";

function getRequestBody(req: VercelRequest): unknown { if (typeof req.body === "string") { try { return JSON.parse(req.body) as unknown; } catch { return {}; } } return req.body ?? {}; }
function unwrapUpdates(body: unknown): MaxUpdate[] { if (Array.isArray(body)) return body as MaxUpdate[]; if (body !== null && typeof body === "object") { const record = body as Record<string, unknown>; if (Array.isArray(record.updates)) return record.updates as MaxUpdate[]; return [record as MaxUpdate]; } return []; }
export function isMessageCreated(updateType: string | null): boolean { return Boolean(updateType && (updateType === "message_created" || updateType.endsWith("message_created"))); }
function normalizedCommand(text: string): string { return text.trim().toLowerCase(); }
export function isBasicMaxCommand(text: string): boolean { const command = normalizedCommand(text); return BASIC_COMMANDS.has(command) || isAdminCommand(text); }
function targetFor(update: ExtractedMaxUpdate): { userId?: string; chatId?: string } { return update.chatId ? { chatId: update.chatId } : { userId: update.userId ?? undefined }; }
function previewText(text: string): string { return text.trim().replace(/\s+/g, " ").slice(0, 160); }

async function safeRememberMaxBotUser(update: ExtractedMaxUpdate): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!update.userId && !update.chatId) return;
  try {
    await rememberMaxBotUser(update.userId, update.chatId);
  } catch (error) {
    console.warn("Failed to remember MAX bot user; continuing without database features", error);
  }
}

async function sendDatabaseUnavailableCommandResponse(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(targetFor(update), DB_UNAVAILABLE_MESSAGE);
}

async function handleCommand(update: ExtractedMaxUpdate): Promise<boolean> {
  const text = update.text;
  if (!isBasicMaxCommand(text) && !isMenuCommand(text)) return false;
  if (!isDatabaseConfigured()) {
    await sendDatabaseUnavailableCommandResponse(update);
    return true;
  }
  if (isAdminCommand(text)) {
    try { await handleMaxAdminCommand(update); } catch (error) { console.warn("Admin command failed", error); await sendDatabaseUnavailableCommandResponse(update); }
    return true;
  }
  try { await sendMainMenu(update); } catch (error) { console.warn("Menu command failed; sending fallback response", error); await sendDatabaseUnavailableCommandResponse(update); }
  return true;
}

async function processPriceUpdate(update: MaxUpdate, chatId: string): Promise<void> {
  const extracted = extractMaxUpdate(update);
  const config = getChatConfig(chatId);
  if (!config) return;
  const parseResult = parsePriceMessage(extracted.text);
  const chunks = formatReportChunks(parseResult);
  console.log("MAX price parse", { chatId, growthItems: parseResult.growthItems.length, zeroPriceItems: parseResult.zeroPriceItems.length, chunks: chunks.length });
  if (chunks.length === 0) return;
  const target = resolveTarget(config);
  console.log("MAX price target", { chatId, targetFound: Boolean(target.userId || target.chatId), targetType: target.chatId ? "chat" : target.userId ? "user" : "none" });
  if (!target.userId && !target.chatId) { console.error("No report target configured", { chatId, name: config.name }); return; }
  let sentChunks = 0;
  for (const chunk of chunks) { await sendMessage(target, chunk); sentChunks += 1; }
  console.log("MAX price report sent", { chatId, sentChunks });
}

export type DebugWebhookDecision = ReturnType<typeof analyzeWebhookUpdate>;
export function analyzeWebhookUpdate(update: MaxUpdate) {
  const extracted = extractMaxUpdate(update);
  const config = getChatConfig(extracted.chatId);
  const parseResult = parsePriceMessage(extracted.text);
  const reportChunksCount = formatReportChunks(parseResult).length;
  const commandDetected = isBasicMaxCommand(extracted.text) || isMenuCommand(extracted.text);
  const target = resolveTarget(config);
  let reason = "Webhook would ignore this update.";
  if (!isMessageCreated(extracted.updateType) && extracted.updateType !== "bot_started") reason = "Update type is not message_created or bot_started.";
  else if (extracted.updateType === "bot_started") reason = "Webhook would remember user if database is configured, then send menu/fallback command response.";
  else if (commandDetected) reason = "Webhook would handle this as a command before price parsing.";
  else if (config?.enabled && config.mode === "price_changes") reason = reportChunksCount > 0 && (target.userId || target.chatId) ? "Webhook would parse price changes and send report chunks to resolved target." : "Webhook would parse prices but not send: no chunks or no target.";
  else if (config && !config.enabled) reason = "Chat config is disabled.";
  else if (!config) reason = "No chat config found; webhook would treat this as an unknown chat unless it is a private dialog.";
  return { extracted, isMessageCreated: isMessageCreated(extracted.updateType), isPrivateDialog: Boolean(extracted.userId && extracted.chatId && !extracted.chatId.startsWith("-")), chatConfig: config, enabled: config?.enabled ?? null, mode: config?.mode ?? null, target, parsePriceMessage: parseResult, reportChunksCount, reason };
}

async function processUpdate(update: MaxUpdate): Promise<void> {
  const extracted = extractMaxUpdate(update);
  const isPrivateDialog = Boolean(extracted.userId && extracted.chatId && !extracted.chatId.startsWith("-"));
  const config = getChatConfig(extracted.chatId);
  const commandDetected = isBasicMaxCommand(extracted.text) || isMenuCommand(extracted.text);
  console.log("MAX webhook received update", { updateType: extracted.updateType, chatId: extracted.chatId, userIdExists: Boolean(extracted.userId), textPreview: previewText(extracted.text), configFound: Boolean(config), commandDetected });
  if (isPrivateDialog || extracted.updateType === "bot_started") await safeRememberMaxBotUser(extracted);

  if (extracted.updateType === "bot_started") {
    console.log("MAX webhook route selected", { route: "bot_started" });
    if (!isDatabaseConfigured()) await sendDatabaseUnavailableCommandResponse(extracted);
    else {
      try { if (isPrivateDialog && await hasOpenSurveySession(extracted)) await sendSurveyIsolationNotice(extracted); else await sendMainMenu(extracted); }
      catch (error) { console.warn("bot_started database flow failed; sending fallback", error); await sendDatabaseUnavailableCommandResponse(extracted); }
    }
    return;
  }
  if (!isMessageCreated(extracted.updateType) || !extracted.text.trim()) return;

  if (commandDetected) { console.log("MAX webhook route selected", { route: "command" }); await handleCommand(extracted); return; }

  if (config) {
    if (!config.enabled) return;
    if (config.mode === "price_changes" && extracted.chatId) { console.log("MAX webhook route selected", { route: "price_changes" }); await processPriceUpdate(update, extracted.chatId); return; }
    if (!isDatabaseConfigured()) { console.warn("Database is not configured; skipping knowledge/HR chat route", { chatId: extracted.chatId, mode: config.mode }); return; }
    console.log("MAX webhook route selected", { route: "knowledge" });
    try { await handleKnowledgeUpdate(extracted); } catch (error) { console.warn("Knowledge update failed", error); }
    return;
  }
  if (isPrivateDialog) {
    if (!isDatabaseConfigured()) { console.log("MAX webhook route selected", { route: "private_no_database" }); await sendDatabaseUnavailableCommandResponse(extracted); return; }
    const text = extracted.text;
    try {
      const route = resolvePrivateMessageRoute({ hasActiveSurvey: await hasOpenSurveySession(extracted), isAdminCommand: isAdminCommand(text), isSurveyExitCommand: isSurveyExitCommand(text), isSurveyCommand: isSurveyCommand(text), isMenuCommand: isMenuCommand(text), isKnowledgeMenuCommand: text.trim().toLowerCase() === "база знаний", isProductKnowledgeIntent: isProductKnowledgeIntent(text) });
      console.log("MAX webhook route selected", { route });
      if (route === "admin") await handleMaxAdminCommand(extracted);
      else if (route === "survey_exit") await handleSurveyExit(extracted);
      else if (route === "survey_continue") await startOrContinueSurvey(extracted);
      else if (route === "survey_blocked") await sendSurveyIsolationNotice(extracted);
      else if (route === "survey_answer") await handleSurveyAnswer(extracted);
      else if (route === "menu") await sendMainMenu(extracted);
      else if (route === "knowledge_menu") await handleKnowledgeMenu(extracted);
      else await handleKnowledgeUpdate(extracted);
    } catch (error) { console.warn("Private database-backed route failed; sending fallback", error); await sendDatabaseUnavailableCommandResponse(extracted); }
    return;
  }
  console.warn("Unknown chat", { chatId: extracted.chatId, updateType: extracted.updateType });
  if (shouldNotifyUnknownChats()) { const target = resolveTarget(null); if (target.userId || target.chatId) await sendMessage(target, `Бот получил сообщение из неизвестного чата: ${extracted.chatId ?? "chat_id не найден"}. Добавьте этот chat_id в CHAT_CONFIGS_JSON.`); }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!isWebhookSecretValid(req)) { res.status(401).json({ error: "Invalid webhook secret" }); return; }
  const updates = unwrapUpdates(getRequestBody(req));
  try { for (const update of updates) await processUpdate(update); } catch (error) { console.error("Webhook processing error", error); }
  res.status(200).json({ ok: true, received: updates.length });
}
