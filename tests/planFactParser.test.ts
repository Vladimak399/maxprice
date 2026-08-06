import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePlanFactWorkbook } from "../src/forecast/planFactParser";

function set(sheet: XLSX.WorkSheet, address: string, value: string | number): void {
  sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: value };
}

function workbookBuffer(): Buffer {
  const sheet: XLSX.WorkSheet = {};
  set(sheet, "C2", "Начало периода: 01.08.2026");
  set(sheet, "C3", "Конец периода: 31.08.2026");

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
  it("parses the aggregate plan-fact and repairs the known SharedStrings path casing", () => {
    const parsed = parsePlanFactWorkbook(breakSharedStringsPathCase(workbookBuffer()), "факт 05.08.xlsx");
    expect(parsed.reportDate).toBe("2026-08-05");
    expect(parsed.overall.planToDateRevenue).toBeCloseTo(500, 6);
    expect(parsed.overall.actualRevenue).toBe(480);
    expect(parsed.categories.map((item) => item.category)).toEqual([
      "Бакалея",
      "Напитки",
      "Заморозка, Полуфабрикаты"
    ]);
  });
});
