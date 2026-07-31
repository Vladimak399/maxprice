import { describe, expect, it } from "vitest";
import { recognitionFailureReason } from "../src/unorderedGoods/bot";

describe("recognition failure diagnostics", () => {
  it("maps OpenRouter and OCR errors to safe user-facing reasons", () => {
    expect(recognitionFailureReason("OpenRouter request failed: 402 balance")).toContain("недостаточно средств");
    expect(recognitionFailureReason("OpenRouter request failed: 429 overloaded")).toContain("перегружен");
    expect(recognitionFailureReason("The operation was aborted due to timeout")).toContain("не ответила вовремя");
    expect(recognitionFailureReason("Не найдена размеченная колонка таблицы")).toContain("красная разметка");
  });
});
