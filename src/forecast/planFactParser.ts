import * as XLSX from "xlsx";
import type { ParsedPlanFact, PlanFactLine } from "./types";

type RowInfo = { level?: number; hidden?: boolean };

type RawLine = PlanFactLine & {
  row: number;
  level: number | null;
  hidden: boolean;
};

type PlanSegment = {
  start: number;
  end: number;
  revenueCol: number;
  marginCol: number;
};

type PlanFactLayout = {
  totalPlanRevenueCol: number;
  totalPlanMarginCol: number;
  totalActualRevenueCol: number;
  totalActualMarginCol: number;
  segments: PlanSegment[];
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
  const repaired = repairCommonWorkbookPathCasing(buffer);
  return XLSX.read(repaired, { type: "buffer", cellStyles: true, cellDates: true });
}

function cell(sheet: XLSX.WorkSheet, address: string): unknown {
  return sheet[address]?.v;
}

function cellAt(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  return cell(sheet, XLSX.utils.encode_cell({ r: row - 1, c: col }));
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

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function findTextColumn(
  sheet: XLSX.WorkSheet,
  row: number,
  startCol: number,
  endCol: number,
  predicate: (value: string) => boolean
): number | null {
  for (let col = startCol; col <= endCol; col += 1) {
    if (predicate(normalizeLabel(text(cellAt(sheet, row, col))))) return col;
  }
  return null;
}

function findMetricColumns(
  sheet: XLSX.WorkSheet,
  row: number,
  startCol: number,
  endCol: number
): { revenueCol: number; marginCol: number } | null {
  const revenueCol = findTextColumn(sheet, row, startCol, endCol, (value) => value === "выручка");
  if (revenueCol === null) return null;
  const marginCol = findTextColumn(sheet, row, revenueCol + 1, endCol, (value) => value === "вал");
  if (marginCol === null) return null;
  return { revenueCol, marginCol };
}

function detectLayout(sheet: XLSX.WorkSheet, range: XLSX.Range): PlanFactLayout {
  const maxHeaderRow = Math.min(range.e.r + 1, 20);
  let totalHeaderRow: number | null = null;
  let totalStartCol: number | null = null;

  for (let row = range.s.r + 1; row <= maxHeaderRow; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      if (normalizeLabel(text(cellAt(sheet, row, col))) === "итого") {
        totalHeaderRow = row;
        totalStartCol = col;
      }
    }
  }

  if (totalHeaderRow === null || totalStartCol === null) {
    throw new Error("Не найден блок «Итого» в заголовке план-факта.");
  }

  let groupRow: number | null = null;
  let planAnchorCol: number | null = null;
  let factAnchorCol: number | null = null;
  let deviationAnchorCol: number | null = null;

  for (let row = totalHeaderRow; row <= Math.min(maxHeaderRow, totalHeaderRow + 4); row += 1) {
    const planCol = findTextColumn(sheet, row, totalStartCol, range.e.c, (value) => value === "план");
    const factCol = planCol === null ? null : findTextColumn(sheet, row, planCol + 1, range.e.c, (value) => value === "факт");
    if (planCol === null || factCol === null) continue;
    groupRow = row;
    planAnchorCol = planCol;
    factAnchorCol = factCol;
    deviationAnchorCol = findTextColumn(sheet, row, factCol + 1, range.e.c, (value) => value.startsWith("отклонение") || value.startsWith("откл"));
    break;
  }

  if (groupRow === null || planAnchorCol === null || factAnchorCol === null) {
    throw new Error("Не найдены заголовки «План» и «Факт» в блоке «Итого».");
  }

  let metricRow: number | null = null;
  let planMetrics: { revenueCol: number; marginCol: number } | null = null;
  let actualMetrics: { revenueCol: number; marginCol: number } | null = null;
  const actualEndCol = (deviationAnchorCol ?? (range.e.c + 1)) - 1;

  for (let row = groupRow + 1; row <= Math.min(maxHeaderRow, groupRow + 3); row += 1) {
    const plan = findMetricColumns(sheet, row, planAnchorCol, factAnchorCol - 1);
    const actual = findMetricColumns(sheet, row, factAnchorCol, actualEndCol);
    if (!plan || !actual) continue;
    metricRow = row;
    planMetrics = plan;
    actualMetrics = actual;
    break;
  }

  if (metricRow === null || !planMetrics || !actualMetrics) {
    throw new Error("Не удалось определить колонки выручки и вала в блоке «Итого».");
  }

  const segmentHeaders: Array<{ start: number; end: number; col: number }> = [];
  for (let col = range.s.c; col < totalStartCol; col += 1) {
    const raw = text(cellAt(sheet, totalHeaderRow, col));
    const match = raw.match(/^\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*$/);
    if (!match) continue;
    segmentHeaders.push({ start: Number(match[1]), end: Number(match[2]), col });
  }

  const segments: PlanSegment[] = [];
  for (let index = 0; index < segmentHeaders.length; index += 1) {
    const segment = segmentHeaders[index];
    const endCol = (segmentHeaders[index + 1]?.col ?? totalStartCol) - 1;
    const localPlanAnchor = findTextColumn(sheet, groupRow, segment.col, endCol, (value) => value === "план");
    if (localPlanAnchor === null) continue;
    const localFactAnchor = findTextColumn(sheet, groupRow, localPlanAnchor + 1, endCol, (value) => value === "факт");
    const metricEndCol = (localFactAnchor ?? (endCol + 1)) - 1;
    const metrics = findMetricColumns(sheet, metricRow, localPlanAnchor, metricEndCol);
    if (!metrics) continue;
    segments.push({ start: segment.start, end: segment.end, ...metrics });
  }

  if (!segments.length) {
    throw new Error("Не удалось определить недельные плановые блоки в отчёте.");
  }

  return {
    totalPlanRevenueCol: planMetrics.revenueCol,
    totalPlanMarginCol: planMetrics.marginCol,
    totalActualRevenueCol: actualMetrics.revenueCol,
    totalActualMarginCol: actualMetrics.marginCol,
    segments
  };
}

