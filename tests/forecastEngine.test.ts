import { describe, expect, it } from "vitest";
import { buildForecast } from "../src/forecast/forecastEngine";
import type { StoredPlanFactSnapshot } from "../src/forecast/types";

function snapshot(overrides: Partial<StoredPlanFactSnapshot> = {}): StoredPlanFactSnapshot {
  return {
    id: 1,
    sourceUserId: "1",
    sourceChatId: "1",
    messageId: "m1",
    filename: "факт 05.08.xlsx",
    reportDate: "2026-08-05",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    createdAt: "2026-08-05T08:00:00.000Z",
    overall: {
      category: "Продукты",
      monthlyPlanRevenue: 3100,
      monthlyPlanMargin: 930,
      planToDateRevenue: 500,
      planToDateMargin: 150,
      actualRevenue: 480,
      actualMargin: 148
    },
    categories: [{
      category: "Бакалея",
      monthlyPlanRevenue: 3100,
      monthlyPlanMargin: 930,
      planToDateRevenue: 500,
      planToDateMargin: 150,
      actualRevenue: 480,
      actualMargin: 148
    }],
    ...overrides
  };
}

describe("buildForecast", () => {
  it("uses plan curve and mean reversion instead of straight-line extrapolation", () => {
    const result = buildForecast(snapshot(), null, null);
    expect(result.planToDateRatio).toBeCloseTo(0.96, 4);
    expect(result.forecastRevenueRatio).toBeGreaterThan(0.97);
    expect(result.forecastRevenueRatio).toBeLessThan(1.01);
    expect(result.requiredDailyRevenue).toBeGreaterThan(0);
  });

  it("uses the latest interval when a previous snapshot exists", () => {
    const previous = snapshot({
      id: 0,
      filename: "факт 02.08.xlsx",
      reportDate: "2026-08-02",
      overall: {
        category: "Продукты",
        monthlyPlanRevenue: 3100,
        monthlyPlanMargin: 930,
        planToDateRevenue: 200,
        planToDateMargin: 60,
        actualRevenue: 180,
        actualMargin: 54
      },
      categories: [{
        category: "Бакалея",
        monthlyPlanRevenue: 3100,
        monthlyPlanMargin: 930,
        planToDateRevenue: 200,
        planToDateMargin: 60,
        actualRevenue: 180,
        actualMargin: 54
      }]
    });
    const result = buildForecast(snapshot(), previous, null);
    expect(result.recentDailyRevenue).toBeCloseTo(100, 4);
    expect(result.forecastRevenueRatio).toBeGreaterThan(0.98);
  });
});
