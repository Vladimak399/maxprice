import type { UnorderedGoodsAnalysis } from "./types";

function quantity(value: number | null): string { return value === null ? "не распознано" : String(value).replace(".", ","); }

export function formatUnorderedGoodsAlert(result: UnorderedGoodsAnalysis): string {
  const lines = [
    "⚠️ ТОВАР БЕЗ ЗАКАЗА / СВЕРХ ЗАКАЗА",
    "",
    `Контрагент: ${result.counterparty ?? "не распознан"}`,
    `Склад: ${result.warehouse ?? "не распознан"}`,
    `Документ: ${result.documentNumber ?? "не распознан"}`,
    `Дата: ${result.documentDate ?? "не распознана"}`,
    "",
    `Выделено проблемных строк: ${result.markedRows.length}`
  ];
  result.markedRows.forEach((row, index) => {
    lines.push("", `${index + 1}. ${row.productName}`);
    if (row.productCode) lines.push(`Код/штрихкод: ${row.productCode}`);
    lines.push(`Поступило: ${quantity(row.receivedQuantity)}`);
    if (row.orderedQuantity !== null) lines.push(`В заказе: ${quantity(row.orderedQuantity)}`);
  });
  lines.push("", `OCR: ${Math.round(result.ocrConfidence)}%`, "Оригинальный скриншот находится в рабочем чате.");
  return lines.join("\n");
}
