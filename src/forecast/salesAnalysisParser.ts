import * as XLSX from "xlsx";
import type { SalesAggregateLine, SalesAnalysisSummary, SalesItemCandidate } from "./supportingTypes";
import {
  cellValue,
  firstSheet,
  normalizeLabel,
  numericValue,
  parseDateFromText,
  readForecastWorkbook,
  rowLevel,
  textValue
} from "./workbookUtils";

type Metrics = {
  previousRevenue: number;
  previousMargin: number;
  previousUnits: number;
  previousStock: number;
  currentRevenue: number;
  currentMargin: number;
  currentUnits: number;
  currentStock: number;
  currentStockValue: number;
};

type ParsedRow = Metrics & {
  row: number;
  level: number;
  name: string;
  category: string;
  subcategory: string | null;
};

function parsePeriods(sheet: XLSX.WorkSheet) {
  const values: Record<string, string | null> = {
    previousStart: null,
    previousEnd: null,
    currentStart: null,
    currentEnd: null
  };
  for (let row = 1; row <= 8; row += 1) {
    for (let col = 0; col <= 5; col += 1) {
      const text = textValue(cellValue(sheet, row, col));
      if (/начало периода1/i.test(text)) values.previousStart = parseDateFromText(text);
      if (/конец периода1/i.test(text)) values.previousEnd = parseDateFromText(text);
      if (/начало периода2/i.test(text)) values.currentStart = parseDateFromText(text);
      if (/конец периода2/i.test(text)) values.currentEnd = parseDateFromText(text);
    }
  }
  if (!values.previousStart || !values.previousEnd || !values.currentStart || !values.currentEnd) {
    throw new Error("Не найдены даты двух периодов в отчёте продаж с анализом.");
  }
  return values as Record<"previousStart" | "previousEnd" | "currentStart" | "currentEnd", string>;
}

function metrics(sheet: XLSX.WorkSheet, row: number, totalStart: number): Metrics {
  return {
    previousRevenue: numericValue(cellValue(sheet, row, totalStart)),
    previousMargin: numericValue(cellValue(sheet, row, totalStart + 1)),
    previousUnits: numericValue(cellValue(sheet, row, totalStart + 2)),
    previousStock: numericValue(cellValue(sheet, row, totalStart + 3)),
    currentRevenue: numericValue(cellValue(sheet, row, totalStart + 5)),
    currentMargin: numericValue(cellValue(sheet, row, totalStart + 6)),
    currentUnits: numericValue(cellValue(sheet, row, totalStart + 7)),
    currentStock: numericValue(cellValue(sheet, row, totalStart + 8)),
    currentStockValue: numericValue(cellValue(sheet, row, totalStart + 9))
  };
}

function aggregate(value: ParsedRow, parentCategory: string | null): SalesAggregateLine {
  return {
    name: value.name,
    parentCategory,
    previousRevenue: value.previousRevenue,
    previousMargin: value.previousMargin,
    previousUnits: value.previousUnits,
    previousStock: value.previousStock,
    currentRevenue: value.currentRevenue,
    currentMargin: value.currentMargin,
    currentUnits: value.currentUnits,
    currentStock: value.currentStock,
    currentStockValue: value.currentStockValue,
    revenueDelta: value.currentRevenue - value.previousRevenue,
    marginDelta: value.currentMargin - value.previousMargin
  };
}

function candidate(value: ParsedRow, storeStarts: number[], sheet: XLSX.WorkSheet, periodDays: number): SalesItemCandidate {
  let storesSoldCurrent = 0;
  let storesStockCurrent = 0;
  for (const start of storeStarts) {
    if (numericValue(cellValue(sheet, value.row, start + 7)) > 0) storesSoldCurrent += 1;
    if (numericValue(cellValue(sheet, value.row, start + 8)) > 0) storesStockCurrent += 1;
  }
  const dailyUnits = periodDays > 0 ? value.currentUnits / periodDays : 0;
  const stockDays = dailyUnits > 0 ? value.currentStock / dailyUnits : null;
  return {
    ...aggregate(value, value.subcategory),
    category: value.category,
    subcategory: value.subcategory,
    storesSoldCurrent,
    storesStockCurrent,
    stockDays
  };
}

