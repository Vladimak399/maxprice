import { describe, expect, it } from "vitest";
import { formatUnorderedGoodsAlert } from "../src/unorderedGoods/formatter";
import type { UnorderedGoodsAnalysis } from "../src/unorderedGoods/types";

function analysis(overrides: Partial<UnorderedGoodsAnalysis> = {}): UnorderedGoodsAnalysis {
  return {
    counterparty: "Поставщик А",
    warehouse: "Батальная",
    documentNumber: "ОФЛТ001",
    documentDate: "31.07.2026",
    ocrConfidence: 96,
    visibleRows: 10,
    rawText: "",
    markedRows: [{
      visibleIndex: 1,
      sourceRowNumber: 1,
      productCode: "4600000000001",
      productName: "Товар А",
      receivedQuantity: 24,
      orderedQuantity: 12,
      markerRatio: 0.9,
      ocrText: ""
    }],
    ...overrides
  };
}

describe("unordered goods notification formatter", () => {
  it("formats a compact excess-order alert with supplier history", () => {
    const text = formatUnorderedGoodsAlert(analysis(), { periodDays: 30, events: 3, items: 5, excessQuantity: 48 });
    expect(text).toContain("🚨 ПРЕВЫШЕНИЕ ЗАКАЗА");
    expect(text).toContain("заказ 12 · поступило 24 · лишнее +12");
    expect(text).toContain("За 30 дней: 3 проблемные поставки");
    expect(text).not.toContain("OCR:");
  });

  it("labels unordered goods separately", () => {
    const value = analysis({ markedRows: [{ ...analysis().markedRows[0], orderedQuantity: 0 }] });
    const text = formatUnorderedGoodsAlert(value);
    expect(text).toContain("ТОВАР БЕЗ ЗАКАЗА");
    expect(text).toContain("БЕЗ ЗАКАЗА");
  });

  it("shows confidence only when manual review is useful", () => {
    expect(formatUnorderedGoodsAlert(analysis({ ocrConfidence: 70 }))).toContain("Желательна ручная проверка");
    expect(formatUnorderedGoodsAlert(analysis({ ocrConfidence: 40 }))).toContain("Обязательно проверьте");
    expect(formatUnorderedGoodsAlert(analysis({ ocrConfidence: 90 }))).not.toContain("точность распознавания");
  });
});
