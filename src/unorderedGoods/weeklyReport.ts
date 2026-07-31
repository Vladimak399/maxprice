import type { ChatConfig } from "../config/chats";
import { resolveTarget } from "../config/chats";

export type WeeklyComparison = {
  current: { events: number; items: number; excessQuantity: number };
  previous: { events: number; items: number; excessQuantity: number };
  suppliers: Array<{ counterparty: string; events: number; items: number; excessQuantity: number }>;
  products: Array<{ productName: string; productCode: string; occurrences: number; excessQuantity: number }>;
  warehouses: Array<{ warehouse: string; events: number; items: number; excessQuantity: number }>;
};

function number(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function trend(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "без изменений" : "новые случаи";
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "без изменений";
  return `${percent > 0 ? "рост" : "снижение"} ${Math.abs(percent)}%`;
}

export function formatWeeklyUnorderedGoodsReport(data: WeeklyComparison): string {
  const lines = [
    "📊 ЕЖЕНЕДЕЛЬНАЯ СВОДКА ПО ПОСТАВКАМ",
    "",
    `Проблемных поставок: ${data.current.events} (${trend(data.current.events, data.previous.events)})`,
    `Лишних позиций: ${data.current.items} (${trend(data.current.items, data.previous.items)})`,
    `Лишнее количество: +${number(data.current.excessQuantity)} (${trend(data.current.excessQuantity, data.previous.excessQuantity)})`
  ];

  if (data.suppliers.length) {
    lines.push("", "🚚 Поставщики:");
    data.suppliers.slice(0, 5).forEach((row, index) => lines.push(`${index + 1}. ${row.counterparty}: ${row.events} поставок · ${row.items} позиций · +${number(row.excessQuantity)}`));
  }
  if (data.products.length) {
    lines.push("", "📦 Часто добавляемые товары:");
    data.products.slice(0, 5).forEach((row, index) => lines.push(`${index + 1}. ${row.productName}${row.productCode ? ` (${row.productCode})` : ""}: ${row.occurrences} раз · +${number(row.excessQuantity)}`));
  }
  if (data.warehouses.length) {
    lines.push("", "🏬 Склады:");
    data.warehouses.slice(0, 5).forEach((row, index) => lines.push(`${index + 1}. ${row.warehouse}: ${row.events} поставок · ${row.items} позиций · +${number(row.excessQuantity)}`));
  }
  if (!data.current.events) lines.push("", "За последние 7 дней нарушений не зафиксировано.");
  lines.push("", "Команды для детализации: поставщики 7 · товары 7 · статистика 7");
  return lines.join("\n");
}

export function uniqueNotificationTargets(configs: ChatConfig[]): Array<{ userId?: string; chatId?: string }> {
  const unique = new Map<string, { userId?: string; chatId?: string }>();
  for (const config of configs) {
    if (!config.enabled || (config.mode !== "price_changes" && config.mode !== "unordered_goods")) continue;
    const target = resolveTarget(config);
    const key = target.chatId ? `chat:${target.chatId}` : target.userId ? `user:${target.userId}` : null;
    if (key) unique.set(key, target);
  }
  return [...unique.values()];
}
