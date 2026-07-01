import { sendMessage } from "../max/client";
import type { ExtractedMaxUpdate, MaxAttachment, MaxMessageButton } from "../types/max";
import { isDatabaseConfigured } from "./db";
import {
  findArticles,
  listCategories,
  listCategoryArticles,
  recordFeedback,
  recordUnanswered,
  rememberArticle
} from "./repository";
import type { KnowledgeArticle } from "./types";

const MENU_COMMANDS = new Set(["/start", "start", "меню", "главное меню"]);
const HELPFUL = "Ответ помог";
const UNHELPFUL = "Ответ не помог";

function target(update: ExtractedMaxUpdate): { chatId?: string; userId?: string } {
  if (update.chatId) return { chatId: update.chatId };
  if (update.userId) return { userId: update.userId };
  return {};
}

function keyboard(rows: string[][]): MaxAttachment[] {
  return [{
    type: "inline_keyboard",
    payload: {
      buttons: rows.map((row) => row.map((text): MaxMessageButton => ({ type: "message", text })))
    }
  }];
}

function pairRows(values: string[]): string[][] {
  const rows: string[][] = [];
  for (let index = 0; index < values.length; index += 2) rows.push(values.slice(index, index + 2));
  return rows;
}

async function sendMenu(update: ExtractedMaxUpdate): Promise<void> {
  if (!isDatabaseConfigured()) {
    await sendMessage(target(update), "База знаний настраивается. Попробуйте ещё раз позднее.");
    return;
  }
  const categories = await listCategories(true);
  await sendMessage(
    target(update),
    "База знаний магазина\n\nВыберите раздел или напишите вопрос своими словами.",
    { attachments: keyboard(pairRows(categories.map((category) => category.title))) }
  );
}

function formatArticle(article: KnowledgeArticle): string {
  return `${article.question}\n\n${article.answer}\n\nРаздел: ${article.categoryTitle}`;
}

async function sendArticle(update: ExtractedMaxUpdate, article: KnowledgeArticle): Promise<void> {
  if (update.chatId) await rememberArticle(update.chatId, update.userId, article.id);
  await sendMessage(target(update), formatArticle(article), {
    attachments: keyboard([[HELPFUL, UNHELPFUL], ["Меню"]])
  });
}

export async function handleKnowledgeUpdate(update: ExtractedMaxUpdate): Promise<void> {
  const normalized = update.text.trim().toLowerCase();
  if (update.updateType === "bot_started" || MENU_COMMANDS.has(normalized)) {
    await sendMenu(update);
    return;
  }

  if (!update.text.trim()) return;
  if (!isDatabaseConfigured()) {
    await sendMessage(target(update), "База знаний временно недоступна. Сообщите руководителю.");
    return;
  }

  if ((update.text === HELPFUL || update.text === UNHELPFUL) && update.chatId) {
    const saved = await recordFeedback(update.chatId, update.userId, update.text === HELPFUL);
    await sendMessage(target(update), saved ? "Спасибо, оценка сохранена." : "Сначала откройте ответ из базы знаний.", {
      attachments: keyboard([["Меню"]])
    });
    return;
  }

  const categories = await listCategories(true);
  const category = categories.find((item) => item.title.toLowerCase() === normalized);
  if (category) {
    const articles = await listCategoryArticles(category.id);
    if (articles.length === 0) {
      await sendMessage(target(update), `В разделе «${category.title}» пока нет опубликованных инструкций.`, {
        attachments: keyboard([["Меню"]])
      });
      return;
    }
    await sendMessage(target(update), `Раздел «${category.title}». Выберите вопрос:`, {
      attachments: keyboard([...articles.map((article) => [article.question.slice(0, 120)]), ["Меню"]])
    });
    return;
  }

  const matches = await findArticles(update.text, 3);
  const best = matches[0];
  if (best) {
    await sendArticle(update, best);
    return;
  }

  await recordUnanswered(update.text, update.chatId, update.userId);
  await sendMessage(
    target(update),
    "В базе знаний пока нет точного ответа. Вопрос сохранён для администратора. Если ситуация срочная, обратитесь к руководителю.",
    { attachments: keyboard([["Меню"]]) }
  );
}
