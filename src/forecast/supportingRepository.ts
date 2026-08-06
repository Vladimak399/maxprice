import { getSql } from "../knowledge/db";
import type { StoredSupportingReport, SupportingReportSummary } from "./supportingTypes";
import { ANALYTICS_WORKSPACE_ID } from "./workspace";

let schemaPromise: Promise<void> | null = null;

async function createSchema(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS forecast_supporting_reports (
    id bigserial PRIMARY KEY,
    dedupe_key text NOT NULL UNIQUE,
    workspace_id text,
    source_user_id text NOT NULL,
    source_chat_id text,
    message_id text,
    report_type text NOT NULL,
    report_date date NOT NULL,
    filename text NOT NULL,
    summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE forecast_supporting_reports ADD COLUMN IF NOT EXISTS workspace_id text`;
  await sql`UPDATE forecast_supporting_reports SET workspace_id=${ANALYTICS_WORKSPACE_ID}
    WHERE workspace_id IS NULL OR workspace_id=''`;
  await sql`DELETE FROM forecast_supporting_reports WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY workspace_id, report_type, report_date
        ORDER BY created_at DESC, id DESC
      ) AS row_number
      FROM forecast_supporting_reports
    ) ranked WHERE ranked.row_number > 1
  )`;
  await sql`UPDATE forecast_supporting_reports
    SET dedupe_key=workspace_id || ':' || report_type || ':' || report_date::text`;
  await sql`ALTER TABLE forecast_supporting_reports ALTER COLUMN workspace_id SET NOT NULL`;
  await sql`DROP INDEX IF EXISTS forecast_supporting_reports_user_type_date_idx`;
  await sql`CREATE INDEX IF NOT EXISTS forecast_supporting_reports_workspace_type_date_idx
    ON forecast_supporting_reports(workspace_id, report_type, report_date DESC, created_at DESC)`;
}

export async function ensureSupportingSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = createSchema().catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
}

export async function saveSupportingReport(input: {
  summary: SupportingReportSummary;
  sourceUserId: string;
  sourceChatId: string | null;
  messageId: string | null;
}): Promise<number> {
  await ensureSupportingSchema();
  const sql = getSql();
  const dedupeKey = `${ANALYTICS_WORKSPACE_ID}:${input.summary.type}:${input.summary.reportDate}`;
  const summaryJson = JSON.stringify(input.summary);
  const rows = await sql`INSERT INTO forecast_supporting_reports (
    dedupe_key, workspace_id, source_user_id, source_chat_id, message_id, report_type, report_date, filename, summary
  ) VALUES (
    ${dedupeKey}, ${ANALYTICS_WORKSPACE_ID}, ${input.sourceUserId}, ${input.sourceChatId}, ${input.messageId},
    ${input.summary.type}, ${input.summary.reportDate}, ${input.summary.filename}, ${summaryJson}::jsonb
  ) ON CONFLICT (dedupe_key) DO UPDATE SET
    source_user_id=EXCLUDED.source_user_id,
    source_chat_id=EXCLUDED.source_chat_id,
    message_id=EXCLUDED.message_id,
    filename=EXCLUDED.filename,
    summary=EXCLUDED.summary,
    created_at=now()
  RETURNING id` as Array<{ id: number | string }>;
  const id = Number(rows[0]?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Не удалось сохранить аналитический отчёт.");
  return id;
}

function stored(row: Record<string, unknown>): StoredSupportingReport {
  const summary = typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary;
  return {
    id: Number(row.id),
    sourceUserId: String(row.source_user_id),
    sourceChatId: row.source_chat_id ? String(row.source_chat_id) : null,
    reportType: String(row.report_type) as StoredSupportingReport["reportType"],
    reportDate: row.report_date instanceof Date ? row.report_date.toISOString().slice(0, 10) : String(row.report_date).slice(0, 10),
    filename: String(row.filename),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    summary: summary as SupportingReportSummary
  };
}

export async function latestSupportingReport(
  _viewerUserId: string,
  reportType: SupportingReportSummary["type"]
): Promise<StoredSupportingReport | null> {
  await ensureSupportingSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM forecast_supporting_reports
    WHERE workspace_id=${ANALYTICS_WORKSPACE_ID} AND report_type=${reportType}
    ORDER BY report_date DESC, created_at DESC LIMIT 1` as Array<Record<string, unknown>>;
  return rows[0] ? stored(rows[0]) : null;
}

export async function latestSupportingReports(viewerUserId: string): Promise<{
  comparison: StoredSupportingReport | null;
  sales: StoredSupportingReport | null;
}> {
  const [comparison, sales] = await Promise.all([
    latestSupportingReport(viewerUserId, "period_comparison"),
    latestSupportingReport(viewerUserId, "sales_analysis")
  ]);
  return { comparison, sales };
}
