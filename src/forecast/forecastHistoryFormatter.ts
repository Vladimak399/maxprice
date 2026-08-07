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
  const comparable = chronological.filter((item) =>
    item.reportDate.slice(0, 7) === latest.reportDate.slice(0, 7)
    && item.planHorizonEnd === latest.planHorizonEnd
  );
  const firstComparable = comparable[0] ?? latest;
  let improvedDays = 0;
  let worsenedDays = 0;
  for (let index = 1; index < comparable.length; index += 1) {
    const change = comparable[index].forecastRevenueRatio - comparable[index - 1].forecastRevenueRatio;
    if (change > 0.0005) improvedDays += 1;
    else if (change < -0.0005) worsenedDays += 1;
  }

  const horizonLine = latest.planIsFullMonth
    ? "Горизонт плана: весь месяц"
    : `Горизонт плана: до ${dateLabel(latest.planHorizonEnd)}`;
  const lines = [
    `📈 СТАТИСТИКА — ${scopeTitle(scope).toUpperCase()}`,
    "",
    `Период: ${monthLabel(latest.reportDate)}`,
    horizonLine,
    `Сопоставимых снимков: ${comparable.length}`,
    `Первый прогноз: ${pct(firstComparable.forecastRevenueRatio)} на ${dateLabel(firstComparable.reportDate)}`,
    `Последний прогноз: ${pct(latest.forecastRevenueRatio)} на ${dateLabel(latest.reportDate)}`,
    `Изменение: ${pp(latest.forecastRevenueRatio - firstComparable.forecastRevenueRatio)}`,
    `Улучшений: ${improvedDays}, ухудшений: ${worsenedDays}`,
    "",
    "Последние сопоставимые прогнозы:"
  ];

  const recent = [...comparable].slice(-10);
  for (let index = 0; index < recent.length; index += 1) {
    const current = recent[index];
    const previous = index > 0 ? recent[index - 1] : null;
    const delta = previous ? ` (${pp(current.forecastRevenueRatio - previous.forecastRevenueRatio)})` : "";
    lines.push(`• ${dateLabel(current.reportDate)}: прогноз ${pct(current.forecastRevenueRatio)}${delta}, выполнение на дату ${pct(current.planToDateRatio)}`);
  }

  const tempoLabel = latest.planIsFullMonth ? "Текущий необходимый темп до конца месяца" : `Текущий необходимый темп до ${dateLabel(latest.planHorizonEnd)}`;
  lines.push("", `${tempoLabel}: ${rub(latest.requiredDailyRevenue)} в день.`);

  const fullMonthRuns = chronological.filter((run) => run.planIsFullMonth);
  const monthEnds = new Map<string, StoredForecastRun>();
  for (const run of fullMonthRuns) monthEnds.set(run.reportDate.slice(0, 7), run);
  if (monthEnds.size > 1) {
    lines.push("", "По месяцам:");
    for (const [month, run] of [...monthEnds.entries()].slice(-6)) {
      lines.push(`• ${monthLabel(`${month}-01`)}: последний прогноз ${pct(run.forecastRevenueRatio)}, факт на дату ${pct(run.monthCompletionRatio)} месячного плана`);
    }
  }

  return lines.join("\n");
}
