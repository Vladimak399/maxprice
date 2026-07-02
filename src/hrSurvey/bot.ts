import { sendMessage } from "../max/client";
import type { ExtractedMaxUpdate, MaxAttachment, MaxMessageButton } from "../types/max";
import { isDatabaseConfigured } from "../knowledge/db";
import { getSurveyHashSalt, hashSurveyUserId, parseSurveyAnswer } from "./logic";
import { completeSession, findOpenSession, findOrCreateSession, getActiveSurvey, getQuestion, isMaxAdmin, saveAnswer } from "./repository";

const SURVEY_COMMANDS = new Set(["опрос", "/survey", "начать опрос", "пройти опрос", "hr-опрос", "/start_survey"]);
const MENU_COMMANDS = new Set(["/start", "start", "меню", "помощь"]);
const ADMIN_COMMANDS = new Set(["/admin", "админка"]);
const target = (u: ExtractedMaxUpdate) => u.chatId ? { chatId: u.chatId } : { userId: u.userId ?? undefined };
const keyboard = (rows: string[][]): MaxAttachment[] => [{ type: "inline_keyboard", payload: { buttons: rows.map((r) => r.map((text): MaxMessageButton => ({ type: "message", text }))) } }];
const pairs = (v: string[]) => { const rows: string[][] = []; for (let i = 0; i < v.length; i += 2) rows.push(v.slice(i, i + 2)); return rows; };
const normalized = (text: string) => text.trim().toLowerCase();

export function isSurveyCommand(text: string): boolean { return SURVEY_COMMANDS.has(normalized(text)); }
export function isMenuCommand(text: string): boolean { return MENU_COMMANDS.has(normalized(text)); }
export function isAdminCommand(text: string): boolean { return ADMIN_COMMANDS.has(normalized(text)); }

export async function sendMainMenu(update: ExtractedMaxUpdate): Promise<void> {
  await sendMessage(target(update), "Что хотите сделать?", { attachments: keyboard([["Пройти опрос"], ["База знаний"], ["Админка"]]) });
}

export async function handleKnowledgeMenu(update: ExtractedMaxUpdate): Promise<boolean> {
  if (normalized(update.text) !== "база знаний") return false;
  await sendMessage(target(update), "Напишите вопрос по работе магазина, например: как оформить возврат, что делать с ценником, как принять товар.");
  return true;
}

export async function handleMaxAdminCommand(update: ExtractedMaxUpdate): Promise<boolean> {
  if (!isAdminCommand(update.text)) return false;
  if (!update.userId) { await sendMessage(target(update), "Доступ к админке проверяется только в личном чате."); return true; }
  if (!isDatabaseConfigured()) { await sendMessage(target(update), "База данных временно недоступна."); return true; }
  if (await isMaxAdmin(update.userId)) {
    const url = process.env.ADMIN_BASE_URL?.trim();
    await sendMessage(target(update), url ? `Админка: ${url}` : "ADMIN_BASE_URL не задан. Администратору нужно добавить ADMIN_BASE_URL в переменные окружения Vercel.");
  } else await sendMessage(target(update), "Доступ к админке не найден");
  return true;
}

export async function hasOpenSurveySession(update: ExtractedMaxUpdate): Promise<boolean> {
  if (!update.userId || !getSurveyHashSalt() || !isDatabaseConfigured()) return false;
  return Boolean(await findOpenSession(hashSurveyUserId(update.userId)));
}

async function sendQuestion(update: ExtractedMaxUpdate, session: any): Promise<void> {
  const q = await getQuestion(session.survey_id, Number(session.current_question_position));
  if (!q) { await completeSession(session.id); await sendMessage(target(update), "Спасибо. Ответы сохранены анонимно."); return; }
  let text = `${q.position}. ${q.text}`;
  let rows: string[][] = [];
  if (q.type === "scale_1_5") { text += "\n\nОцените по шкале 1-5, где 1 — плохо, 5 — отлично."; rows = [["1", "2", "3", "4", "5"]]; }
  else if (q.type === "single_choice") { text += "\n\nВыберите один вариант кнопкой или напишите текст варианта."; rows = pairs(q.options); }
  else if (q.type === "multi_choice") text += "\n\n" + q.options.map((o, i) => `${i + 1}. ${o}`).join("\n") + `\n\nНапишите номера через запятую, пробел или точку с запятой${q.maxChoices ? `. Можно выбрать не больше ${q.maxChoices}.` : "."}`;
  else if (!q.required) { text += "\n\nМожно написать свободный ответ или «пропустить»."; rows = [["Пропустить"]]; }
  if (!q.required && q.type !== "text") rows.push(["Пропустить"]);
  await sendMessage(target(update), text, rows.length ? { attachments: keyboard(rows) } : {});
}

export async function startOrContinueSurvey(update: ExtractedMaxUpdate): Promise<void> {
  if (!isDatabaseConfigured()) { await sendMessage(target(update), "Опросы временно недоступны: база данных не подключена."); return; }
  if (!update.userId) { await sendMessage(target(update), "Опрос можно пройти только в личном чате с ботом."); return; }
  let userHash: string;
  try { userHash = hashSurveyUserId(update.userId); }
  catch (e) { console.error(e); await sendMessage(target(update), "Опрос временно недоступен: не настроена анонимизация. Администратору нужно добавить SURVEY_HASH_SALT в переменные окружения Vercel."); return; }
  const survey = await getActiveSurvey();
  if (!survey) { await sendMessage(target(update), "Сейчас активных опросов нет. Администратору нужно открыть /admin → Опросы → Создать дефолтный HR-опрос → Активировать."); return; }
  const session = await findOrCreateSession(survey.id, userHash, update.chatId ? hashSurveyUserId(update.chatId) : null);
  if (session.completed) { await sendMessage(target(update), "Вы уже прошли этот опрос. Спасибо."); return; }
  if (Number(session.current_question_position) === 1) await sendMessage(target(update), `${survey.title}\n\n${survey.description ?? ""}`);
  await sendQuestion(update, session);
}

export async function handleSurveyAnswer(update: ExtractedMaxUpdate): Promise<boolean> {
  if (!update.userId || !getSurveyHashSalt() || !isDatabaseConfigured()) return false;
  const session = await findOpenSession(hashSurveyUserId(update.userId));
  if (!session) return false;
  const q = await getQuestion(session.survey_id, Number(session.current_question_position));
  if (!q) { await completeSession(session.id); await sendMessage(target(update), "Спасибо. Ответы сохранены анонимно."); return true; }
  try { const parsed = parseSurveyAnswer(q, update.text); await saveAnswer(session, q, parsed); await sendQuestion(update, { ...session, current_question_position: Number(session.current_question_position) + 1 }); }
  catch (e) { await sendMessage(target(update), `${e instanceof Error ? e.message : "Не удалось сохранить ответ. Попробуйте ещё раз."}\n\nПовтор вопроса:`); await sendQuestion(update, session); }
  return true;
}
