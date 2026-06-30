import { describe, expect, it } from "vitest";
import { formatReport, formatReportChunks } from "../src/parser/reportFormatter.js";
import type { ParseResult } from "../src/types/price.js";

describe("reportFormatter", () => {
  const result: ParseResult = {
    growthItems: [
      {
        name: "Товар A",
        shop: "Мега",
        oldPrice: 100,
        newPrice: 130,
        diff: 30,
        percent: 30
      },
      {
        name: "Товар A",
        shop: "Оазис",
        oldPrice: 100,
        newPrice: 130,
        diff: 30,
        percent: 30
      }
    ],
    zeroPriceItems: [
      {
        name: "Товар B",
        shop: "Экватор",
        oldPrice: 0,
        newPrice: 50
      }
    ]
  };

  it("формирует отчет", () => {
    const report = formatReport(result);

    expect(report).toContain("Рост закупочной цены");
    expect(report).toContain("Товар A");
    expect(report).toContain("Магазины: Мега, Оазис");
    expect(report).toContain("Проверить цену в базе = 0");
  });

  it("возвращает null для пустого результата", () => {
    expect(formatReport({ growthItems: [], zeroPriceItems: [] })).toBeNull();
  });

  it("режет длинный отчет на чанки", () => {
    const chunks = formatReportChunks(result, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
  });
});
