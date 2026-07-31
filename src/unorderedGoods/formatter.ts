import type { MarkedTableRow, UnorderedGoodsAnalysis } from "./types";

export type SupplierViolationHistory = {
  periodDays: number;
  events: number;
  items: number;
  excessQuantity: number;
};

function quantity(value: number | null): string {
  return value === null ? "?" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(value) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function isUnordered(row: MarkedTableRow): boolean {
  return row.receivedQuantity !== null && (row.orderedQuantity === null || row.orderedQuantity === 0);
}

function excess(row: MarkedTableRow): number {
  if (row.receivedQuantity === null) return 0;
  return Math.max(0, row.receivedQuantity - (row.orderedQuantity ?? 0));
}

function title(result: UnorderedGoodsAnalysis, history?: SupplierViolationHistory | null): string {
  const unordered = result.markedRows.filter(isUnordered).length;
  const exceeded = result.markedRows.length - unordered;
  const totalExcess = result.markedRows.reduce((sum, row) => sum + excess(row), 0);
  const severity = (history?.events ?? 0) >= 3 ? "🚨" : totalExcess >= 50 || result.markedRows.length >= 5 ? "🔴" : "⚠️";
  if (unordered && !exceeded) return `${severity} ТОВАР БЕЗ ЗАКАЗА`;
  if (exceeded && !unordered) return `${severity} ПРЕВЫШЕНИЕ ЗАКАЗА`;
  return `${severity} НАРУШЕНИЕ ПОСТАВКИ`;
}

export function formatUnorderedGoodsAlert(result: UnorderedGoodsAnalysis, history?: SupplierViolationHistory | null): string {
  const lines = [
    title(result, history),
    "",
    result.counterparty ?? "Контрагент не распознан"
  ];
  const context = [result.warehouse, result.documentNumber ? `док. ${result.documentNumber}` : null].filter(Boolean).join(" · ");
  if (context) lines.push(context);

  result.markedRows.forEach((row, index) => {
    const type = isUnordered(row) ? "БЕЗ ЗАКАЗА" : "СВЕРХ ЗАКАЗА";
    const amount = excess(row);
    lines.push("", `${index + 1}. ${row.productName}`);
    lines.push(`${type}: заказ ${quantity(row.orderedQuantity)} · поступило ${quantity(row.receivedQuantity)} · лишнее +${quantity(amount)}`);
    if (row.productCode) lines.push(`Код: ${row.productCode}`);
  });

  if (history && history.events > 0) {
    lines.push(
      "",
      `За ${history.periodDays} дней: ${history.events} ${plural(history.events, "проблемная поставка", "проблемные поставки", "проблемных поставок")} · ${history.items} ${plural(history.items, "позиция", "позиции", "позиций")} · +${quantity(history.excessQuantity)} ед.`
    );
  }

  if (result.ocrConfidence < 60) lines.push("", `🔴 Низкая точность распознавания: ${Math.round(result.ocrConfidence)}%. Обязательно проверьте скриншот.`);
  else if (result.ocrConfidence < 85) lines.push("", `⚠️ Точность распознавания: ${Math.round(result.ocrConfidence)}%. Желательна ручная проверка.`);

  return lines.join("\n");
}
