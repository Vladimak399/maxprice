import type { StoredForecastRun } from "./forecastRunRepository";
import { scopeTitle, type ReportScope } from "./scopes";

function pct(value: number): string {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function pp(value: number): string {
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1).replace(".", ",")} п.п.`;
}

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function dateLabel(value: string): string {
  return value.split("-").reverse().join(".");
}

function monthLabel(value: string): string {
  const [year, month] = value.split("-");
  const names = ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  return `${names[Number(month)] ?? month} ${year}`;
}

export function formatForecastHistory(scope: ReportScope, runsNewestFirst: StoredForecastRun[]): string {
  if (!runsNewestFirst.length) {
    return `История прогнозов для «${scopeTitle(scope)}» пока пуста. Она начнёт заполняться после следующего план-факта.`;
  }

  const chronological = [...runsNewestFirst].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const latest = chronological.at(-1)!;
  const firstSameMonth = chronological.find((item) => item.reportDate.slice(0, 7) === latest.reportDate.slice(0, 7)) ?? latest;
  const sameMonth = chronological.filter((item) => item.reportDate.slice(0, 7) === latest.reportDate.slice(0, 7));
  let improvedDays = 0;
  let worsenedDays = 0;
  for (let index = 1; index < sameMonth.length; index += 1) {
    const change = sameMonth[index].forecastRevenueRatio - sameMonth[index - 1].forecastRevenueRatio;
    if (change > 0.0005) improvedDays += 1;
    else if (change < -0.0005) worsenedDays += 1;
  }

  const lines = [
    `📈 СТАТИСТИКА — ${scopeTitle(scope).toUpperCase()}`,
    "",
    `Период: ${monthLabel(latest.reportDate)}`,
    `Снимков прогноза: ${sameMonth.length}`,
    `Первый прогноз: ${pct(firstSameMonth.forecastRevenueRatio)} на ${dateLabel(firstSameMonth.reportDate)}`,
    `Последний прогноз: ${pct(latest.forecastRevenueRatio)} на ${dateLabel(latest.reportDate)}`,
    `Изменение: ${pp(latest.forecastRevenueRatio - firstSameMonth.forecastRevenueRatio)}`,
    `Улучшений: ${improvedDays}, ухудшений: ${worsenedDays}`,
    "",
    "Последние прогнозы:"
  ];

  const recent = [...runsNewestFirst].slice(0, 10).reverse();
  for (let index = 0; index < recent.length; index += 1) {
    const current = recent[index];
    const previous = index > 0 ? recent[index - 1] : null;
    const delta = previous ? ` (${pp(current.forecastRevenueRatio - previous.forecastRevenueRatio)})` : "";
    lines.push(`• ${dateLabel(current.reportDate)}: прогноз ${pct(current.forecastRevenueRatio)}${delta}, выполнение на дату ${pct(current.planToDateRatio)}`);
  }

  lines.push("", `Текущий необходимый темп: ${rub(latest.requiredDailyRevenue)} в день.`);

  const monthEnds = new Map<string, StoredForecastRun>();
  for (const run of chronological) monthEnds.set(run.reportDate.slice(0, 7), run);
  if (monthEnds.size > 1) {
    lines.push("", "По месяцам:");
    for (const [month, run] of [...monthEnds.entries()].slice(-6)) {
      lines.push(`• ${monthLabel(`${month}-01`)}: последний прогноз ${pct(run.forecastRevenueRatio)}, факт на дату ${pct(run.monthCompletionRatio)} месячного плана`);
    }
  }

  return lines.join("\n");
}
