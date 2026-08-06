import type { ForecastResult, StoredPlanFactSnapshot, WeatherSummary } from "./types";
import type { PeriodComparisonSummary, SalesAnalysisSummary, SalesItemCandidate, StoredSupportingReport } from "./supportingTypes";

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function percent(value: number | null): string {
  if (value === null) return "н/д";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function shortName(value: string, limit = 86): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function comparison(report: StoredSupportingReport | null): PeriodComparisonSummary | null {
  return report?.summary.type === "period_comparison" ? report.summary : null;
}

function sales(report: StoredSupportingReport | null): SalesAnalysisSummary | null {
  return report?.summary.type === "sales_analysis" ? report.summary : null;
}

export function formatExtendedDataStatus(input: {
  snapshots: StoredPlanFactSnapshot[];
  comparisonReport: StoredSupportingReport | null;
  salesReport: StoredSupportingReport | null;
}): string {
  const latest = input.snapshots[0];
  const comparisonSummary = comparison(input.comparisonReport);
  const salesSummary = sales(input.salesReport);
  return [
    "📁 АКТУАЛЬНОСТЬ ДАННЫХ",
    "",
    latest ? `✅ План-факт: по ${latest.reportDate.split("-").reverse().join(".")} (${latest.filename})` : "❌ План-факт не загружен",
    comparisonSummary ? `✅ Сравнение: по ${comparisonSummary.reportDate.split("-").reverse().join(".")} (${comparisonSummary.filename})` : "❌ Сравнение с прошлым периодом не загружено",
    salesSummary ? `✅ Продажи с анализом: по ${salesSummary.reportDate.split("-").reverse().join(".")} (${salesSummary.filename})` : "❌ Продажи с анализом не загружены",
    "",
    latest && input.snapshots[1] ? `Предыдущий план-факт: по ${input.snapshots[1].reportDate.split("-").reverse().join(".")}` : "Для динамики нужен второй план-факт с новой датой.",
    "Повторный файл того же типа за ту же дату заменяет предыдущую версию."
  ].join("\n");
}

export function formatReasons(result: ForecastResult | null, report: StoredSupportingReport | null): string {
  const summary = comparison(report);
  const lines = ["🔎 ПРИЧИНЫ ИЗМЕНЕНИЯ РЕЗУЛЬТАТА", ""];
  if (result) {
    const risks = [...result.categories].sort((a, b) => a.forecastRevenueRatio - b.forecastRevenueRatio).slice(0, 3);
    lines.push("Риски выполнения плана:");
    for (const item of risks) lines.push(`• ${item.category}: прогноз ${(item.forecastRevenueRatio * 100).toFixed(1).replace(".", ",")}%`);
    lines.push("");
  }
  if (!summary) {
    lines.push("Для причин по подкатегориям загрузите «сравнение с прошлым периодом».");
    return lines.join("\n");
  }
  const declining = [...summary.subcategories]
    .filter((item) => item.previousRevenue > 0 && item.revenueDelta < 0)
    .sort((a, b) => a.revenueDelta - b.revenueDelta)
    .slice(0, 7);
  const growing = [...summary.subcategories]
    .filter((item) => item.revenueDelta > 0)
    .sort((a, b) => b.revenueDelta - a.revenueDelta)
    .slice(0, 4);
  lines.push(`Сравнение ${summary.previousPeriodEnd.split("-").reverse().join(".")} → ${summary.periodEnd.split("-").reverse().join(".")}:`);
  lines.push("Главные потери:");
  declining.forEach((item) => lines.push(`• ${item.parentCategory} / ${item.name}: ${rub(item.revenueDelta)} (${percent(item.revenueGrowth)})`));
  lines.push("", "Компенсаторы:");
  growing.forEach((item) => lines.push(`• ${item.parentCategory} / ${item.name}: +${rub(item.revenueDelta)} (${percent(item.revenueGrowth)})`));
  return lines.join("\n");
}

function itemLine(item: SalesItemCandidate, suffix: string): string {
  return `• ${shortName(item.name)} — ${suffix}`;
}

export function formatActions(comparisonReport: StoredSupportingReport | null, salesReport: StoredSupportingReport | null): string {
  const comparisonSummary = comparison(comparisonReport);
  const salesSummary = sales(salesReport);
  const lines = ["✅ ЧТО ДЕЛАТЬ", ""];
  if (!comparisonSummary && !salesSummary) return `${lines.join("\n")}Недостаточно данных. Загрузите сравнение и продажи с анализом.`;

  let number = 1;
  if (salesSummary?.returnCandidates.length) {
    lines.push(`${number}. Рассмотреть возврат потерянного спроса — только вместо слабых SKU:`);
    salesSummary.returnCandidates.slice(0, 5).forEach((item) => lines.push(itemLine(item, `в прошлом ${Math.round(item.previousUnits)} шт. / ${rub(item.previousRevenue)}, сейчас продаж и остатка нет`)));
    number += 1;
    lines.push("");
  }
  if (salesSummary?.stockWithoutSales.length) {
    lines.push(`${number}. Не вводить повторно: товар уже лежит без продаж. Проверить цену, карточку, выкладку и наличие на полке:`);
    salesSummary.stockWithoutSales.slice(0, 5).forEach((item) => lines.push(itemLine(item, `остаток ${Math.round(item.currentStock)} шт. в ${item.storesStockCurrent} ТТ`)));
    number += 1;
    lines.push("");
  }
  if (salesSummary?.overstock.length) {
    lines.push(`${number}. Остановить заказ и проверить min/max по излишкам:`);
    salesSummary.overstock.slice(0, 5).forEach((item) => lines.push(itemLine(item, `запас около ${Math.round(item.stockDays ?? 0)} дней, остаток ${Math.round(item.currentStock)} шт.`)));
    number += 1;
    lines.push("");
  }
  if (comparisonSummary) {
    const declining = [...comparisonSummary.subcategories].filter((item) => item.revenueDelta < 0).sort((a, b) => a.revenueDelta - b.revenueDelta).slice(0, 4);
    if (declining.length) {
      lines.push(`${number}. Разобрать подкатегории с максимальной потерей выручки:`);
      declining.forEach((item) => lines.push(`• ${item.parentCategory} / ${item.name}: ${rub(item.revenueDelta)}`));
      lines.push("");
    }
  }
  lines.push("Точные цены, min/max и перемещения этот комплект не содержит; бот не придумывает их без соответствующей выгрузки.");
  return lines.join("\n");
}

export function formatReturnCandidates(report: StoredSupportingReport | null): string {
  const summary = sales(report);
  if (!summary) return "Для команды «Вернуть» загрузите файл «продажи с анализом».";
  if (!summary.returnCandidates.length) return "По текущим правилам явных кандидатов на возврат не найдено.";
  const lines = ["↩️ КАНДИДАТЫ НА ВОЗВРАТ", "", "Условие: продавались в прошлом периоде, сейчас нет продаж и остатка. Возврат — только вместо слабой позиции.", ""];
  summary.returnCandidates.slice(0, 10).forEach((item, index) => {
    lines.push(`${index + 1}. ${shortName(item.name)}`);
    lines.push(`${item.category}${item.subcategory ? ` / ${item.subcategory}` : ""}`);
    lines.push(`Было: ${Math.round(item.previousUnits)} шт., ${rub(item.previousRevenue)}. Сейчас: 0 продаж, 0 остаток.`);
  });
  return lines.join("\n");
}

export function formatHistory(snapshots: StoredPlanFactSnapshot[]): string {
  if (!snapshots.length) return "История пока пуста. Загрузите план-факт.";
  const lines = ["📈 ИСТОРИЯ ПЛАН-ФАКТА", ""];
  for (const item of snapshots) {
    const ratio = item.overall.planToDateRevenue > 0 ? item.overall.actualRevenue / item.overall.planToDateRevenue : 0;
    lines.push(`• ${item.reportDate.split("-").reverse().join(".")}: факт ${rub(item.overall.actualRevenue)}, выполнение на дату ${(ratio * 100).toFixed(1).replace(".", ",")}%`);
  }
  lines.push("", "Снимок за ту же дату заменяется; разные даты сохраняются для статистики.");
  return lines.join("\n");
}

export function formatWeather(weather: WeatherSummary | null): string {
  if (!weather) return "Погода временно недоступна.";
  const warm = weather.averageMaxTemperature >= 22;
  const cold = weather.averageMaxTemperature <= 18;
  return [
    "🌦 ПОГОДА И КАТЕГОРИИ",
    "",
    `Период: ${weather.startDate.split("-").reverse().join(".")}–${weather.endDate.split("-").reverse().join(".")}`,
    `Средний максимум: ${weather.averageMaxTemperature.toFixed(1).replace(".", ",")} °C`,
    `Осадки: ${weather.precipitationTotal.toFixed(1).replace(".", ",")} мм, дождливых дней: ${weather.rainyDays}`,
    "",
    warm ? "• Проверить запас воды, газировки, энергетиков и мороженого." : cold ? "• Холодные напитки и мороженое под риском; проверить чай, кофе, выпечку и горячие полуфабрикаты." : "• Сильной общей погодной корректировки нет; смотреть наличие по подкатегориям.",
    "Погодная оценка ориентировочная и не заменяет контроль остатков."
  ].join("\n");
}
