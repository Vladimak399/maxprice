import type { VercelRequest, VercelResponse } from "@vercel/node";
import baseHandler from "./maxWebhook";
import { getSourceConfigForTarget } from "../config/chats";
import { extractMaxFiles } from "../max/fileAttachments";
import { extractMaxUpdate } from "../max/updateExtractor";
import { handleForecastCommand, processForecastFiles } from "../forecast/bot";
import type { MaxUpdate } from "../types/max";
import { isWebhookSecretValid } from "../utils/auth";

function requestBody(req: VercelRequest): unknown {
  if (typeof req.body !== "string") return req.body ?? {};
  try { return JSON.parse(req.body) as unknown; }
  catch { return {}; }
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

export function isForecastMessage(update: MaxUpdate): boolean {
  const extracted = extractMaxUpdate(update);
  const isMessageCreated = Boolean(extracted.updateType?.endsWith("message_created"));
  const isPrivateDialog = Boolean(extracted.chatId && !extracted.chatId.startsWith("-"));
  const isNotificationTargetChat = Boolean(
    extracted.chatId && getSourceConfigForTarget(extracted.chatId, null)
  );
  return Boolean(extracted.userId && isMessageCreated && (isPrivateDialog || isNotificationTargetChat));
}

export default async function forecastAwareMaxWebhook(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!isWebhookSecretValid(req)) { res.status(401).json({ error: "Invalid webhook secret" }); return; }

  const updates = unwrapUpdates(requestBody(req));
  const unhandled: MaxUpdate[] = [];
  for (const update of updates) {
    if (!isForecastMessage(update)) { unhandled.push(update); continue; }
    const extracted = extractMaxUpdate(update);
    const files = extractMaxFiles(update);
    console.log("MAX forecast route candidate", {
      chatId: extracted.chatId,
      userIdExists: Boolean(extracted.userId),
      files: files.length,
      textPreview: extracted.text.trim().slice(0, 80)
    });
    try {
      if (files.length && await processForecastFiles(extracted, files)) continue;
      if (await handleForecastCommand(extracted)) continue;
    } catch (error) {
      console.warn("Forecast route failed; delegating to existing webhook", error);
    }
    unhandled.push(update);
  }

  if (!unhandled.length) {
    res.status(200).json({ ok: true, received: updates.length, forecastHandled: updates.length });
    return;
  }
  (req as VercelRequest & { body: unknown }).body = unhandled.length === 1 ? unhandled[0] : unhandled;
  await baseHandler(req, res);
}
