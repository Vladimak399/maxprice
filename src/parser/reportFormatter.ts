import type { GroupedPriceChange, ParseResult, PriceChangeItem } from "../types/price.js";
import { chunkText } from "../utils/text.js";
import { formatMoney, formatPercent } from "./money.js";

function normalizeProductKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function pricePairKey(item: PriceChangeItem): string {
  return `${normalizeProductKey(item.name)}::${item.oldPrice}::${item.newPrice}`;
}

export function groupPriceItems(items: PriceChangeItem[]): GroupedPriceChange[] {
  const grouped = new Map<string, GroupedPriceChange>();

  for (const item of items) {
    const key = pricePairKey(item);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        name: item.name,
        shops: [item.shop],
        oldPrice: item.oldPrice,
        newPrice: item.newPrice,
        diff: item.diff,
        percent: item.percent,
        count: 1
      });
      continue;
    }

    if (!existing.shops.includes(item.shop)) {
      existing.shops.push(item.shop);
      existing.shops.sort((a, b) => a.localeCompare(b, "ru"));
    }
    existing.count += 1;
  }

  return [...grouped.values()].sort((a, b) => {
    const percentA = a.percent ?? 0;
    const percentB = b.percent ?? 0;
    return percentB - percentA || b.count - a.count || a.name.localeCompare(b.name, "ru");
  });
}

function formatGrowthBlock(items: PriceChangeItem[]): string[] {
  const grouped = groupPriceItems(items);
  if (grouped.length === 0) return [];

  const lines = ["⚠️ Рост закупочной цены", ""];

  grouped.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`);
    lines.push(`Магазины: ${item.shops.join(", ")}`);
    lines.push(`Было: ${formatMoney(item.oldPrice)}`);
    lines.push(`В накладной: ${formatMoney(item.newPrice)}`);

    if (typeof item.diff === "number" && typeof item.percent === "number") {
      lines.push(`Рост: +${formatMoney(item.diff)} / +${formatPercent(item.percent)}%`);
    }

    lines.push(`Повторов: ${item.count}`);
    lines.push("");
  });

  return lines;
}

function formatZeroPriceBlock(items: PriceChangeItem[]): string[] {
  const grouped = groupPriceItems(items);
  if (grouped.length === 0) return [];

  const lines = ["🔎 Проверить цену в базе = 0", ""];

  grouped.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`);
    lines.push(`Магазины: ${item.shops.join(", ")}`);
    lines.push(`В накладной: ${formatMoney(item.newPrice)}`);
    lines.push(`Повторов: ${item.count}`);
    lines.push("");
  });

  return lines;
}

export function formatReport(result: ParseResult): string | null {
  const lines = [
    ...formatGrowthBlock(result.growthItems),
    ...formatZeroPriceBlock(result.zeroPriceItems)
  ];

  const report = lines.join("\n").trim();
  return report.length > 0 ? report : null;
}

export function formatReportChunks(result: ParseResult, maxLength = 3900): string[] {
  const report = formatReport(result);
  if (!report) return [];
  return chunkText(report, maxLength);
}
