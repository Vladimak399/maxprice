import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/admin/csv.js";

describe("CSV parser", () => {
  it("parses semicolon-separated Russian columns", () => {
    expect(parseCsv("категория;вопрос;ответ\nКасса;Что делать?;Проверить ленту")).toEqual([
      ["категория", "вопрос", "ответ"],
      ["Касса", "Что делать?", "Проверить ленту"]
    ]);
  });

  it("keeps delimiters and new lines inside quoted values", () => {
    expect(parseCsv('category,question,answer\nReturns,"Question, exact","First line\nSecond line"')[1]).toEqual([
      "Returns",
      "Question, exact",
      "First line\nSecond line"
    ]);
  });
});