function proratedPlan(
  sheet: XLSX.WorkSheet,
  row: number,
  reportDay: number,
  periodEndDay: number,
  metric: "revenue" | "margin",
  layout: PlanFactLayout
): number {
  let result = 0;
  for (const segment of layout.segments) {
    const segmentEnd = Math.min(segment.end, periodEndDay);
    if (segmentEnd < segment.start || reportDay < segment.start) continue;
    const elapsed = Math.min(reportDay, segmentEnd) - segment.start + 1;
    const segmentDays = segmentEnd - segment.start + 1;
    const col = metric === "revenue" ? segment.revenueCol : segment.marginCol;
    const value = number(cellAt(sheet, row, col)) ?? 0;
    result += value * Math.max(0, Math.min(1, elapsed / segmentDays));
  }
  return result;
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

  const layout = detectLayout(sheet, range);
  const reportDay = Number(reportDate.slice(8, 10));
  const periodEndDay = Number(periodEnd.slice(8, 10));
  const rows = (sheet["!rows"] ?? []) as RowInfo[];
  const lines: RawLine[] = [];

  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const category = text(cell(sheet, `A${row}`));
    const monthlyPlanRevenue = number(cellAt(sheet, row, layout.totalPlanRevenueCol));
    const monthlyPlanMargin = number(cellAt(sheet, row, layout.totalPlanMarginCol));
    const actualRevenue = number(cellAt(sheet, row, layout.totalActualRevenueCol));
    const actualMargin = number(cellAt(sheet, row, layout.totalActualMarginCol));
    if (!category || monthlyPlanRevenue === null || monthlyPlanMargin === null || actualRevenue === null || actualMargin === null) continue;
    const rowInfo = rows[row - 1] ?? {};
    lines.push({
      row,
      level: typeof rowInfo.level === "number" ? rowInfo.level : null,
      hidden: rowInfo.hidden === true,
      category,
      monthlyPlanRevenue,
      monthlyPlanMargin,
      planToDateRevenue: proratedPlan(sheet, row, reportDay, periodEndDay, "revenue", layout),
      planToDateMargin: proratedPlan(sheet, row, reportDay, periodEndDay, "margin", layout),
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
