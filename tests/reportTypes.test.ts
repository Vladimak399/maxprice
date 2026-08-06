import { describe, expect, it } from "vitest";
import { detectForecastUploadType } from "../src/forecast/reportTypes";

describe("forecast upload type detection", () => {
  it("recognizes supported reports", () => {
    expect(detectForecastUploadType("факт 05.08.xlsx")).toBe("plan_fact");
    expect(detectForecastUploadType("сравнение с прошлым периодом 08.xlsx")).toBe("period_comparison");
    expect(detectForecastUploadType("продажи с анализом 08.xlsx")).toBe("sales_analysis");
  });

  it("does not route an unknown workbook to plan-fact", () => {
    expect(detectForecastUploadType("остатки.xlsx")).toBeNull();
  });
});
