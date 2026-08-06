import type { ForecastResult } from "./types";
import type { PeriodComparisonSummary, SalesAnalysisSummary, SalesItemCandidate, StoredSupportingReport } from "./supportingTypes";
import { categoryMatchesScope, seasonalIsActive, scopeTitle, type ReportScope } from "./scopes";

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function signedRub(value: number): string {
  return `${value > 0 ? "+" : ""}${rub(value)}`;
}

function shortName(value: string, limit = 72): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function comparison(report: StoredSupportingReport | null): PeriodComparisonSummary | null {
  return report?.summary.type === "period_comparison" ? report.summary : null;
}

function sales(report: StoredSupportingReport | null): SalesAnalysisSummary | null {
  return report?.summary.type === "sales_analysis" ? report.summary : null;
}

function marker(value: number): string {
  if (value >= 1.02) return "🟢";
  if (value >= 0.98) return "🟡";
  return "🔴";
}

function relevantItem(item: SalesItemCandidate, scope: ReportScope, reportDate: string): boolean {
  return categoryMatchesScope(item.category, scope, reportDate);
}

function actionLines(input: {
  scope: ReportScope;
  reportDate: string;
  comparison: PeriodComparisonSummary | null;
  sales: SalesAnalysisSummary | null;
}): string[] {
  const actions: string[] = [];
  const stockWithoutSales = input.sales?.stockWithoutSales.find((item) => relevantItem(item, input.scope, input.reportDate));
  if (stockWithoutSales) {
    actions.push(`Проверить товар без продаж: ${shortName(stockWithoutSales.name)} — остаток ${Math.round(stockWithoutSales.currentStock)} шт. в ${stockWithoutSales.storesStockCurrent} ТТ. Сначала цена, карточка и выкладка; повторно не вводить.`);
  }

  const returnCandidate = input.sales?.returnCandidates.find((item) => relevantItem(item, input.scope, input.reportDate));
  if (returnCandidate) {
    actions.push(`Рассмотреть возврат вместо слабого SKU: ${shortName(returnCandidate.name)} — в прошлом ${Math.round(returnCandidate.previousUnits)} шт. / ${rub(returnCandidate.previousRevenue)}, сейчас нет продаж и остатка.`);
  }

  const overstock = input.sales?.overstock.find((item) => relevantItem(item, input.scope, input.reportDate));
  if (overstock) {
    actions.push(`Остановить заказ и проверить min/max: ${shortName(overstock.name)} — запас около ${Math.round(overstock.stockDays ?? 0)} дней, остаток ${Math.round(overstock.currentStock)} шт.`);
  }

  const decline = input.comparison?.subcategories
    .filter((item) => item.parentCategory && categoryMatchesScope(item.parentCategory, input.scope, input.reportDate) && item.revenueDelta < 0)
    .sort((a, b) => a.revenueDelta - b.revenueDelta)[0];
  if (decline) {
    actions.push(`Разобрать подкатегорию ${decline.parentCategory} / ${decline.name}: потеря ${rub(Math.abs(decline.revenueDelta))}. Проверить наличие действующих топов до расширения матрицы.`);
  }

  return actions.slice(0, 4);
}

export function formatScopedManagerReport(input: {
  scope: ReportScope;
  result: ForecastResult;
  comparisonReport: StoredSupportingReport | null;
  salesReport: StoredSupportingReport | null;
}): string {
  const comparisonSummary = comparison(input.comparisonReport);
  const salesSummary = sales(input.salesReport);
  const reportDate = input.result.snapshot.reportDate;
  const dateLabel = reportDate.split("-").reverse().join(".");
  const categories = [...input.result.categories].sort((a, b) => a.forecastRevenueRatio - b.forecastRevenueRatio);
  const declining = comparisonSummary?.subcategories
    .filter((item) => item.parentCategory && categoryMatchesScope(item.parentCategory, input.scope, reportDate) && item.revenueDelta < 0)
    .sort((a, b) => a.revenueDelta - b.revenueDelta)
    .slice(0, 3) ?? [];
  const actions = actionLines({ scope: input.scope, reportDate, comparison: comparisonSummary, sales: salesSummary });
  const lines = [
    `📊 ${scopeTitle(input.scope).toUpperCase()}`,
    `Данные продаж: по ${dateLabel}`,
    "",
    `Факт: ${rub(input.result.snapshot.overall.actualRevenue)}`,
    `План на дату: ${rub(input.result.snapshot.overall.planToDateRevenue)}`,
    `Выполнение: ${percent(input.result.planToDateRatio)}`,
    `Прогноз месяца: ${percent(input.result.forecastRevenueRatio)}`,
    `Прогноз по валу: ${percent(input.result.forecastMarginRatio)}`,
    `Нужно до конца месяца: ${rub(input.result.requiredDailyRevenue)} в день`,
    "",
    input.scope.kind === "category" ? "Подкатегории с наибольшей потерей:" : "Категории:"
  ];

  if (input.scope.kind === "category") {
    if (declining.length) declining.forEach((item) => lines.push(`🔴 ${item.name}: ${signedRub(item.revenueDelta)}`));
    else lines.push("• Существенных падений по загруженному сравнению не найдено.");
  } else {
    categories.forEach((item) => lines.push(`${marker(item.forecastRevenueRatio)} ${item.category}: ${percent(item.forecastRevenueRatio)}`));
    if (declining.length) {
      lines.push("", "Главные потери по подкатегориям:");
      declining.forEach((item) => lines.push(`• ${item.parentCategory} / ${item.name}: ${signedRub(item.revenueDelta)}`));
    }
  }

  lines.push("", "Рекомендации:");
  if (actions.length) actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  else lines.push("• Критичных действий по загруженным данным не найдено.");

  if (!seasonalIsActive(reportDate)) lines.push("", "Сезонный товар исключён из плана, рисков и рекомендаций до ноября.");
  if (comparisonSummary && comparisonSummary.reportDate !== reportDate) {
    lines.push(`⚠️ Сравнение актуально по ${comparisonSummary.reportDate.split("-").reverse().join(".")}, план-факт — по ${dateLabel}.`);
  }
  if (salesSummary && salesSummary.reportDate !== reportDate) {
    lines.push(`⚠️ Продажи с анализом актуальны по ${salesSummary.reportDate.split("-").reverse().join(".")}, план-факт — по ${dateLabel}.`);
  }
  lines.push("Точные цены, min/max и перемещения не рассчитываются без отдельной выгрузки.");
  return lines.join("\n");
}
