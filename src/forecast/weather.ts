import type { WeatherSummary } from "./types";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=54.7104&longitude=20.4522&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FKaliningrad&forecast_days=7";

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export async function getKaliningradWeatherSummary(): Promise<WeatherSummary> {
  const response = await fetch(WEATHER_URL, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Weather API failed: ${response.status}`);
  const body = await response.json() as {
    timezone?: string;
    daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] };
  };
  const dates = body.daily?.time ?? [];
  const max = body.daily?.temperature_2m_max ?? [];
  const min = body.daily?.temperature_2m_min ?? [];
  const precipitation = body.daily?.precipitation_sum ?? [];
  if (!dates.length || dates.length !== max.length || dates.length !== min.length) throw new Error("Weather API returned incomplete data");
  return {
    generatedAt: new Date().toISOString(),
    timezone: body.timezone ?? "Europe/Kaliningrad",
    startDate: dates[0],
    endDate: dates.at(-1) ?? dates[0],
    averageMaxTemperature: average(max),
    averageMinTemperature: average(min),
    precipitationTotal: precipitation.reduce((sum, value) => sum + (Number(value) || 0), 0),
    rainyDays: precipitation.filter((value) => Number(value) >= 1).length,
    days: dates.length
  };
}

export function categoryWeatherFactor(category: string, weather: WeatherSummary | null): number {
  if (!weather) return 0;
  const name = category.toLowerCase().replace(/ё/g, "е");
  const hot = Math.max(0, weather.averageMaxTemperature - 20);
  const cold = Math.max(0, 18 - weather.averageMaxTemperature);
  const rainShare = weather.days ? weather.rainyDays / weather.days : 0;

  if (name === "напитки") return Math.max(-0.05, Math.min(0.07, hot * 0.005 - cold * 0.004 - rainShare * 0.012));
  if (name.includes("заморозка")) return Math.max(-0.025, Math.min(0.025, Math.max(0, weather.averageMaxTemperature - 22) * 0.002 - cold * 0.0015));
  if (name.includes("специи") || name.includes("выпечки")) return weather.averageMaxTemperature < 18 && rainShare > 0.35 ? 0.012 : 0;
  return 0;
}