function isExcludedPath(value: ParsedRow): boolean {
  const joined = `${value.category} ${value.subcategory ?? ""} ${value.name}`.toLowerCase().replace(/ё/g, "е");
  return joined.includes("уценка");
}

export function parseSalesAnalysisWorkbook(buffer: Buffer, filename: string): SalesAnalysisSummary {
  const workbook = readForecastWorkbook(buffer);
  const sheet = firstSheet(workbook);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const periods = parsePeriods(sheet);

  let totalStart = -1;
  const storeStarts: number[] = [];
  for (let col = 0; col <= range.e.c; col += 1) {
    const label = normalizeLabel(textValue(cellValue(sheet, 8, col)));
    if (label === "итого") totalStart = col;
    else if (col >= 4 && label) storeStarts.push(col);
  }
  if (totalStart < 0) throw new Error("Не найден итоговый блок по сети в продажах с анализом.");

  let productRow = 0;
  for (let row = 12; row <= range.e.r + 1; row += 1) {
    if (normalizeLabel(textValue(cellValue(sheet, row, 0))) === "продукты" && rowLevel(sheet, row) === 1) {
      productRow = row;
      break;
    }
  }
  if (!productRow) throw new Error("Не найден блок Продукты в продажах с анализом.");

  const parsedRows: ParsedRow[] = [];
  let currentCategory = "";
  let currentSubcategory: string | null = null;
  for (let row = productRow + 1; row <= range.e.r + 1; row += 1) {
    const level = rowLevel(sheet, row);
    if (level === null || level <= 1) break;
    const name = textValue(cellValue(sheet, row, 0));
    if (!name) continue;
    if (level === 2) {
      currentCategory = name;
      currentSubcategory = null;
    } else if (level === 3) currentSubcategory = name;
    if (!currentCategory) continue;
    parsedRows.push({ row, level, name, category: currentCategory, subcategory: currentSubcategory, ...metrics(sheet, row, totalStart) });
  }

  const categories = parsedRows.filter((row) => row.level === 2).map((row) => aggregate(row, null));
  const subcategories = parsedRows.filter((row) => row.level === 3).map((row) => aggregate(row, row.category));
  const leaves = parsedRows.filter((row, index) => {
    const next = parsedRows[index + 1];
    return row.level >= 4 && (!next || next.level <= row.level);
  });
  const periodDays = Math.max(1, Math.round((Date.parse(periods.currentEnd) - Date.parse(periods.currentStart)) / 86_400_000) + 1);
  const items = leaves.filter((row) => !isExcludedPath(row)).map((row) => candidate(row, storeStarts, sheet, periodDays));

  const returnCandidates = items
    .filter((item) => item.previousUnits > 0 && item.currentUnits <= 0 && item.currentStock <= 0 && item.previousRevenue >= 500)
    .sort((a, b) => b.previousRevenue - a.previousRevenue)
    .slice(0, 200);
  const stockWithoutSales = items
    .filter((item) => item.previousUnits > 0 && item.currentUnits <= 0 && item.currentStock > 0)
    .sort((a, b) => b.currentStockValue - a.currentStockValue)
    .slice(0, 200);
  const overstock = items
    .filter((item) => item.currentUnits > 0 && item.currentStock > 0 && (item.stockDays ?? 0) >= 90 && item.currentStockValue >= 1000)
    .sort((a, b) => (b.stockDays ?? 0) - (a.stockDays ?? 0))
    .slice(0, 200);
  const newItems = items
    .filter((item) => item.previousUnits <= 0 && item.currentUnits > 0)
    .sort((a, b) => b.currentRevenue - a.currentRevenue)
    .slice(0, 100);

  return {
    type: "sales_analysis",
    filename,
    reportDate: periods.currentEnd,
    periodStart: periods.currentStart,
    periodEnd: periods.currentEnd,
    previousPeriodStart: periods.previousStart,
    previousPeriodEnd: periods.previousEnd,
    itemCount: items.length,
    categories,
    subcategories,
    returnCandidates,
    stockWithoutSales,
    overstock,
    newItems
  };
}
