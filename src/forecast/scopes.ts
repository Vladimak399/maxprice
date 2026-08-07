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
      "Товары для животных",
      "Охлажденная продукция",
      "Хлебобулочные изделия"
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
  { label: "Товары для животных", category: "Товары для животных" },
  { label: "Охлажденная продукция", category: "Охлажденная продукция" },
  { label: "Хлебобулочные изделия", category: "Хлебобулочные изделия" }
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

function dateWithDay(date: string, day: number): string {
  return `${date.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

function normalizeEarlyMonthPlan(snapshot: StoredPlanFactSnapshot): StoredPlanFactSnapshot {
  const reportDay = Number(snapshot.reportDate.slice(8, 10));
  const horizonDay = Number(snapshot.planHorizonEnd.slice(8, 10));

  // В 1С первый плановый интервал месяца — 1–9. В сокращенной выгрузке
  // заголовок/период может заканчиваться текущей датой (например 1–6),
  // хотя значения плана относятся ко всему интервалу 1–9.
  if (snapshot.planIsFullMonth || reportDay < 1 || reportDay >= 9 || horizonDay !== reportDay) {
    return snapshot;
  }

  const factor = reportDay / 9;
  const categories = snapshot.categories.map((item) => ({
    ...item,
    planToDateRevenue: item.monthlyPlanRevenue * factor,
    planToDateMargin: item.monthlyPlanMargin * factor
  }));

  return {
    ...snapshot,
    planHorizonEnd: dateWithDay(snapshot.reportDate, 9),
    planIsFullMonth: false,
    overall: {
      ...snapshot.overall,
      planToDateRevenue: snapshot.overall.monthlyPlanRevenue * factor,
      planToDateMargin: snapshot.overall.monthlyPlanMargin * factor
    },
    categories
  };
}

export function scopeSnapshot(snapshot: StoredPlanFactSnapshot, scope: ReportScope): StoredPlanFactSnapshot | null {
  const normalizedSnapshot = normalizeEarlyMonthPlan(snapshot);
  const names = scopeCategories(scope, normalizedSnapshot.categories.map((item) => item.category), normalizedSnapshot.reportDate);
  const nameSet = new Set(names.map(normalizeCategory));
  const categories = normalizedSnapshot.categories.filter((item) => nameSet.has(normalizeCategory(item.category)));
  if (!categories.length) return null;

  return {
    ...normalizedSnapshot,
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
