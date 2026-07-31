import { describe, expect, it } from "vitest";
import { parseScreenshotText } from "../src/unorderedGoods/ocr";

describe("unordered goods OCR parsing", () => {
  it("combines document context with marked item rows", () => {
    const text = [
      "Номер: ФРЛК0032359 от: 30.07.2026 15:56:23",
      "Контрагент: Хвориков Андрей Генриевич ИП На склад Сельма",
      "4 4605246005879 Чай Тесс черный Санрайз 100г 1/15 5.000 5.000 Заказ поставщику ОФЛК",
      "5 4605246005886 Чай Тесс черный Плэже 100г 1/15 6.000 Заказ поставщику ОФЛК"
    ].join("\n");
    const result = parseScreenshotText(text, 82, [1], [0.5, 0.98]);
    expect(result.counterparty).toContain("Хвориков");
    expect(result.documentNumber).toBe("ФРЛК0032359");
    expect(result.markedRows).toHaveLength(1);
    expect(result.markedRows[0]?.productName).toContain("Чай Тесс черный Плэже");
    expect(result.markedRows[0]?.receivedQuantity).toBe(6);
  });
});
