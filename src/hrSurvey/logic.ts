import { createHash } from "node:crypto";
import type { HrSurveyQuestion, ParsedAnswer } from "./types";

const SURVEY_SALT_ENV_KEYS = ["SURVEY_HASH_SALT", "MAX_WEBHOOK_SECRET", "ADMIN_SECRET", "MAX_BOT_TOKEN"] as const;

export function getSurveyHashSalt(): string | null {
  for (const key of SURVEY_SALT_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}
export function hashSurveyUserId(userId: string, salt = getSurveyHashSalt()): string {
  if (!salt) throw new Error("Не задан секрет для анонимизации HR-опросов");
  return createHash("sha256").update(`${userId}${salt}`).digest("hex");
}
export function scoreZone(avg: number): "red"|"yellow"|"normal" { return avg < 3.2 ? "red" : avg <= 3.8 ? "yellow" : "normal"; }
export function parseSurveyAnswer(question: HrSurveyQuestion, raw: string): ParsedAnswer {
  const value = raw.trim();
  if (!value && question.required) throw new Error("Пожалуйста, ответьте на вопрос.");
  if (!question.required && (!value || value.toLowerCase() === "пропустить")) return { answerText: null, answerNumber: null, answerJson: null, profileField: profileField(question.code), profileValue: null };
  if (question.type === "scale_1_5") {
    const number = Number(value.replace(",", "."));
    if (!Number.isInteger(number) || number < 1 || number > 5) throw new Error("Нужно нажать кнопку или написать цифру от 1 до 5.");
    return { answerText: String(number), answerNumber: number, answerJson: null };
  }
  if (question.type === "single_choice") {
    const match = question.options.find((option) => option.toLowerCase() === value.toLowerCase());
    if (!match) throw new Error(`Выберите один из вариантов: ${question.options.join(", ")}.`);
    return { answerText: match, answerNumber: null, answerJson: null, profileField: profileField(question.code), profileValue: match };
  }
  if (question.type === "multi_choice") {
    const indexes = value.split(/[,.;،;\s]+/).map((part) => Number(part.trim())).filter(Number.isInteger);
    const unique = [...new Set(indexes)];
    if (unique.length === 0) throw new Error("Напишите номера вариантов через запятую, например: 1, 3, 5.");
    if (question.maxChoices && unique.length > question.maxChoices) throw new Error(`Можно выбрать не больше ${question.maxChoices} вариантов.`);
    const selected = unique.map((index) => question.options[index - 1]);
    if (selected.some((item) => !item)) throw new Error("В списке есть неизвестный номер варианта.");
    return { answerText: selected.join(", "), answerNumber: null, answerJson: selected };
  }
  return { answerText: value, answerNumber: null, answerJson: null, profileField: profileField(question.code), profileValue: value };
}
function profileField(code: string): ParsedAnswer["profileField"] {
  if (code === "workplace") return "employeeGroup";
  if (code === "role") return "employeeRole";
  if (code === "tenure") return "tenure";
  if (code === "store_or_department") return "storeOrDepartment";
  return undefined;
}
