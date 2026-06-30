const SHOP_ALIASES: Record<string, string[]> = {
  "Багратионовск": ["багратионовск", "баграт", "баграте", "баграту"],
  "Балтийск": ["балтийск", "балтийске", "балтийску"],
  "Батальная": ["батальная", "баталка", "батальной"],
  "Гагарина": ["гагарина", "гагарине", "гагарину"],
  "Гвардейск": ["гвардейск", "гвардейске", "гвардейску"],
  "Гусев": ["гусев", "гусеве", "гусеву"],
  "Захаровский рынок": ["захаровский рынок", "захар рынок", "захар рынок"],
  "Колос": ["колос", "черняховск тц", "черняховск тц колос"],
  "Маркса": ["маркса", "к маркса", "к.маркса", "карла маркса"],
  "Мега": ["мега", "меге", "мегу"],
  "Московский": ["московский", "московском", "московскому"],
  "Невский": ["невский", "невском", "невскому"],
  "Неман": ["неман", "немане", "неману"],
  "Нестеров": ["нестеров", "нестерове", "нестерову"],
  "Оазис": ["оазис", "оазисе", "оазису"],
  "Панорама": ["панорама", "панораме", "панораму"],
  "Пионерский": ["пионерский", "пионерском", "пионерскому"],
  "Площадь": ["площадь", "площади", "площадь победы"],
  "Портовая": ["портовая", "портовой", "портовую"],
  "Светлый": ["светлый", "светлом", "светлому"],
  "Советск 2": ["советск2", "советск 2", "советск-2", "советск второй"],
  "Советск": ["советск", "советске", "советску"],
  "Холмогоровка": ["холмогоровка", "холмогоровке", "холмогоровку"],
  "Центральный рынок": ["центральный рынок", "центр рынок", "центр. рынок", "цр"],
  "Черняховск рынок": ["черняховск рынок", "черн рынок", "черн. рынок"],
  "Чкаловск": ["чкаловск", "чкаловске", "чкаловску"],
  "Экватор": ["экватор", "экваторе", "экватору"]
};

export function normalizeShopText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.]/g, " ")
    .replace(/[^а-яa-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasToCanonical = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(SHOP_ALIASES)) {
  for (const alias of aliases) {
    aliasToCanonical.set(normalizeShopText(alias), canonical);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPriceLine(normalizedLine: string): boolean {
  return normalizedLine.includes("цена товара") || normalizedLine.includes("текущ") || normalizedLine.includes("закупочн");
}

function hasExplicitShopPreposition(normalizedLine: string, alias: string): boolean {
  const escaped = escapeRegExp(alias);
  const pattern = new RegExp(`(^|\\s)(в|во|по|для|магазин|тт)\\s+${escaped}(\\s|$)`, "i");
  return pattern.test(normalizedLine);
}

export function detectShopInLine(line: string): string | null {
  const normalizedLine = normalizeShopText(line);
  if (!normalizedLine) return null;

  const exact = aliasToCanonical.get(normalizedLine);
  if (exact) return exact;

  const lineLooksLikePrice = isPriceLine(normalizedLine);

  for (const [alias, canonical] of aliasToCanonical.entries()) {
    if (lineLooksLikePrice) {
      if (hasExplicitShopPreposition(normalizedLine, alias)) return canonical;
      continue;
    }

    const pattern = new RegExp(`(^|\\s)${escapeRegExp(alias)}(\\s|$)`, "i");
    if (pattern.test(normalizedLine)) return canonical;
  }

  return null;
}

export function listCanonicalShops(): string[] {
  return Object.keys(SHOP_ALIASES).sort((a, b) => a.localeCompare(b, "ru"));
}
