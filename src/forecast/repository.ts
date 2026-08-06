import { getSql } from "../knowledge/db";
import type { ParsedPlanFact, PlanFactLine, StoredPlanFactSnapshot } from "./types";

let schemaPromise: Promise<void> | null = null;

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function createSchema(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS forecast_snapshots (
    id bigserial PRIMARY KEY,
    dedupe_key text NOT NULL UNIQUE,
    source_user_id text NOT NULL,
    source_chat_id text,
    message_id text,
    filename text NOT NULL,
    report_date date NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    plan_revenue numeric NOT NULL,
    plan_margin numeric NOT NULL,
    plan_to_date_revenue numeric NOT NULL,
    plan_to_date_margin numeric NOT NULL,
    actual_revenue numeric NOT NULL,
    actual_margin numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS forecast_snapshots_user_date_idx ON forecast_snapshots(source_user_id, report_date DESC, created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS forecast_snapshots_user_report_date_idx ON forecast_snapshots(source_user_id, report_date)`;
  await sql`CREATE TABLE IF NOT EXISTS forecast_category_snapshots (
    snapshot_id bigint NOT NULL REFERENCES forecast_snapshots(id) ON DELETE CASCADE,
    category text NOT NULL,
    plan_revenue numeric NOT NULL,
    plan_margin numeric NOT NULL,
    plan_to_date_revenue numeric NOT NULL,
    plan_to_date_margin numeric NOT NULL,
    actual_revenue numeric NOT NULL,
    actual_margin numeric NOT NULL,
    PRIMARY KEY (snapshot_id, category)
  )`;
}

export async function ensureForecastSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = createSchema().catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
}

export async function savePlanFactSnapshot(input: {
  parsed: ParsedPlanFact;
  sourceUserId: string;
  sourceChatId: string | null;
  messageId: string | null;
}): Promise<number> {
  await ensureForecastSchema();
  const sql = getSql();
  const { parsed } = input;
  const dedupeKey = `${input.sourceUserId}:${parsed.reportDate}`;
  const rows = await sql`INSERT INTO forecast_snapshots (
    dedupe_key, source_user_id, source_chat_id, message_id, filename, report_date, period_start, period_end,
    plan_revenue, plan_margin, plan_to_date_revenue, plan_to_date_margin, actual_revenue, actual_margin
  ) VALUES (
    ${dedupeKey}, ${input.sourceUserId}, ${input.sourceChatId}, ${input.messageId}, ${parsed.filename}, ${parsed.reportDate}, ${parsed.periodStart}, ${parsed.periodEnd},
    ${parsed.overall.monthlyPlanRevenue}, ${parsed.overall.monthlyPlanMargin}, ${parsed.overall.planToDateRevenue}, ${parsed.overall.planToDateMargin}, ${parsed.overall.actualRevenue}, ${parsed.overall.actualMargin}
  ) ON CONFLICT (dedupe_key) DO UPDATE SET
    source_chat_id=EXCLUDED.source_chat_id, message_id=EXCLUDED.message_id, filename=EXCLUDED.filename,
    report_date=EXCLUDED.report_date, period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end,
    plan_revenue=EXCLUDED.plan_revenue, plan_margin=EXCLUDED.plan_margin,
    plan_to_date_revenue=EXCLUDED.plan_to_date_revenue, plan_to_date_margin=EXCLUDED.plan_to_date_margin,
    actual_revenue=EXCLUDED.actual_revenue, actual_margin=EXCLUDED.actual_margin
  RETURNING id` as Array<{ id: number | string }>;
  const snapshotId = Number(rows[0]?.id);
  if (!Number.isFinite(snapshotId) || snapshotId <= 0) throw new Error("Не удалось сохранить снимок план-факта.");
  await sql`DELETE FROM forecast_category_snapshots WHERE snapshot_id=${snapshotId}`;
  for (const category of parsed.categories) {
    await sql`INSERT INTO forecast_category_snapshots (
      snapshot_id, category, plan_revenue, plan_margin, plan_to_date_revenue, plan_to_date_margin, actual_revenue, actual_margin
    ) VALUES (
      ${snapshotId}, ${category.category}, ${category.monthlyPlanRevenue}, ${category.monthlyPlanMargin},
      ${category.planToDateRevenue}, ${category.planToDateMargin}, ${category.actualRevenue}, ${category.actualMargin}
    )`;
  }
  return snapshotId;
}

function lineFromRow(row: Record<string, unknown>): PlanFactLine {
  return {
    category: String(row.category),
    monthlyPlanRevenue: numeric(row.plan_revenue),
    monthlyPlanMargin: numeric(row.plan_margin),
    planToDateRevenue: numeric(row.plan_to_date_revenue),
    planToDateMargin: numeric(row.plan_to_date_margin),
    actualRevenue: numeric(row.actual_revenue),
    actualMargin: numeric(row.actual_margin)
  };
}

export async function listLatestPlanFactSnapshots(sourceUserId: string, limit = 3): Promise<StoredPlanFactSnapshot[]> {
  await ensureForecastSchema();
  const sql = getSql();
  const snapshotRows = await sql`SELECT * FROM forecast_snapshots WHERE source_user_id=${sourceUserId} ORDER BY report_date DESC, created_at DESC LIMIT ${limit}` as Array<Record<string, unknown>>;
  const result: StoredPlanFactSnapshot[] = [];
  for (const raw of snapshotRows) {
    const categoryRows = await sql`SELECT category, plan_revenue, plan_margin, plan_to_date_revenue, plan_to_date_margin, actual_revenue, actual_margin FROM forecast_category_snapshots WHERE snapshot_id=${raw.id} ORDER BY category` as Array<Record<string, unknown>>;
    result.push({
      id: numeric(raw.id),
      sourceUserId: String(raw.source_user_id),
      sourceChatId: raw.source_chat_id ? String(raw.source_chat_id) : null,
      messageId: raw.message_id ? String(raw.message_id) : null,
      filename: String(raw.filename),
      reportDate: isoDate(raw.report_date),
      periodStart: isoDate(raw.period_start),
      periodEnd: isoDate(raw.period_end),
      overall: {
        category: "Продукты",
        monthlyPlanRevenue: numeric(raw.plan_revenue),
        monthlyPlanMargin: numeric(raw.plan_margin),
        planToDateRevenue: numeric(raw.plan_to_date_revenue),
        planToDateMargin: numeric(raw.plan_to_date_margin),
        actualRevenue: numeric(raw.actual_revenue),
        actualMargin: numeric(raw.actual_margin)
      },
      categories: categoryRows.map(lineFromRow),
      createdAt: isoTimestamp(raw.created_at)
    });
  }
  return result;
}
