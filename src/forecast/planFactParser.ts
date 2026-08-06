import * as XLSX from "xlsx";
import type { ParsedPlanFact, PlanFactLine } from "./types";

type RowInfo = { level?: number; hidden?: boolean };

type RawLine = PlanFactLine & {
  row: number;
  level: number | null;
  hidden: boolean;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = text(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function repairCommonWorkbookPathCasing(buffer: Buffer): Buffer {
  const original = Buffer.from("xl/SharedStrings.xml", "utf8");
  const replacement = Buffer.from("xl/sharedStrings.xml", "utf8");
  if (original.length !== replacement.length || buffer.indexOf(original) < 0) return buffer;
  const repaired = Buffer.from(buffer);
  let offset = repaired.indexOf(original);
  while (offset >= 0) {
    replacement.copy(repaired, offset);
    offset = repaired.indexOf(original, offset + replacement.length);
  }
  return repaired;
}

function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: "buffer", cellStyles: true, cellDates: true });
  } catch (originalError) {
    const repaired = repairCommonWorkbookPathCasing(buffer);
    if (repaired === buffer) throw originalError;
    return XLSX.read(repaired, { type: "buffer", cellStyles: true, cellDates: true });
  }
}

function cell(sheet: XLSX.WorkSheet, address: string): unknown {
  return sheet[address]?.v;
}

function parseIsoDate(value: string): string | null {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseReportDate(filename: string, periodStart: string): string | null {
  const year = Number(periodStart.slice(0, 4));
  const matches = [...filename.matchAll(/(?:^|\D)(\d{1,2})[._-](\d{1,2})(?:[._-](\d{2,4}))?(?=\D|$)/g)];
  const match = matches.at(-1);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let parsedYear = match[3] ? Number(match[3]) : year;
  if (parsedYear < 100) parsedYear += 2000;
  const date = new Date(Date.UTC(parsedYear, month - 1, day));
  if (date.getUTCFullYear() !== parsedYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function proratedPlan(sheet: XLSX.WorkSheet, row: number, reportDay: number, periodEndDay: number, metric: "revenue" | "margin"): number {
  const segments = [
    { start: 1, end: 9, revenue: "E", margin: "F" },
    { start: 10, end: 16, revenue: "N", margin: "O" },
    { start: 17, end: 23, revenue: "W", margin: "X" },
    { start: 24, end: 31, revenue: "AF", margin: "AG" }
  ] as const;

  let result = 0;
  for (const segment of segments) {
    const segmentEnd = Math.min(segment.end, periodEndDay);
    if (segmentEnd < segment.start || reportDay < segment.start) continue;
    const elapsed = Math.min(reportDay, segmentEnd) - segment.start + 1;
    const segmentDays = segmentEnd - segment.start + 1;
    const value = number(cell(sheet, `${segment[metric]}${row}`)) ?? 0;
    result += value * Math.max(0, Math.min(1, elapsed / segmentDays));
  }
  return result;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function parsePlanFactWorkbook(buffer: Buffer, filename: string): ParsedPlanFact {
  const workbook = readWorkbook(buffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге нет листов.");
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  for (let row = range.s.r + 1; row <= Math.min(range.e.r + 1, 20); row += 1) {
    for (let col = range.s.c; col <= Math.min(range.e.c, 8); col += 1) {
      const value = text(cell(sheet, XLSX.utils.encode_cell({ r: row - 1, c: col })));
      if (!periodStart && /начало периода/i.test(value)) periodStart = parseIsoDate(value);
      if (!periodEnd && /конец периода/i.test(value)) periodEnd = parseIsoDate(value);
    }
  }
  if (!periodStart || !periodEnd) throw new Error("Не найдены даты начала и конца периода.");

  const reportDate = parseReportDate(filename, periodStart);
  if (!reportDate) throw new Error("Не удалось определить дату отчёта из имени файла. Используйте формат вроде: факт 08.08.xlsx");
  if (reportDate < periodStart || reportDate > periodEnd) throw new Error("Дата отчёта из имени файла не входит в период книги.");
  const reportDay = Number(reportDate.slice(8, 10));
  const periodEndDay = Number(periodEnd.slice(8, 10));
  const rows = (sheet["!rows"] ?? []) as RowInfo[];
  const lines: RawLine[] = [];

  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const category = text(cell(sheet, `A${row}`));
    const monthlyPlanRevenue = number(cell(sheet, `AO${row}`));
    const monthlyPlanMargin = number(cell(sheet, `AP${row}`));
    const actualRevenue = number(cell(sheet, `AR${row}`));
    const actualMargin = number(cell(sheet, `AS${row}`));
    if (!category || monthlyPlanRevenue === null || monthlyPlanMargin === null || actualRevenue === null || actualMargin === null) continue;
    const rowInfo = rows[row - 1] ?? {};
    lines.push({
      row,
      level: typeof rowInfo.level === "number" ? rowInfo.level : null,
      hidden: rowInfo.hidden === true,
      category,
      monthlyPlanRevenue,
      monthlyPlanMargin,
      planToDateRevenue: proratedPlan(sheet, row, reportDay, periodEndDay, "revenue"),
      planToDateMargin: proratedPlan(sheet, row, reportDay, periodEndDay, "margin"),
      actualRevenue,
      actualMargin
    });
  }

  const overallCandidates = lines.filter((line) => normalizeLabel(line.category) === "продукты" && (line.level === null || line.level === 0));
  const overall = overallCandidates.at(-1) ?? lines.filter((line) => normalizeLabel(line.category) === "итого").at(-1);
  if (!overall) throw new Error("Не найден итоговый блок проекта Продукты.");

  const afterOverall = lines.filter((line) => line.row > overall.row && normalizeLabel(line.category) !== "итого");
  let categories = afterOverall.filter((line) => line.level === 1 && !line.hidden);
  if (categories.length < 3) {
    categories = afterOverall.filter((line) => line.monthlyPlanRevenue > 0 && line.actualRevenue >= 0);
  }

  const unique = new Map<string, RawLine>();
  for (const line of categories) {
    const key = normalizeLabel(line.category);
    if (!unique.has(key)) unique.set(key, line);
  }
  const parsedCategories = [...unique.values()].map(({ row: _row, level: _level, hidden: _hidden, ...line }) => line);
  if (parsedCategories.length < 3) throw new Error("Не удалось определить итоговые категории в отчёте.");

  const { row: _row, level: _level, hidden: _hidden, ...overallLine } = overall;
  return {
    filename,
    reportDate,
    periodStart,
    periodEnd,
    overall: overallLine,
    categories: parsedCategories
  };
}
