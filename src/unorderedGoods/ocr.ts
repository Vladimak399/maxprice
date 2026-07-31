import { createRequire } from "node:module";
import { dirname } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { detectMarkedRows } from "./imageAnalysis";
import type { MarkedTableRow, UnorderedGoodsAnalysis } from "./types";

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const require = createRequire(import.meta.url);
    const languageRoot = dirname(require.resolve("@tesseract.js-data/rus"));
    workerPromise = createWorker("rus", OEM.LSTM_ONLY, { langPath: `${languageRoot}/4.0.0`, gzip: true });
  }
  return workerPromise;
}

function capture(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => {
    const looksLikeOrder = /(?:заказ|закез)\s+[гп].{0,8}став/i.test(line);
    const looksLikeItem = line.length > 70 && /\d+[.,]\d{3}/.test(line) && /\d{1,2}%/.test(line);
    return looksLikeOrder || looksLikeItem;
  });
}

export function parseItemLine(line: string, visibleIndex: number, markerRatio: number): MarkedTableRow {
  const rowMatch = /^\D{0,8}(\d{1,3})\s+/.exec(line);
  const sourceRowNumber = rowMatch ? Number(rowMatch[1]) : null;
  const productCode = /\b\d{12,14}\b/.exec(line)?.[0] ?? null;
  const afterIdentity = productCode ? line.slice(line.indexOf(productCode) + productCode.length) : line.replace(/^\D{0,8}\d{1,3}\s+/, "");
  const quantityMatches = [...afterIdentity.matchAll(/\b\d+[.,]\d{3}\b/g)];
  const productEnd = quantityMatches[0]?.index ?? afterIdentity.search(/заказ\s+[гп]?[оа]?став/i);
  const productName = afterIdentity.slice(0, productEnd >= 0 ? productEnd : undefined).replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim() || "Товар не распознан";
  const receivedQuantity = parseNumber(quantityMatches[0]?.[0]);
  const orderedQuantity = parseNumber(quantityMatches[1]?.[0]);
  return { visibleIndex, sourceRowNumber, productCode, productName, receivedQuantity, orderedQuantity, markerRatio, ocrText: line };
}

export function parseScreenshotText(text: string, confidence: number, markedIndexes: number[], ratios: number[]): UnorderedGoodsAnalysis {
  const rows = itemLines(text);
  const markedRows = markedIndexes.map((index) => parseItemLine(rows[index] ?? "", index + 1, ratios[index] ?? 0));
  const counterpartyLine = text.split(/\r?\n/).find((line) => /контрагент/i.test(line)) ?? "";
  const afterCounterparty = counterpartyLine.replace(/^.*?контрагент\s*[-—_ :]*[\[|]?\s*/i, "");
  const [counterpartyPart, warehousePart] = afterCounterparty.split(/на\s*склад/i, 2);
  return {
    counterparty: counterpartyPart?.replace(/[|@\[\]„“]+.*$/g, "").replace(/\s+/g, " ").trim() || null,
    warehouse: warehousePart?.replace(/^[|:.\s]+/, "").replace(/[|@\[\]„“]+.*$/g, "").replace(/\s+/g, " ").trim() || null,
    documentNumber: capture(text, /Номер\s*:\s*[\[|]?\s*([^\s,;]+)/i),
    documentDate: capture(text, /(?:от\s*:|Номер[^\n]{0,80}?от\s*:?)\s*[\[|]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i),
    ocrConfidence: confidence,
    visibleRows: rows.length,
    markedRows,
    rawText: text
  };
}

export async function analyzeUnorderedGoodsScreenshot(image: Buffer): Promise<UnorderedGoodsAnalysis> {
  const marker = await detectMarkedRows(image);
  if (!marker) throw new Error("Не найдена размеченная колонка таблицы");
  const prepared = await sharp(image).grayscale().normalize().sharpen().png().toBuffer();
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  const recognized = await worker.recognize(prepared);
  const result = parseScreenshotText(recognized.data.text, recognized.data.confidence, [], marker.ratios);
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 1920;
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: "1" });
  result.markedRows = [];
  for (const index of marker.markedIndexes) {
    const top = Math.floor(marker.y + index * marker.height / marker.rowCount);
    const bottom = Math.floor(marker.y + (index + 1) * marker.height / marker.rowCount);
    const rowImage = await sharp(image).extract({ left: 0, top, width: Math.max(1, Math.floor(width * 0.97)), height: Math.max(1, bottom - top) }).resize({ width: Math.floor(width * 1.94) }).grayscale().normalize().sharpen().png().toBuffer();
    const rowText = (await worker.recognize(rowImage)).data.text.trim();
    result.markedRows.push(parseItemLine(rowText, index + 1, marker.ratios[index] ?? 0));
  }
  result.visibleRows = marker.rowCount;
  return result;
}
