import type { ChatConfig } from "../config/chats";
import { resolveTarget } from "../config/chats";
import { isDatabaseConfigured } from "../knowledge/db";
import { downloadMaxImage, extractMaxImages } from "../max/imageAttachments";
import { getMessageUrl, sendMessage } from "../max/client";
import { extractMaxUpdate } from "../max/updateExtractor";
import type { MaxUpdate } from "../types/max";
import { formatUnorderedGoodsAlert, type SupplierViolationHistory } from "./formatter";
import { analyzeScreenshot } from "./analyzer";
import { getSupplierViolationHistory, saveUnorderedGoodsEvent } from "./repository";

export function recognitionFailureReason(message: string): string {
  if (/OpenRouter request failed: 401/.test(message)) return "OpenRouter отклонил API-ключ";
  if (/OpenRouter request failed: 402/.test(message)) return "на балансе OpenRouter недостаточно средств";
  if (/OpenRouter request failed: 429/.test(message)) return "OpenRouter временно перегружен";
  if (/OpenRouter request failed: 5\d\d/.test(message)) return "сервис OpenRouter временно недоступен";
  if (/timeout|timed out|aborted/i.test(message)) return "модель не ответила вовремя";
  if (/размеченная колонка/i.test(message)) return "не найдена красная разметка таблицы";
  return "оба способа OCR завершились ошибкой";
}

export async function processUnorderedGoodsUpdate(update: MaxUpdate, config: ChatConfig): Promise<void> {
  const extracted = extractMaxUpdate(update);
  const images = extractMaxImages(update);
  if (!images.length) return;
  const target = resolveTarget(config);
  if (!target.chatId && !target.userId) throw new Error("No target configured for unordered_goods chat");

  for (const image of images) {
    let stage = "download";
    try {
      const buffer = await downloadMaxImage(image.url);
      stage = "recognition";
      const result = await analyzeScreenshot(buffer);
      if (!result.markedRows.length) continue;
      let isNew = true;
      let history: SupplierViolationHistory | null = null;
      const parsedImageUrl = new URL(image.url);
      const imageReference = image.attachmentId ?? `${parsedImageUrl.origin}${parsedImageUrl.pathname}`;
      if (isDatabaseConfigured()) {
        stage = "database";
        try {
          isNew = await saveUnorderedGoodsEvent({ messageId: extracted.messageId, sourceChatId: extracted.chatId, sourceUserId: extracted.userId, imageUrl: imageReference, result });
          if (isNew && result.counterparty) history = await getSupplierViolationHistory(result.counterparty);
        } catch (error) {
          console.warn("Failed to save unordered-goods statistics; sending alert without history", error);
        }
      }
      if (isNew) {
        stage = "notification";
        const text = formatUnorderedGoodsAlert(result, history);
        let sourceUrl: string | null = null;
        if (extracted.messageId) {
          try { sourceUrl = await getMessageUrl(extracted.messageId); }
          catch (error) { console.warn("Failed to resolve original MAX message URL", error); }
        }
        await sendMessage(target, text);
        if (sourceUrl) await sendMessage(target, "🔗 Исходный скриншот операторов", { attachments: [{ type: "inline_keyboard", payload: { buttons: [[{ type: "link", text: "Открыть исходное сообщение", url: sourceUrl }]] } }] });
        else await sendMessage(target, "⚠️ MAX не предоставил ссылку на исходное сообщение. Скриншот можно проверить в чате операторов.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Unordered goods screenshot processing failed", { messageId: extracted.messageId, stage, message, stack: error instanceof Error ? error.stack : undefined });
      const reason = stage === "download" ? "не удалось скачать изображение из MAX" : stage === "recognition" ? recognitionFailureReason(message) : stage === "notification" ? "не удалось отправить уведомление" : "не удалось сохранить статистику";
      await sendMessage(target, `⚠️ Получен скриншот поступления, но обработка не завершена. Причина: ${reason}. Код этапа: ${stage}. Проверьте оригинал в рабочем чате.`);
    }
  }
}
