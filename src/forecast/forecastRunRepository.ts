import { getSql } from "../knowledge/db";
import type { ReportScope } from "./scopes";
import { scopeTitle } from "./scopes";
import type { ForecastResult } from "./types";
import { ANALYTICS_WORKSPACE_ID } from "./workspace";

export const FORECAST_ALGORITHM_VERSION = "2026-08-v2";

export type ForecastRunCategory = {
  category: string;
  forecastRevenueRatio: number;
  actualRevenue: number;
  monthlyPlanRevenue: number;
};

export type StoredForecastRun = {
  id: number;
  workspaceId: string;
  sourceUserId: string;
  scopeType: "overall" | "manager" | "category";
  scopeKey: string;
  scopeTitle: string;
  reportDate: string;
  planHorizonEnd: string;
  planIsFullMonth: boolean;
  algorithmVersion: string;
  trigger: string;
  calculatedAt: string;
  actualRevenue: number;
  monthlyPlanRevenue: number;
  planToDateRevenue: number;
  forecastRevenue: number;
  forecastMargin: number;
  forecastRevenueRatio: number;
  forecastMarginRatio: number;
  planToDateRatio: number;
  monthCompletionRatio: number;
  requiredDailyRevenue: number;
  recentDailyRevenue: number | null;
  weatherImpactRevenue: number;
  categories: ForecastRunCategory[];
};

let schemaPromise: Promise<void> | null = null;

