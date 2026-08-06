import { describe, expect, it } from "vitest";
import { parseForecastCommand } from "../src/forecast/bot";
import { scopeSnapshot } from "../src/forecast/scopes";
import type { PlanFactLine, StoredPlanFactSnapshot } from "../src/forecast/types";

function line(category: string, plan: number, actual: number): PlanFactLine {
  return {
    category,
    monthlyPlanRevenue: plan,
    monthlyPlanMargin: plan * 0.3,
    planToDateRevenue: plan * 0.2,
    planToDateMargin: plan * 0.06,
    actualRevenue: actual,
    actualMargin: actual * 0.3
  };
}

function snapshot(reportDate = "2026-08-08"): StoredPlanFactSnapshot {
  const categories = [
    line("Бакалея", 1000, 210),
    line("Напитки", 900, 220),
    line("Товары для детей", 500, 90),
    line("Азиатская продукция", 400, 70),
    line("Охлажденная продукция", 600, 100),
    line("Хлебобулочные изделия", 300, 80),
    line("Сезонный товар", 800, 0)
  ];
  return {
    id: 1,
    sourceUserId: "user",
    sourceChatId: "chat",
    messageId: "message",
    filename: "факт 08.08.xlsx",
    reportDate,
    periodStart: reportDate.slice(0, 8) + "01",
    periodEnd: reportDate.slice(0, 8) + "31",
    createdAt: "2026-08-08T08:00:00Z",
    overall: line("Продукты", 4500, 770),
    categories
  };
}

describe("forecast report scopes", () => {
  it("excludes seasonal goods from August overall totals", () => {
    const scoped = scopeSnapshot(snapshot(), { kind: "overall" });
    expect(scoped?.categories.map((item) => item.category)).not.toContain("Сезонный товар");
    expect(scoped?.overall.monthlyPlanRevenue).toBe(3700);
    expect(scoped?.overall.actualRevenue).toBe(770);
  });

  it("keeps seasonal goods in the New Year period", () => {
    const scoped = scopeSnapshot(snapshot("2026-12-08"), { kind: "overall" });
    expect(scoped?.categories.map((item) => item.category)).toContain("Сезонный товар");
  });

  it("selects only Vlad categories that exist in the report", () => {
    const scoped = scopeSnapshot(snapshot(), { kind: "manager", manager: "vlad" });
    expect(scoped?.categories.map((item) => item.category)).toEqual([
      "Бакалея",
      "Напитки",
      "Товары для детей"
    ]);
  });

  it("includes cooled products and bakery in Kristina report", () => {
    const scoped = scopeSnapshot(snapshot(), { kind: "manager", manager: "kristina" });
    expect(scoped?.categories.map((item) => item.category)).toEqual([
      "Азиатская продукция",
      "Охлажденная продукция",
      "Хлебобулочные изделия"
    ]);
  });

  it("parses menu, category and statistics commands", () => {
    expect(parseForecastCommand("Отчёт Влад")).toEqual({ kind: "report", scope: { kind: "manager", manager: "vlad" } });
    expect(parseForecastCommand("Категория Специи и выпечка")).toEqual({
      kind: "report",
      scope: { kind: "category", category: "Специи, компоненты для выпечки" }
    });
    expect(parseForecastCommand("Статистика Кристина")).toEqual({
      kind: "history",
      scope: { kind: "manager", manager: "kristina" }
    });
    expect(parseForecastCommand("Статистика категории Охлажденная продукция")).toEqual({
      kind: "history",
      scope: { kind: "category", category: "Охлажденная продукция" }
    });
  });
});
