import type { ChatConfig } from "../config/chats";
import { resolveTarget } from "../config/chats";
import { isDatabaseConfigured } from "../knowledge/db";
import { downloadMaxImage, extractMaxImages } from "../max/imageAttachments";
import { sendMessage } from "../max/client";
import { extractMaxUpdate } from "../max/updateExtractor";
import type { MaxUpdate } from "../types/max";
import { formatUnorderedGoodsAlert } from "./formatter";
import { analyzeUnorderedGoodsScreenshot } from "./ocr";
import { saveUnorderedGoodsEvent } from "./repository";

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
      const result = await analyzeUnorderedGoodsScreenshot(buffer);
      if (!result.markedRows.length) continue;
      stage = "database";
      let isNew = true;
      const parsedImageUrl = new URL(image.url);
      const imageReference = image.attachmentId ?? `${parsedImageUrl.origin}${parsedImageUrl.pathname}`;
      if (isDatabaseConfigured()) isNew = await saveUnorderedGoodsEvent({ messageId: extracted.messageId, sourceChatId: extracted.chatId, sourceUserId: extracted.userId, imageUrl: imageReference, result });
      if (isNew) await sendMessage(target, formatUnorderedGoodsAlert(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Unordered goods screenshot processing failed", { messageId: extracted.messageId, stage, message, stack: error instanceof Error ? error.stack : undefined });
      const reason = stage === "download" ? "не удалось скачать изображение из MAX" : stage === "recognition" ? message.includes("размеченная колонка") ? "не найдена красная разметка таблицы" : "не запустился OCR" : "не удалось сохранить статистику";
      await sendMessage(target, `⚠️ Получен скриншот поступления, но обработка не завершена. Причина: ${reason}. Код этапа: ${stage}. Проверьте оригинал в рабочем чате.`);
    }
  }
}
