import * as XLSX from "xlsx";
import type { ComparisonMetricLine, PeriodComparisonSummary } from "./supportingTypes";
import {
  cellValue,
  firstSheet,
  normalizeLabel,
  numericValue,
  parseRussianDateRange,
  ratioChange,
  readForecastWorkbook,
  rowLevel,
  textValue
} from "./workbookUtils";

type PeriodBlock = { col: number; start: string; end: string };
type MetricColumns = { revenue: number; margin: number; stockQty: number; stockValue: number };

function findPeriods(sheet: XLSX.WorkSheet): PeriodBlock[] {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const periods: PeriodBlock[] = [];
  for (let row = 1; row <= Math.min(8, range.e.r + 1); row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const parsed = parseRussianDateRange(textValue(cellValue(sheet, row, col)));
      if (parsed && !periods.some((item) => item.col === col)) periods.push({ col, ...parsed });
    }
  }
  return periods.sort((a, b) => a.col - b.col);
}

function findMetricColumns(sheet: XLSX.WorkSheet, startCol: number, endCol: number): MetricColumns {
  const result: Partial<MetricColumns> = {};
  for (let col = startCol; col < endCol; col += 1) {
    const label = normalizeLabel(textValue(cellValue(sheet, 6, col)));
    if (!label) continue;
    if (label === "выручка") result.revenue = col;
    else if (label === "вал") result.margin = col;
    else if (label.includes("кол-во") || label.includes("количество")) result.stockQty = col;
    else if (label === "сумма") result.stockValue = col;
  }
  if ([result.revenue, result.margin, result.stockQty, result.stockValue].some((value) => value === undefined)) {
    throw new Error("Не удалось определить колонки выручки, вала и остатков в сравнении.");
  }
  return result as MetricColumns;
}

function line(sheet: XLSX.WorkSheet, row: number, name: string, parentCategory: string | null, previous: MetricColumns, current: MetricColumns): ComparisonMetricLine {
  const previousRevenue = numericValue(cellValue(sheet, row, previous.revenue));
  const previousMargin = numericValue(cellValue(sheet, row, previous.margin));
  const previousStockQty = numericValue(cellValue(sheet, row, previous.stockQty));
  const previousStockValue = numericValue(cellValue(sheet, row, previous.stockValue));
  const currentRevenue = numericValue(cellValue(sheet, row, current.revenue));
  const currentMargin = numericValue(cellValue(sheet, row, current.margin));
  const currentStockQty = numericValue(cellValue(sheet, row, current.stockQty));
  const currentStockValue = numericValue(cellValue(sheet, row, current.stockValue));
  return {
    name,
    parentCategory,
    previousRevenue,
    previousMargin,
    previousStockQty,
    previousStockValue,
    currentRevenue,
    currentMargin,
    currentStockQty,
    currentStockValue,
    revenueDelta: currentRevenue - previousRevenue,
    marginDelta: currentMargin - previousMargin,
    revenueGrowth: ratioChange(currentRevenue, previousRevenue),
    marginGrowth: ratioChange(currentMargin, previousMargin)
  };
}

export function parsePeriodComparisonWorkbook(buffer: Buffer, filename: string): PeriodComparisonSummary {
  const workbook = readForecastWorkbook(buffer);
  const sheet = firstSheet(workbook);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const periods = findPeriods(sheet);
  if (periods.length < 2) throw new Error("Не найдены два сопоставимых периода в отчёте.");
  const currentPeriod = periods.at(-1)!;
  const previousPeriod = periods.at(-2)!;
  const previousColumns = findMetricColumns(sheet, previousPeriod.col, Math.min(range.e.c + 1, previousPeriod.col + 5));
  const currentColumns = findMetricColumns(sheet, currentPeriod.col, Math.min(range.e.c + 1, currentPeriod.col + 5));

  let productRow = 0;
  for (let row = 1; row <= range.e.r + 1; row += 1) {
    if (normalizeLabel(textValue(cellValue(sheet, row, 0))) !== "продукты") continue;
    if (rowLevel(sheet, row) === 2) productRow = row;
  }
  if (!productRow) throw new Error("Не найден итоговый блок Продукты в сравнении.");

  const categories: ComparisonMetricLine[] = [];
  const subcategories: ComparisonMetricLine[] = [];
  let currentCategory: string | null = null;
  for (let row = productRow + 1; row <= range.e.r + 1; row += 1) {
    const level = rowLevel(sheet, row);
    if (level !== null && level <= 2) break;
    const name = textValue(cellValue(sheet, row, 0));
    if (!name) continue;
    if (level === 3) {
      currentCategory = name;
      categories.push(line(sheet, row, name, null, previousColumns, currentColumns));
    } else if (level === 4 && currentCategory) {
      subcategories.push(line(sheet, row, name, currentCategory, previousColumns, currentColumns));
    }
  }
  if (categories.length < 3) throw new Error("Не удалось определить категории в сравнении с прошлым периодом.");

  return {
    type: "period_comparison",
    filename,
    reportDate: currentPeriod.end,
    periodStart: currentPeriod.start,
    periodEnd: currentPeriod.end,
    previousPeriodStart: previousPeriod.start,
    previousPeriodEnd: previousPeriod.end,
    categories,
    subcategories
  };
}
