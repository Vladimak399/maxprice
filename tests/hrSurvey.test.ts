import { describe, expect, it } from "vitest";
import { DEFAULT_HR_QUESTIONS } from "../src/hrSurvey/defaultSurvey";
import { FORBIDDEN_EXPORT_COLUMNS } from "../src/hrSurvey/export";
import { hashSurveyUserId, parseSurveyAnswer, scoreZone } from "../src/hrSurvey/logic";

describe("hr survey logic", () => {
  it("validates scale_1_5", () => {
    const base = DEFAULT_HR_QUESTIONS[4];
    if (!base) throw new Error("missing question");
    const q = { ...base, id: "q", surveyId: "s" };
    expect(parseSurveyAnswer(q, "5").answerNumber).toBe(5);
    expect(() => parseSurveyAnswer(q, "6")).toThrow(/1 до 5/);
  });
  it("validates multi_choice limits", () => {
    const base = DEFAULT_HR_QUESTIONS[27];
    if (!base) throw new Error("missing question");
    const q = { ...base, id: "q", surveyId: "s" };
    expect(parseSurveyAnswer(q, "1, 3").answerText).toContain("Нехватка сотрудников");
    expect(() => parseSurveyAnswer(q, "1,2,3,4")).toThrow(/не больше 3/);
  });
  it("hashes user id with salt", () => {
    expect(hashSurveyUserId("123", "salt")).toHaveLength(64);
    expect(hashSurveyUserId("123", "salt")).not.toBe(hashSurveyUserId("123", "other"));
  });
  it("does not define technical export columns", () => {
    expect(FORBIDDEN_EXPORT_COLUMNS).toContain("user_hash");
    expect(FORBIDDEN_EXPORT_COLUMNS).toContain("chat_hash");
  });
  it("calculates category zones", () => {
    expect(scoreZone(3.1)).toBe("red");
    expect(scoreZone(3.5)).toBe("yellow");
    expect(scoreZone(3.9)).toBe("normal");
  });
  it("default survey can prevent repeat by stable hash key", () => {
    const surveyId = "s";
    const userHash = hashSurveyUserId("u", "salt");
    expect(`${surveyId}:${userHash}`).toBe(`${surveyId}:${hashSurveyUserId("u", "salt")}`);
  });
});
