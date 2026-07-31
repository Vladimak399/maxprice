import { describe, expect, it } from "vitest";
import { formatUnorderedGoodsStats, parseUnorderedGoodsStatsCommand, type UnorderedGoodsChatStats } from "../src/unorderedGoods/statsCommands";

const stats: UnorderedGoodsChatStats = {
  periodDays: 30,
  totals: { events: 4, items: 7, counterparties: 2, excessQuantity: 38 },
  suppliers: [
    { counterparty: "Поставщик А", events: 3, items: 5, excessQuantity: 30 },
    { counterparty: "Поставщик Б", events: 1, items: 2, excessQuantity: 8 }
  ],
  products: [
    { productCode: "4600000000001", productName: "Товар А", occurrences: 4, excessQuantity: 24 }
  ]
};

describe("unordered goods chat stats commands", () => {
  it("parses supplier ranking with a custom period", () => {
    expect(parseUnorderedGoodsStatsCommand("/поставщики 90")).toEqual({ kind: "suppliers", periodDays: 90 });
    expect(parseUnorderedGoodsStatsCommand("рейтинг поставщиков")).toEqual({ kind: "suppliers", periodDays: 30 });
  });

  it("parses products, summary and help", () => {
    expect(parseUnorderedGoodsStatsCommand("товары 7")).toEqual({ kind: "products", periodDays: 7 });
    expect(parseUnorderedGoodsStatsCommand("статистика")).toEqual({ kind: "summary", periodDays: 30 });
    expect(parseUnorderedGoodsStatsCommand("аналитика помощь")).toEqual({ kind: "help", periodDays: 30 });
  });

  it("does not intercept ordinary chat messages", () => {
    expect(parseUnorderedGoodsStatsCommand("поставщики снова привезли лишний товар")).toBeNull();
  });

  it("formats supplier and summary responses", () => {
    const suppliers = formatUnorderedGoodsStats({ kind: "suppliers", periodDays: 30 }, stats);
    expect(suppliers).toContain("Поставщик А");
    expect(suppliers).toContain("лишнее количество: 30");

    const summary = formatUnorderedGoodsStats({ kind: "summary", periodDays: 30 }, stats);
    expect(summary).toContain("Поступлений с нарушениями: 4");
    expect(summary).toContain("Общее лишнее количество: 38");
  });
});
