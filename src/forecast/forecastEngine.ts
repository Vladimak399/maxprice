import { categoryWeatherFactor } from "./weather";
import type { CategoryForecast, ForecastResult, StoredPlanFactSnapshot, WeatherSummary } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeRatio(value: number, base: number, fallback = 1): number {
  return base > 0 && Number.isFinite(value / base) ? value / base : fallback;
}

function daysBetween(left: string, right: string): number {
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function lineByCategory(snapshot: StoredPlanFactSnapshot | null, category: string) {
  return snapshot?.categories.find((item) => item.category === category) ?? null;
}

function momentum(currentActual: number, currentPlanToDate: number, previousActual: number | null, previousPlanToDate: number | null): number {
  const currentRatio = safeRatio(currentActual, currentPlanToDate, 1);
  if (previousActual === null || previousPlanToDate === null) return clamp(0.65 + currentRatio * 0.35, 0.8, 1.2);
  const intervalActual = currentActual - previousActual;
  const intervalPlan = currentPlanToDate - previousPlanToDate;
  const recentRatio = intervalPlan > 0 ? safeRatio(intervalActual, intervalPlan, currentRatio) : currentRatio;
  return clamp(0.2 + currentRatio * 0.25 + recentRatio * 0.55, 0.75, 1.25);
}

function computeCategory(current: StoredPlanFactSnapshot["categories"][number], previous: StoredPlanFactSnapshot["categories"][number] | null, weather: WeatherSummary | null, remainingDays: number, coverageDays: number): CategoryForecast {
  const revenueMomentum = momentum(current.actualRevenue, current.planToDateRevenue, previous?.actualRevenue ?? null, previous?.planToDateRevenue ?? null);
  const marginMomentum = momentum(current.actualMargin, current.planToDateMargin, previous?.actualMargin ?? null, previous?.planToDateMargin ?? null);
  const remainingPlanRevenue = Math.max(0, current.monthlyPlanRevenue - current.planToDateRevenue);
  const remainingPlanMargin = Math.max(0, current.monthlyPlanMargin - current.planToDateMargin);
  const weatherFactor = categoryWeatherFactor(current.category, weather);
  const weatherWindowDays = Math.min(7, remainingDays);
  const weatherImpactRevenue = current.monthlyPlanRevenue * (weatherWindowDays / Math.max(1, coverageDays)) * weatherFactor;
  const forecastRevenue = Math.max(current.actualRevenue, current.actualRevenue + remainingPlanRevenue * revenueMomentum + weatherImpactRevenue);
  const forecastMargin = Math.max(current.actualMargin, current.actualMargin + remainingPlanMargin * marginMomentum);
  return {
    ...current,
    forecastRevenue,
    forecastMargin,
    forecastRevenueRatio: safeRatio(forecastRevenue, current.monthlyPlanRevenue, 0),
    weatherFactor,
    weatherImpactRevenue
  };
}

export function buildForecast(snapshot: StoredPlanFactSnapshot, previousSnapshot: StoredPlanFactSnapshot | null, weather: WeatherSummary | null, previousForecastRevenueRatio: number | null = null): ForecastResult {
  const reportDay = Number(snapshot.reportDate.slice(8, 10));
  const horizonDay = Number(snapshot.planHorizonEnd.slice(8, 10));
  const coverageDays = Math.max(1, horizonDay);
  const remainingDays = daysBetween(snapshot.reportDate, snapshot.planHorizonEnd);
  const categories = snapshot.categories.map((category) => computeCategory(category, lineByCategory(previousSnapshot, category.category), weather, remainingDays, coverageDays));
  const categoryPlan = categories.reduce((sum, item) => sum + item.monthlyPlanRevenue, 0);
  const useCategorySum = categoryPlan > 0 && snapshot.overall.monthlyPlanRevenue > 0 && Math.abs(categoryPlan - snapshot.overall.monthlyPlanRevenue) / snapshot.overall.monthlyPlanRevenue < 0.05;

  let forecastRevenue = categories.reduce((sum, item) => sum + item.forecastRevenue, 0);
  let forecastMargin = categories.reduce((sum, item) => sum + item.forecastMargin, 0);
  let weatherImpactRevenue = categories.reduce((sum, item) => sum + item.weatherImpactRevenue, 0);
  if (!useCategorySum) {
    const revenueMomentum = momentum(snapshot.overall.actualRevenue, snapshot.overall.planToDateRevenue, previousSnapshot?.overall.actualRevenue ?? null, previousSnapshot?.overall.planToDateRevenue ?? null);
    const marginMomentum = momentum(snapshot.overall.actualMargin, snapshot.overall.planToDateMargin, previousSnapshot?.overall.actualMargin ?? null, previousSnapshot?.overall.planToDateMargin ?? null);
    forecastRevenue = snapshot.overall.actualRevenue + Math.max(0, snapshot.overall.monthlyPlanRevenue - snapshot.overall.planToDateRevenue) * revenueMomentum;
    forecastMargin = snapshot.overall.actualMargin + Math.max(0, snapshot.overall.monthlyPlanMargin - snapshot.overall.planToDateMargin) * marginMomentum;
    weatherImpactRevenue = 0;
  }

  const elapsedSincePrevious = previousSnapshot ? daysBetween(previousSnapshot.reportDate, snapshot.reportDate) : 0;
  const recentDailyRevenue = previousSnapshot && elapsedSincePrevious > 0 ? (snapshot.overall.actualRevenue - previousSnapshot.overall.actualRevenue) / elapsedSincePrevious : null;
  return {
    snapshot,
    previousSnapshot,
    weather,
    categories,
    forecastRevenue,
    forecastMargin,
    forecastRevenueRatio: safeRatio(forecastRevenue, snapshot.overall.monthlyPlanRevenue, 0),
    forecastMarginRatio: safeRatio(forecastMargin, snapshot.overall.monthlyPlanMargin, 0),
    planToDateRatio: safeRatio(snapshot.overall.actualRevenue, snapshot.overall.planToDateRevenue, 0),
    monthCompletionRatio: safeRatio(snapshot.overall.actualRevenue, snapshot.overall.monthlyPlanRevenue, 0),
    requiredDailyRevenue: remainingDays > 0 ? Math.max(0, snapshot.overall.monthlyPlanRevenue - snapshot.overall.actualRevenue) / remainingDays : 0,
    recentDailyRevenue,
    weatherImpactRevenue,
    previousForecastRevenueRatio
  };
}
