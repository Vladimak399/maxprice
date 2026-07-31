export type UnorderedGoodsStatsCommand = {
  kind: "suppliers" | "products" | "summary" | "help";
  periodDays: number;
};

export type SupplierStatsRow = {
  counterparty: string;
  events: number;
  items: number;
  excessQuantity: number;
};

export type ProductStatsRow = {
  productCode: string;
  productName: string;
  occurrences: number;
  excessQuantity: number;
};

export type UnorderedGoodsChatStats = {
  periodDays: number;
  totals: { events: number; items: number; counterparties: number; excessQuantity: number };
  suppliers: SupplierStatsRow[];
  products: ProductStatsRow[];
};

const PERIOD_MIN = 1;
const PERIOD_MAX = 365;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/^\//, "").replace(/@\S+/, "").replace(/\s+/g, " ");
}

function periodFrom(text: string): number {
  const value = text.match(/\b(\d{1,3})\b/)?.[1];
  if (!value) return 30;
  return Math.min(PERIOD_MAX, Math.max(PERIOD_MIN, Number(value)));
}

export function parseUnorderedGoodsStatsCommand(text: string): UnorderedGoodsStatsCommand | null {
  const command = normalize(text);
  if (["аналитика помощь", "статистика помощь", "stats help", "analytics help"].includes(command)) return { kind: "help", periodDays: 30 };
  if (/^(поставщики|рейтинг поставщиков|suppliers)(\s+\d{1,3})?$/.test(command)) return { kind: "suppliers", periodDays: periodFrom(command) };
  if (/^(товары|рейтинг товаров|products)(\s+\d{1,3})?$/.test(command)) return { kind: "products", periodDays: periodFrom(command) };
  if (/^(статистика|аналитика|stats|analytics)(\s+\d{1,3})?$/.test(command)) return { kind: "summary", periodDays: periodFrom(command) };
  return null;
}

function number(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

export function formatUnorderedGoodsStats(command: UnorderedGoodsStatsCommand, stats: UnorderedGoodsChatStats): string {
  if (command.kind === "help") {
    return [
      "📊 Команды аналитики поставок",
      "",
      "поставщики 30 — рейтинг поставщиков за 30 дней",
      "товары 30 — чаще всего добавляемые товары",
      "статистика 30 — общая сводка",
      "",
      "Период можно указать от 1 до 365 дней. По умолчанию 30."
    ].join("\n");
  }

  if (command.kind === "suppliers") {
    const lines = stats.suppliers.map((row, index) => `${index + 1}. ${row.counterparty}\n   Случаев: ${row.events} · позиций: ${row.items} · лишнее количество: ${number(row.excessQuantity)}`);
    return [`🚚 Поставщики с нарушениями за ${stats.periodDays} дн.`, "", ...(lines.length ? lines : ["Данных за этот период пока нет."])].join("\n");
  }

  if (command.kind === "products") {
    const lines = stats.products.map((row, index) => `${index + 1}. ${row.productName || "Товар не распознан"}${row.productCode ? ` (${row.productCode})` : ""}\n   Случаев: ${row.occurrences} · лишнее количество: ${number(row.excessQuantity)}`);
    return [`📦 Чаще всего добавляемые товары за ${stats.periodDays} дн.`, "", ...(lines.length ? lines : ["Данных за этот период пока нет."])].join("\n");
  }

  return [
    `📊 Сводка нарушений поставок за ${stats.periodDays} дн.`,
    "",
    `Поступлений с нарушениями: ${stats.totals.events}`,
    `Лишних товарных позиций: ${stats.totals.items}`,
    `Поставщиков: ${stats.totals.counterparties}`,
    `Общее лишнее количество: ${number(stats.totals.excessQuantity)}`,
    "",
    "Для детализации: поставщики, товары или аналитика помощь"
  ].join("\n");
}
