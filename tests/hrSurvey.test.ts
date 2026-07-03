import { describe, expect, it } from "vitest";
import { DEFAULT_HR_QUESTIONS } from "../src/hrSurvey/defaultSurvey";
import { FORBIDDEN_EXPORT_COLUMNS } from "../src/hrSurvey/export";
import { getSurveyHashSalt, hashSurveyUserId, parseSurveyAnswer, scoreZone } from "../src/hrSurvey/logic";
import { isMenuCommand, isSurveyCommand } from "../src/hrSurvey/bot";
import type { HrSurveyQuestion } from "../src/hrSurvey/types";

const q = (code: string): HrSurveyQuestion => {
  const question = DEFAULT_HR_QUESTIONS.find((item) => item.code === code);
  if (!question) throw new Error(`missing question ${code}`);
  return { ...question, id: "q", surveyId: "s" };
};

describe("hr survey logic", () => {
  it("parseSurveyAnswer validates scale_1_5", () => {
    expect(parseSurveyAnswer(q("core_clarity"), "5").answerNumber).toBe(5);
    expect(() => parseSurveyAnswer(q("core_clarity"), "6")).toThrow(/1 до 5/);
  });
  it("parseSurveyAnswer validates single_choice", () => {
    expect(parseSurveyAnswer(q("workplace"), "магазин").answerText).toBe("Магазин");
    expect(() => parseSurveyAnswer(q("workplace"), "дом")).toThrow(/вариантов/);
  });
  it("parseSurveyAnswer validates multi_choice formats and limits", () => {
    expect(parseSurveyAnswer(q("blockers"), "1, 3").answerText).toContain("Нехватка сотрудников");
    expect(parseSurveyAnswer(q("blockers"), "1 3").answerJson).toEqual(["Нехватка сотрудников", "График"]);
    expect(parseSurveyAnswer(q("blockers"), "1;3").answerJson).toEqual(["Нехватка сотрудников", "График"]);
    expect(() => parseSurveyAnswer(q("blockers"), "1,2,3,4")).toThrow(/не больше 3/);
  });
  it("parseSurveyAnswer handles text and skip", () => {
    expect(parseSurveyAnswer(q("one_change"), "улучшить график").answerText).toBe("улучшить график");
    expect(parseSurveyAnswer(q("anonymous_problem"), "пропустить").answerText).toBeNull();
    expect(() => parseSurveyAnswer(q("one_change"), " ")).toThrow(/ответьте/);
  });
  it("hashes user id with salt", () => {
    expect(hashSurveyUserId("123", "salt")).toHaveLength(64);
    expect(hashSurveyUserId("123", "salt")).not.toBe(hashSurveyUserId("123", "other"));
  });
  it("uses existing bot secrets as an anonymization fallback", () => {
    const originalSurveySalt = process.env.SURVEY_HASH_SALT;
    const originalWebhookSecret = process.env.MAX_WEBHOOK_SECRET;
    try {
      delete process.env.SURVEY_HASH_SALT;
      process.env.MAX_WEBHOOK_SECRET = "webhook-secret";
      expect(getSurveyHashSalt()).toBe("webhook-secret");
      expect(hashSurveyUserId("123")).toBe(hashSurveyUserId("123", "webhook-secret"));
    } finally {
      if (originalSurveySalt === undefined) delete process.env.SURVEY_HASH_SALT;
      else process.env.SURVEY_HASH_SALT = originalSurveySalt;
      if (originalWebhookSecret === undefined) delete process.env.MAX_WEBHOOK_SECRET;
      else process.env.MAX_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });
  it("does not define technical export columns", () => {
    for (const column of ["user_hash", "chat_hash", "source_chat_id", "user_id", "chat_id"]) expect(FORBIDDEN_EXPORT_COLUMNS).toContain(column);
  });
  it("calculates category zones", () => {
    expect(scoreZone(3.1)).toBe("red");
    expect(scoreZone(3.5)).toBe("yellow");
    expect(scoreZone(3.9)).toBe("normal");
  });
  it("recognizes survey and menu commands", () => {
    expect(isSurveyCommand("Пройти опрос")).toBe(true);
    expect(isSurveyCommand("Продолжить опрос")).toBe(true);
    expect(isSurveyCommand("hr-опрос")).toBe(true);
    expect(isSurveyCommand("/start_survey")).toBe(true);
    expect(isMenuCommand("/start")).toBe(true);
    expect(isMenuCommand("помощь")).toBe(true);
  });
  it("default survey has 26 unique questions", () => {
    expect(DEFAULT_HR_QUESTIONS).toHaveLength(26);
    expect(new Set(DEFAULT_HR_QUESTIONS.map((item) => item.position)).size).toBe(26);
    expect(new Set(DEFAULT_HR_QUESTIONS.map((item) => item.code)).size).toBe(26);
  });
  it("completed session restart message is stable", () => {
    expect("Вы уже прошли этот опрос. Спасибо.").toMatch(/уже прошли/);
  });
});