function scopeIdentity(scope: ReportScope): {
  type: StoredForecastRun["scopeType"];
  key: string;
  title: string;
} {
  if (scope.kind === "overall") return { type: "overall", key: "overall", title: "Общий отчёт" };
  if (scope.kind === "manager") return { type: "manager", key: scope.manager, title: scopeTitle(scope) };
  return { type: "category", key: scope.category, title: scope.category };
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function createSchema(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS forecast_runs (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL,
    source_user_id text NOT NULL,
    scope_type text NOT NULL,
    scope_key text NOT NULL,
    scope_title text NOT NULL,
    report_date date NOT NULL,
    plan_horizon_end date,
    plan_is_full_month boolean,
    algorithm_version text NOT NULL,
    trigger text NOT NULL,
    actual_revenue numeric NOT NULL,
    monthly_plan_revenue numeric NOT NULL,
    plan_to_date_revenue numeric NOT NULL,
    forecast_revenue numeric NOT NULL,
    forecast_margin numeric NOT NULL,
    forecast_revenue_ratio numeric NOT NULL,
    forecast_margin_ratio numeric NOT NULL,
    plan_to_date_ratio numeric NOT NULL,
    month_completion_ratio numeric NOT NULL,
    required_daily_revenue numeric NOT NULL,
    recent_daily_revenue numeric,
    weather_impact_revenue numeric NOT NULL,
    categories jsonb NOT NULL,
    calculated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, scope_type, scope_key, report_date, algorithm_version)
  )`;
  await sql`ALTER TABLE forecast_runs ADD COLUMN IF NOT EXISTS plan_horizon_end date`;
  await sql`ALTER TABLE forecast_runs ADD COLUMN IF NOT EXISTS plan_is_full_month boolean`;
  await sql`UPDATE forecast_runs SET plan_horizon_end=report_date WHERE plan_horizon_end IS NULL`;
  await sql`UPDATE forecast_runs SET plan_is_full_month=false WHERE plan_is_full_month IS NULL`;
  await sql`ALTER TABLE forecast_runs ALTER COLUMN plan_horizon_end SET NOT NULL`;
  await sql`ALTER TABLE forecast_runs ALTER COLUMN plan_is_full_month SET NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS forecast_runs_workspace_scope_date_idx
    ON forecast_runs(workspace_id, scope_type, scope_key, report_date DESC, calculated_at DESC)`;
}

export async function ensureForecastRunSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = createSchema().catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
}

export async function saveForecastRun(input: {
  sourceUserId: string;
  scope: ReportScope;
  result: ForecastResult;
  trigger: "plan_upload" | "first_view" | "manual_refresh";
  replace: boolean;
}): Promise<number | null> {
  await ensureForecastRunSchema();
  const sql = getSql();
  const identity = scopeIdentity(input.scope);
  const categories = JSON.stringify(input.result.categories.map((item) => ({
    category: item.category,
    forecastRevenueRatio: item.forecastRevenueRatio,
    actualRevenue: item.actualRevenue,
    monthlyPlanRevenue: item.monthlyPlanRevenue
  })));

  const values = {
    workspaceId: ANALYTICS_WORKSPACE_ID,
    sourceUserId: input.sourceUserId,
    scopeType: identity.type,
    scopeKey: identity.key,
    scopeTitle: identity.title,
    reportDate: input.result.snapshot.reportDate,
    planHorizonEnd: input.result.snapshot.planHorizonEnd,
    planIsFullMonth: input.result.snapshot.planIsFullMonth,
    algorithmVersion: FORECAST_ALGORITHM_VERSION,
    trigger: input.trigger,
    actualRevenue: input.result.snapshot.overall.actualRevenue,
    monthlyPlanRevenue: input.result.snapshot.overall.monthlyPlanRevenue,
    planToDateRevenue: input.result.snapshot.overall.planToDateRevenue,
    forecastRevenue: input.result.forecastRevenue,
    forecastMargin: input.result.forecastMargin,
    forecastRevenueRatio: input.result.forecastRevenueRatio,
    forecastMarginRatio: input.result.forecastMarginRatio,
    planToDateRatio: input.result.planToDateRatio,
    monthCompletionRatio: input.result.monthCompletionRatio,
    requiredDailyRevenue: input.result.requiredDailyRevenue,
    recentDailyRevenue: input.result.recentDailyRevenue,
    weatherImpactRevenue: input.result.weatherImpactRevenue
  };

  const rows = input.replace
    ? await sql`INSERT INTO forecast_runs (
        workspace_id, source_user_id, scope_type, scope_key, scope_title, report_date, plan_horizon_end, plan_is_full_month,
        algorithm_version, trigger, actual_revenue, monthly_plan_revenue, plan_to_date_revenue,
        forecast_revenue, forecast_margin, forecast_revenue_ratio, forecast_margin_ratio,
        plan_to_date_ratio, month_completion_ratio, required_daily_revenue, recent_daily_revenue,
        weather_impact_revenue, categories
      ) VALUES (
        ${values.workspaceId}, ${values.sourceUserId}, ${values.scopeType}, ${values.scopeKey}, ${values.scopeTitle}, ${values.reportDate}, ${values.planHorizonEnd}, ${values.planIsFullMonth},
        ${values.algorithmVersion}, ${values.trigger}, ${values.actualRevenue}, ${values.monthlyPlanRevenue}, ${values.planToDateRevenue},
        ${values.forecastRevenue}, ${values.forecastMargin}, ${values.forecastRevenueRatio}, ${values.forecastMarginRatio},
        ${values.planToDateRatio}, ${values.monthCompletionRatio}, ${values.requiredDailyRevenue}, ${values.recentDailyRevenue},
        ${values.weatherImpactRevenue}, ${categories}::jsonb
      ) ON CONFLICT (workspace_id, scope_type, scope_key, report_date, algorithm_version) DO UPDATE SET
        source_user_id=EXCLUDED.source_user_id,
        scope_title=EXCLUDED.scope_title,
        plan_horizon_end=EXCLUDED.plan_horizon_end,
        plan_is_full_month=EXCLUDED.plan_is_full_month,
        trigger=EXCLUDED.trigger,
        actual_revenue=EXCLUDED.actual_revenue,
        monthly_plan_revenue=EXCLUDED.monthly_plan_revenue,
        plan_to_date_revenue=EXCLUDED.plan_to_date_revenue,
        forecast_revenue=EXCLUDED.forecast_revenue,
        forecast_margin=EXCLUDED.forecast_margin,
        forecast_revenue_ratio=EXCLUDED.forecast_revenue_ratio,
        forecast_margin_ratio=EXCLUDED.forecast_margin_ratio,
        plan_to_date_ratio=EXCLUDED.plan_to_date_ratio,
        month_completion_ratio=EXCLUDED.month_completion_ratio,
        required_daily_revenue=EXCLUDED.required_daily_revenue,
        recent_daily_revenue=EXCLUDED.recent_daily_revenue,
        weather_impact_revenue=EXCLUDED.weather_impact_revenue,
        categories=EXCLUDED.categories,
        calculated_at=now()
      RETURNING id` as Array<{ id: number | string }>
    : await sql`INSERT INTO forecast_runs (
        workspace_id, source_user_id, scope_type, scope_key, scope_title, report_date, plan_horizon_end, plan_is_full_month,
        algorithm_version, trigger, actual_revenue, monthly_plan_revenue, plan_to_date_revenue,
        forecast_revenue, forecast_margin, forecast_revenue_ratio, forecast_margin_ratio,
        plan_to_date_ratio, month_completion_ratio, required_daily_revenue, recent_daily_revenue,
        weather_impact_revenue, categories
      ) VALUES (
        ${values.workspaceId}, ${values.sourceUserId}, ${values.scopeType}, ${values.scopeKey}, ${values.scopeTitle}, ${values.reportDate}, ${values.planHorizonEnd}, ${values.planIsFullMonth},
        ${values.algorithmVersion}, ${values.trigger}, ${values.actualRevenue}, ${values.monthlyPlanRevenue}, ${values.planToDateRevenue},
        ${values.forecastRevenue}, ${values.forecastMargin}, ${values.forecastRevenueRatio}, ${values.forecastMarginRatio},
        ${values.planToDateRatio}, ${values.monthCompletionRatio}, ${values.requiredDailyRevenue}, ${values.recentDailyRevenue},
        ${values.weatherImpactRevenue}, ${categories}::jsonb
      ) ON CONFLICT (workspace_id, scope_type, scope_key, report_date, algorithm_version) DO NOTHING
      RETURNING id` as Array<{ id: number | string }>;

  return rows[0]?.id ? Number(rows[0].id) : null;
}

function parseRun(row: Record<string, unknown>): StoredForecastRun {
  const categoriesRaw = typeof row.categories === "string" ? JSON.parse(row.categories) : row.categories;
  return {
    id: numberValue(row.id),
    workspaceId: String(row.workspace_id),
    sourceUserId: String(row.source_user_id),
    scopeType: String(row.scope_type) as StoredForecastRun["scopeType"],
    scopeKey: String(row.scope_key),
    scopeTitle: String(row.scope_title),
    reportDate: isoDate(row.report_date),
    planHorizonEnd: isoDate(row.plan_horizon_end),
    planIsFullMonth: row.plan_is_full_month === true,
    algorithmVersion: String(row.algorithm_version),
    trigger: String(row.trigger),
    calculatedAt: isoTimestamp(row.calculated_at),
    actualRevenue: numberValue(row.actual_revenue),
    monthlyPlanRevenue: numberValue(row.monthly_plan_revenue),
    planToDateRevenue: numberValue(row.plan_to_date_revenue),
    forecastRevenue: numberValue(row.forecast_revenue),
    forecastMargin: numberValue(row.forecast_margin),
    forecastRevenueRatio: numberValue(row.forecast_revenue_ratio),
    forecastMarginRatio: numberValue(row.forecast_margin_ratio),
    planToDateRatio: numberValue(row.plan_to_date_ratio),
    monthCompletionRatio: numberValue(row.month_completion_ratio),
    requiredDailyRevenue: numberValue(row.required_daily_revenue),
    recentDailyRevenue: nullableNumber(row.recent_daily_revenue),
    weatherImpactRevenue: numberValue(row.weather_impact_revenue),
    categories: Array.isArray(categoriesRaw) ? categoriesRaw as ForecastRunCategory[] : []
  };
}

export async function listForecastRuns(scope: ReportScope, limit = 120): Promise<StoredForecastRun[]> {
  await ensureForecastRunSchema();
  const sql = getSql();
  const identity = scopeIdentity(scope);
  const rows = await sql`SELECT DISTINCT ON (report_date) * FROM forecast_runs
    WHERE workspace_id=${ANALYTICS_WORKSPACE_ID}
      AND scope_type=${identity.type}
      AND scope_key=${identity.key}
      AND algorithm_version=${FORECAST_ALGORITHM_VERSION}
    ORDER BY report_date DESC, calculated_at DESC
    LIMIT ${limit}` as Array<Record<string, unknown>>;
  return rows.map(parseRun);
}
