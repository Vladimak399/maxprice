import type { ParseResult, PriceChangeItem } from "../types/price";
import { parseMoney, roundMoney, roundPercent } from "./money";
import { detectShopInLine } from "./shops";

const PRICE_LINE_RE = /^(?:(?:Цена\s+)?товара:\s*)?(?<name>.+),\s*\((?<newPrice>[\d\s]+(?:[,.]\d+)?)\)\s*,?\s*отличается\s*(?:от|то)?\s*текущ[а-яё\s]+закупочн[а-яё\s]+цены\s*-\s*(?<oldPrice>[\d\s]+(?:[,.]\d+)?)/iu;
const MIN_GROWTH_DIFF = 1;
const IGNORED_VAT_GROWTH_PERCENT = 22;

function normalizeProductName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePriceLine(line: string): Omit<PriceChangeItem, "shop"> | null {
  const match = PRICE_LINE_RE.exec(line.trim());
  const groups = match?.groups as Record<string, string> | undefined;
  if (!groups) return null;

  const name = normalizeProductName(groups.name ?? "");
  const newPrice = parseMoney(groups.newPrice ?? "");
  const oldPrice = parseMoney(groups.oldPrice ?? "");

  if (!name || newPrice === null || oldPrice === null) return null;

  return { name, oldPrice, newPrice };
}

export function parsePriceMessage(text: string): ParseResult {
  const growthItems: PriceChangeItem[] = [];
  const zeroPriceItems: PriceChangeItem[] = [];
  let currentShop: string | null = null;

  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const detectedShop = detectShopInLine(line);
    if (detectedShop) {
      currentShop = detectedShop;
    }

    const parsedLine = parsePriceLine(line);
    if (!parsedLine) continue;

    const itemBase: PriceChangeItem = {
      ...parsedLine,
      shop: currentShop ?? "магазин не указан"
    };

    if (itemBase.oldPrice === 0) {
      zeroPriceItems.push(itemBase);
      continue;
    }

    const diff = roundMoney(itemBase.newPrice - itemBase.oldPrice);
    if (diff >= MIN_GROWTH_DIFF) {
      const percent = roundPercent((diff / itemBase.oldPrice) * 100);
      if (percent === IGNORED_VAT_GROWTH_PERCENT) continue;

      growthItems.push({ ...itemBase, diff, percent });
    }
  }

  return { growthItems, zeroPriceItems };
}
