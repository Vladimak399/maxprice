import { describe, expect, it } from "vitest";
import { mapVisionResponse } from "../src/unorderedGoods/openrouter";

describe("OpenRouter unordered goods mapping", () => {
  it("keeps only unordered and excess rows", () => {
    const result = mapVisionResponse({ counterparty: "Поставщик", confidence: 1, problem_rows: [
      { row_number: 1, product_name: "Недопоставка", received_quantity: 5, ordered_quantity: 6, violation_type: "excess" },
      { row_number: 2, product_name: "Сверх заказа", received_quantity: 18, ordered_quantity: 12, violation_type: "excess" },
      { row_number: 3, product_name: "Без заказа", received_quantity: 4, ordered_quantity: null, violation_type: "unordered" },
      { row_number: 4, product_name: "Равное количество", received_quantity: 5, ordered_quantity: 5, violation_type: "excess" }
    ] });
    expect(result.markedRows.map((row) => row.productName)).toEqual(["Сверх заказа", "Без заказа"]);
    expect(result.ocrConfidence).toBe(100);
  });
});
