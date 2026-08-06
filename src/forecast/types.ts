export type PlanFactLine = {
  category: string;
  monthlyPlanRevenue: number;
  monthlyPlanMargin: number;
  planToDateRevenue: number;
  planToDateMargin: number;
  actualRevenue: number;
  actualMargin: number;
};

export type ParsedPlanFact = {
  filename: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  overall: PlanFactLine;
  categories: PlanFactLine[];
};

export type StoredPlanFactSnapshot = ParsedPlanFact & {
  id: number;
  sourceUserId: string;
  sourceChatId: string | null;
  messageId: string | null;
  createdAt: string;
};

export type WeatherSummary = {
  generatedAt: string;
  timezone: string;
  startDate: string;
  endDate: string;
  averageMaxTemperature: number;
  averageMinTemperature: number;
  precipitationTotal: number;
  rainyDays: number;
  days: number;
};

export type CategoryForecast = PlanFactLine & {
  forecastRevenue: number;
  forecastMargin: number;
  forecastRevenueRatio: number;
  weatherFactor: number;
  weatherImpactRevenue: number;
};

export type ForecastResult = {
  snapshot: StoredPlanFactSnapshot;
  previousSnapshot: StoredPlanFactSnapshot | null;
  weather: WeatherSummary | null;
  categories: CategoryForecast[];
  forecastRevenue: number;
  forecastMargin: number;
  forecastRevenueRatio: number;
  forecastMarginRatio: number;
  planToDateRatio: number;
  monthCompletionRatio: number;
  requiredDailyRevenue: number;
  recentDailyRevenue: number | null;
  weatherImpactRevenue: number;
  previousForecastRevenueRatio: number | null;
};
