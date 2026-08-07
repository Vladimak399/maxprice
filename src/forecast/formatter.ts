import type { ForecastResult, StoredPlanFactSnapshot } from "./types";

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function pp(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1).replace(".", ",")} п.п.`;
}

function progressBar(value: number): string {
  const width = 18;
  const filled = Math.max(0, Math.min(width, Math.round(Math.min(value, 1) * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function dateLabel(value: string): string {
  return value.split("-").reverse().join(".");
}

function comparableForecastChange(result: ForecastResult): number | null {
  if (!result.previousSnapshot || result.previousSnapshot.planHorizonEnd !== result.snapshot.planHorizonEnd) return null;
  return result.previousForecastRevenueRatio === null ? null : result.forecastRevenueRatio - result.previousForecastRevenueRatio;
}

function categoryLine(category: ForecastResult["categories"][number]): string {
  const marker = category.forecastRevenueRatio >= 1.02 ? "🟢" : category.forecastRevenueRatio >= 0.98 ? "🟡" : "🔴";
  return `${marker} ${category.category}: ${percent(category.forecastRevenueRatio)}`;
}

export function formatPlan(result: ForecastResult): string {
  const risks = [...result.categories].sort((a, b) => a.forecastRevenueRatio - b.forecastRevenueRatio).slice(0, 3);
  const opportunities = [...result.categories].sort((a, b) => b.forecastRevenueRatio - a.forecastRevenueRatio).slice(0, 2);
  const forecastChange = comparableForecastChange(result);
  const weatherPp = result.snapshot.overall.monthlyPlanRevenue > 0 ? result.weatherImpactRevenue / result.snapshot.overall.monthlyPlanRevenue : 0;
  const horizonLabel = dateLabel(result.snapshot.planHorizonEnd);
  const forecastTitle = result.snapshot.planIsFullMonth ? "Прогноз месяца" : `Прогноз к ${horizonLabel}`;
  const planTitle = result.snapshot.planIsFullMonth ? "Выполнение месячного плана" : `Выполнение плана до ${horizonLabel}`;
  const remainingTitle = result.snapshot.planIsFullMonth ? "До плана месяца осталось" : `До плана на ${horizonLabel} осталось`;
  const tempoTitle = result.snapshot.planIsFullMonth ? "Нужно в среднем до конца месяца" : `Нужно в среднем до ${horizonLabel}`;
  const lines = [
    `📊 ПЛАН-ФАКТ НА ${dateLabel(result.snapshot.reportDate)}`,
    "",
    `Факт: ${rub(result.snapshot.overall.actualRevenue)}`,
    `План на дату: ${rub(result.snapshot.overall.planToDateRevenue)}`,
    `Выполнение на дату: ${percent(result.planToDateRatio)}`,
    `${progressBar(result.planToDateRatio)} ${percent(result.planToDateRatio)}`,
    "",
    `${forecastTitle}: ${rub(result.forecastRevenue)}`,
    `${planTitle}: ${percent(result.forecastRevenueRatio)}`,
    `Прогноз по валу: ${percent(result.forecastMarginRatio)}`,
    ...(forecastChange === null ? [] : [`Изменение к предыдущему сопоставимому снимку: ${pp(forecastChange)}`]),
    `Погодная поправка: ${pp(weatherPp)}`,
    "",
    `${remainingTitle}: ${rub(Math.max(0, result.snapshot.overall.monthlyPlanRevenue - result.snapshot.overall.actualRevenue))}`,
    `${tempoTitle}: ${rub(result.requiredDailyRevenue)} в день`,
    ...(result.recentDailyRevenue === null ? [] : [`Последний интервал: ${rub(result.recentDailyRevenue)} в день`]),
    "",
    "Риски:",
    ...risks.map(categoryLine),
    "",
    "Сильные категории:",
    ...opportunities.map(categoryLine),
    "",
    `Продажи обновлены: по ${dateLabel(result.snapshot.reportDate)}`,
    result.weather ? `Погода: ${dateLabel(result.weather.startDate)}–${dateLabel(result.weather.endDate)}, средний максимум ${result.weather.averageMaxTemperature.toFixed(1).replace(".", ",")} °C` : "Погода временно недоступна.",
    "Прогноз ориентировочный: учитывает плановую кривую, последний интервал и погоду."
  ];
  return lines.join("\n");
}

export function formatDataStatus(snapshots: StoredPlanFactSnapshot[]): string {
  const latest = snapshots[0];
  if (!latest) return "📁 Данных пока нет. Отправьте накопительный план-факт в формате .xlsx с датой в имени, например: факт 08.08.xlsx";
  const previous = snapshots[1];
  return [
    "📁 АКТУАЛЬНОСТЬ ДАННЫХ",
    "",
    `Последний файл: ${latest.filename}`,
    `Продажи: по ${dateLabel(latest.reportDate)}`,
    `Период факта: ${dateLabel(latest.periodStart)}–${dateLabel(latest.periodEnd)}`,
    `План загружен до: ${dateLabel(latest.planHorizonEnd)}`,
    `Категорий: ${latest.categories.length}`,
    `Загружено: ${new Date(latest.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Kaliningrad" })}`,
    previous ? `Предыдущий снимок: по ${dateLabel(previous.reportDate)}` : "Предыдущего снимка пока нет."
  ].join("\n");
}

export function formatUploadSuccess(result: ForecastResult, filename: string): string {
  const change = comparableForecastChange(result);
  const horizonLabel = dateLabel(result.snapshot.planHorizonEnd);
  const forecastLabel = result.snapshot.planIsFullMonth ? "Прогноз месяца" : `Прогноз к ${horizonLabel}`;
  return [
    "✅ ОТЧЁТ ЗАГРУЖЕН",
    "",
    `Файл: ${filename}`,
    `Период факта: по ${dateLabel(result.snapshot.reportDate)}`,
    `План доступен до: ${horizonLabel}`,
    `Категорий найдено: ${result.snapshot.categories.length}`,
    `Факт: ${rub(result.snapshot.overall.actualRevenue)}`,
    `План на дату: ${rub(result.snapshot.overall.planToDateRevenue)}`,
    `${forecastLabel}: ${percent(result.forecastRevenueRatio)}`,
    ...(change === null ? [] : [`Изменение к предыдущему сопоставимому снимку: ${pp(change)}`]),
    "",
    "Напишите «План», чтобы получить полный результат."
  ].join("\n");
}
