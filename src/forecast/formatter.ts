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

function categoryLine(category: ForecastResult["categories"][number]): string {
  const marker = category.forecastRevenueRatio >= 1.02 ? "🟢" : category.forecastRevenueRatio >= 0.98 ? "🟡" : "🔴";
  return `${marker} ${category.category}: ${percent(category.forecastRevenueRatio)}`;
}

export function formatPlan(result: ForecastResult): string {
  const risks = [...result.categories].sort((a, b) => a.forecastRevenueRatio - b.forecastRevenueRatio).slice(0, 3);
  const opportunities = [...result.categories].sort((a, b) => b.forecastRevenueRatio - a.forecastRevenueRatio).slice(0, 2);
  const forecastChange = result.previousForecastRevenueRatio === null ? null : result.forecastRevenueRatio - result.previousForecastRevenueRatio;
  const weatherPp = result.snapshot.overall.monthlyPlanRevenue > 0 ? result.weatherImpactRevenue / result.snapshot.overall.monthlyPlanRevenue : 0;
  const lines = [
    `📊 ПЛАН-ФАКТ НА ${result.snapshot.reportDate.split("-").reverse().join(".")}`,
    "",
    `Факт: ${rub(result.snapshot.overall.actualRevenue)}`,
    `План на дату: ${rub(result.snapshot.overall.planToDateRevenue)}`,
    `Выполнение на дату: ${percent(result.planToDateRatio)}`,
    `${progressBar(result.planToDateRatio)} ${percent(result.planToDateRatio)}`,
    "",
    `Прогноз месяца: ${rub(result.forecastRevenue)}`,
    `Выполнение месячного плана: ${percent(result.forecastRevenueRatio)}`,
    `Прогноз по валу: ${percent(result.forecastMarginRatio)}`,
    ...(forecastChange === null ? [] : [`Изменение к предыдущему снимку: ${pp(forecastChange)}`]),
    `Погодная поправка: ${pp(weatherPp)}`,
    "",
    `До плана осталось: ${rub(Math.max(0, result.snapshot.overall.monthlyPlanRevenue - result.snapshot.overall.actualRevenue))}`,
    `Нужно в среднем: ${rub(result.requiredDailyRevenue)} в день`,
    ...(result.recentDailyRevenue === null ? [] : [`Последний интервал: ${rub(result.recentDailyRevenue)} в день`]),
    "",
    "Риски:",
    ...risks.map(categoryLine),
    "",
    "Сильные категории:",
    ...opportunities.map(categoryLine),
    "",
    `Продажи обновлены: по ${result.snapshot.reportDate.split("-").reverse().join(".")}`,
    result.weather ? `Погода: ${result.weather.startDate.split("-").reverse().join(".")}–${result.weather.endDate.split("-").reverse().join(".")}, средний максимум ${result.weather.averageMaxTemperature.toFixed(1).replace(".", ",")} °C` : "Погода временно недоступна.",
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
    `Продажи: по ${latest.reportDate.split("-").reverse().join(".")}`,
    `Период: ${latest.periodStart.split("-").reverse().join(".")}–${latest.periodEnd.split("-").reverse().join(".")}`,
    `Категорий: ${latest.categories.length}`,
    `Загружено: ${new Date(latest.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Kaliningrad" })}`,
    previous ? `Предыдущий снимок: по ${previous.reportDate.split("-").reverse().join(".")}` : "Предыдущего снимка пока нет."
  ].join("\n");
}

export function formatUploadSuccess(result: ForecastResult, filename: string): string {
  const change = result.previousForecastRevenueRatio === null ? null : result.forecastRevenueRatio - result.previousForecastRevenueRatio;
  return [
    "✅ ОТЧЁТ ЗАГРУЖЕН",
    "",
    `Файл: ${filename}`,
    `Период факта: по ${result.snapshot.reportDate.split("-").reverse().join(".")}`,
    `Категорий найдено: ${result.snapshot.categories.length}`,
    `Факт: ${rub(result.snapshot.overall.actualRevenue)}`,
    `План на дату: ${rub(result.snapshot.overall.planToDateRevenue)}`,
    `Прогноз месяца: ${percent(result.forecastRevenueRatio)}`,
    ...(change === null ? [] : [`Изменение к предыдущему снимку: ${pp(change)}`]),
    "",
    "Напишите «План», чтобы получить полный результат."
  ].join("\n");
}
