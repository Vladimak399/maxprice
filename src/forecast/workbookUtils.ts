import * as XLSX from "xlsx";

export type SheetRowInfo = { level?: number; hidden?: boolean };

export function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function numericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = textValue(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function repairCommonWorkbookPathCasing(buffer: Buffer): Buffer {
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

export function readForecastWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(repairCommonWorkbookPathCasing(buffer), {
    type: "buffer",
    cellStyles: true,
    cellDates: true,
    dense: false
  });
}

export function firstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("В книге нет листов.");
  return workbook.Sheets[sheetName];
}

export function cellValue(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })]?.v;
}

export function rowLevel(sheet: XLSX.WorkSheet, row: number): number | null {
  const info = ((sheet["!rows"] ?? []) as SheetRowInfo[])[row - 1];
  return typeof info?.level === "number" ? info.level : null;
}

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12
};

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Некорректная дата периода в отчёте.");
  }
  return date.toISOString().slice(0, 10);
}

export function parseRussianDateRange(value: string): { start: string; end: string } | null {
  const match = value.toLowerCase().match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[3]];
  if (!month) return null;
  const year = Number(match[4]);
  return { start: isoDate(year, month, Number(match[1])), end: isoDate(year, month, Number(match[2])) };
}

export function parseDateFromText(value: string): string | null {
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

export function ratioChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}
