import type { StoredPlanFactSnapshot } from "./types";

export type ManagerKey = "vlad" | "kristina";
export type ReportScope =
  | { kind: "overall" }
  | { kind: "manager"; manager: ManagerKey }
  | { kind: "category"; category: string };

export const MANAGER_CATEGORIES: Record<ManagerKey, { title: string; categories: string[] }> = {
  vlad: {
    title: "Влад",
    categories: [
      "Бакалея",
      "Заморозка, Полуфабрикаты",
      "Напитки",
      "Специи, компоненты для выпечки",
      "Спички, зажигалки",
      "Товары для детей"
    ]
  },
  kristina: {
    title: "Кристина",
    categories: [
      "Азиатская продукция",
      "Консервы, Соусы",
      "Снэки, быстрый перекус",
      "Товары для животных"
    ]
  }
};

export const CATEGORY_BUTTONS: Array<{ label: string; category: string }> = [
  { label: "Бакалея", category: "Бакалея" },
  { label: "Заморозка", category: "Заморозка, Полуфабрикаты" },
  { label: "Напитки", category: "Напитки" },
  { label: "Специи и выпечка", category: "Специи, компоненты для выпечки" },
  { label: "Спички и зажигалки", category: "Спички, зажигалки" },
  { label: "Товары для детей", category: "Товары для детей" },
  { label: "Азиатская продукция", category: "Азиатская продукция" },
  { label: "Консервы и соусы", category: "Консервы, Соусы" },
  { label: "Снэки", category: "Снэки, быстрый перекус" },
  { label: "Товары для животных", category: "Товары для животных" }
];

export function normalizeCategory(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

export function isSeasonalCategory(value: string): boolean {
  const normalized = normalizeCategory(value);
  return normalized.includes("сезонн") || normalized.includes("новогод");
}

export function seasonalIsActive(reportDate: string): boolean {
  const month = Number(reportDate.slice(5, 7));
  return month === 11 || month === 12;
}

export function categoryIsActive(value: string, reportDate: string): boolean {
  return seasonalIsActive(reportDate) || !isSeasonalCategory(value);
}

export function scopeTitle(scope: ReportScope): string {
  if (scope.kind === "overall") return "Общий отчёт";
  if (scope.kind === "manager") return `Отчёт: ${MANAGER_CATEGORIES[scope.manager].title}`;
  return scope.category;
}

export function scopeCategories(scope: ReportScope, available: string[], reportDate: string): string[] {
  const active = available.filter((category) => categoryIsActive(category, reportDate));
  if (scope.kind === "overall") return active;
  const requested = scope.kind === "manager" ? MANAGER_CATEGORIES[scope.manager].categories : [scope.category];
  const requestedSet = new Set(requested.map(normalizeCategory));
  return active.filter((category) => requestedSet.has(normalizeCategory(category)));
}

function sum<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

export function scopeSnapshot(snapshot: StoredPlanFactSnapshot, scope: ReportScope): StoredPlanFactSnapshot | null {
  const names = scopeCategories(scope, snapshot.categories.map((item) => item.category), snapshot.reportDate);
  const nameSet = new Set(names.map(normalizeCategory));
  const categories = snapshot.categories.filter((item) => nameSet.has(normalizeCategory(item.category)));
  if (!categories.length) return null;

  return {
    ...snapshot,
    overall: {
      category: scopeTitle(scope),
      monthlyPlanRevenue: sum(categories, (item) => item.monthlyPlanRevenue),
      monthlyPlanMargin: sum(categories, (item) => item.monthlyPlanMargin),
      planToDateRevenue: sum(categories, (item) => item.planToDateRevenue),
      planToDateMargin: sum(categories, (item) => item.planToDateMargin),
      actualRevenue: sum(categories, (item) => item.actualRevenue),
      actualMargin: sum(categories, (item) => item.actualMargin)
    },
    categories
  };
}

export function categoryMatchesScope(category: string, scope: ReportScope, reportDate: string): boolean {
  if (!categoryIsActive(category, reportDate)) return false;
  if (scope.kind === "overall") return true;
  const requested = scope.kind === "manager" ? MANAGER_CATEGORIES[scope.manager].categories : [scope.category];
  const normalized = normalizeCategory(category);
  return requested.some((value) => normalizeCategory(value) === normalized);
}

export function findCategoryFromCommand(value: string): string | null {
  const normalized = normalizeCategory(value.replace(/^категория\s*/i, ""));
  const direct = CATEGORY_BUTTONS.find((item) => {
    const label = normalizeCategory(item.label);
    const category = normalizeCategory(item.category);
    return normalized === label || normalized === category;
  });
  return direct?.category ?? null;
}
