import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePlanFactWorkbook } from "../src/forecast/planFactParser";

function set(sheet: XLSX.WorkSheet, address: string, value: string | number): void {
  sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: value };
}

function addHeaders(sheet: XLSX.WorkSheet, compact = false): void {
  set(sheet, "E6", "1 - 9");
  set(sheet, "E7", "План");
  set(sheet, "G7", "Факт");
  set(sheet, "E8", "Выручка");
  set(sheet, "F8", "Вал");
  set(sheet, "G8", "НДС");
  set(sheet, "H8", "Выручка");
  set(sheet, "I8", "Вал");

  if (compact) {
    set(sheet, "N6", "Итого");
    set(sheet, "N7", "План");
    set(sheet, "P7", "Факт");
    set(sheet, "S7", "Отклонение");
    set(sheet, "N8", "Выручка");
    set(sheet, "O8", "Вал");
    set(sheet, "P8", "НДС");
    set(sheet, "Q8", "Выручка");
    set(sheet, "R8", "Вал");
    set(sheet, "S8", "Выручка");
    set(sheet, "T8", "Вал");
    return;
  }

  const laterSegments = [
    { col: "N", label: "10 - 16", fact: "P" },
    { col: "W", label: "17 - 23", fact: "Y" },
    { col: "AF", label: "24 - 31", fact: "AH" }
  ];
  for (const segment of laterSegments) {
    set(sheet, `${segment.col}6`, segment.label);
    set(sheet, `${segment.col}7`, "План");
    set(sheet, `${segment.fact}7`, "Факт");
    set(sheet, `${segment.col}8`, "Выручка");
    const colIndex = XLSX.utils.decode_col(segment.col);
    set(sheet, `${XLSX.utils.encode_col(colIndex + 1)}8`, "Вал");
  }

  set(sheet, "AO6", "Итого");
  set(sheet, "AO7", "План");
  set(sheet, "AQ7", "Факт");
  set(sheet, "AO8", "Выручка");
  set(sheet, "AP8", "Вал");
  set(sheet, "AQ8", "НДС");
  set(sheet, "AR8", "Выручка");
  set(sheet, "AS8", "Вал");
}

function workbookBuffer(): Buffer {
  const sheet: XLSX.WorkSheet = {};
  set(sheet, "C2", "Начало периода: 01.08.2026");
  set(sheet, "C3", "Конец периода: 31.08.2026");
  addHeaders(sheet);

  const rows = [
    { row: 10, name: "Продукты", level: 0, e: 900, f: 270, ao: 3100, ap: 930, ar: 480, as: 148 },
    { row: 11, name: "Бакалея", level: 1, e: 450, f: 135, ao: 1550, ap: 465, ar: 220, as: 66 },
    { row: 12, name: "Напитки", level: 1, e: 300, f: 90, ao: 1033, ap: 310, ar: 170, as: 52 },
    { row: 13, name: "Заморозка, Полуфабрикаты", level: 1, e: 150, f: 45, ao: 517, ap: 155, ar: 90, as: 30 },
    { row: 14, name: "Итого", level: 0, e: 900, f: 270, ao: 3100, ap: 930, ar: 480, as: 148 }
  ];
  sheet["!rows"] = [];
  for (const item of rows) {
    set(sheet, `A${item.row}`, item.name);
    set(sheet, `E${item.row}`, item.e);
    set(sheet, `F${item.row}`, item.f);
    set(sheet, `AO${item.row}`, item.ao);
    set(sheet, `AP${item.row}`, item.ap);
    set(sheet, `AR${item.row}`, item.ar);
    set(sheet, `AS${item.row}`, item.as);
    sheet["!rows"]![item.row - 1] = { level: item.level };
  }
  sheet["!ref"] = "A1:AS14";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "План-факт");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", bookSST: true }) as Buffer;
}

function compactWorkbookBuffer(): Buffer {
  const sheet: XLSX.WorkSheet = {};
  set(sheet, "C2", "Начало периода: 01.08.2026");
  set(sheet, "C3", "Конец периода: 06.08.2026");
  addHeaders(sheet, true);

  const rows = [
    { row: 20, name: "Продукты", level: 0, plan: 600, marginPlan: 180, actual: 420, marginActual: 127 },
    { row: 21, name: "Бакалея", level: 1, plan: 240, marginPlan: 72, actual: 170, marginActual: 51 },
    { row: 22, name: "Напитки", level: 1, plan: 210, marginPlan: 63, actual: 160, marginActual: 48 },
    { row: 23, name: "Товары для детей", level: 1, plan: 150, marginPlan: 45, actual: 90, marginActual: 28 }
  ];
  sheet["!rows"] = [];
  for (const item of rows) {
    set(sheet, `A${item.row}`, item.name);
    set(sheet, `E${item.row}`, item.plan);
    set(sheet, `F${item.row}`, item.marginPlan);
    set(sheet, `N${item.row}`, item.plan);
    set(sheet, `O${item.row}`, item.marginPlan);
    set(sheet, `Q${item.row}`, item.actual);
    set(sheet, `R${item.row}`, item.marginActual);
    sheet["!rows"]![item.row - 1] = { level: item.level };
  }
  sheet["!ref"] = "A1:V23";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "TDSheet");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", bookSST: true }) as Buffer;
}

function breakSharedStringsPathCase(buffer: Buffer): Buffer {
  const lower = Buffer.from("xl/sharedStrings.xml");
  const upper = Buffer.from("xl/SharedStrings.xml");
  const broken = Buffer.from(buffer);
  let offset = broken.indexOf(lower);
  while (offset >= 0) {
    upper.copy(broken, offset);
    offset = broken.indexOf(lower, offset + upper.length);
  }
  return broken;
}

describe("parsePlanFactWorkbook", () => {
  it("parses the full-month layout and repairs the known SharedStrings path casing", () => {
    const parsed = parsePlanFactWorkbook(breakSharedStringsPathCase(workbookBuffer()), "факт 05.08.xlsx");
    expect(parsed.reportDate).toBe("2026-08-05");
    expect(parsed.planHorizonEnd).toBe("2026-08-31");
    expect(parsed.planIsFullMonth).toBe(true);
    expect(parsed.overall.planToDateRevenue).toBeCloseTo(500, 6);
    expect(parsed.overall.actualRevenue).toBe(480);
    expect(parsed.categories.map((item) => item.category)).toEqual([
      "Бакалея",
      "Напитки",
      "Заморозка, Полуфабрикаты"
    ]);
  });

  it("prorates a 1-9 plan when fact is available only through the sixth day", () => {
    const parsed = parsePlanFactWorkbook(compactWorkbookBuffer(), "факт 06.08 (2).xlsx");
    expect(parsed.reportDate).toBe("2026-08-06");
    expect(parsed.periodEnd).toBe("2026-08-06");
    expect(parsed.planHorizonEnd).toBe("2026-08-09");
    expect(parsed.planIsFullMonth).toBe(false);
    expect(parsed.overall.monthlyPlanRevenue).toBe(600);
    expect(parsed.overall.planToDateRevenue).toBeCloseTo(400, 6);
    expect(parsed.overall.actualRevenue).toBe(420);
    expect(parsed.overall.actualRevenue / parsed.overall.planToDateRevenue).toBeCloseTo(1.05, 6);
    expect(parsed.categories.map((item) => item.category)).toEqual([
      "Бакалея",
      "Напитки",
      "Товары для детей"
    ]);
  });
});
