import { getSql } from "../knowledge/db";
import type { StoredSupportingReport, SupportingReportSummary } from "./supportingTypes";

let schemaPromise: Promise<void> | null = null;

async function createSchema(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS forecast_supporting_reports (
    id bigserial PRIMARY KEY,
    dedupe_key text NOT NULL UNIQUE,
    source_user_id text NOT NULL,
    source_chat_id text,
    message_id text,
    report_type text NOT NULL,
    report_date date NOT NULL,
    filename text NOT NULL,
    summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS forecast_supporting_reports_user_type_date_idx
    ON forecast_supporting_reports(source_user_id, report_type, report_date DESC, created_at DESC)`;
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
  const dedupeKey = `${input.sourceUserId}:${input.summary.type}:${input.summary.reportDate}`;
  const summaryJson = JSON.stringify(input.summary);
  const rows = await sql`INSERT INTO forecast_supporting_reports (
    dedupe_key, source_user_id, source_chat_id, message_id, report_type, report_date, filename, summary
  ) VALUES (
    ${dedupeKey}, ${input.sourceUserId}, ${input.sourceChatId}, ${input.messageId},
    ${input.summary.type}, ${input.summary.reportDate}, ${input.summary.filename}, ${summaryJson}::jsonb
  ) ON CONFLICT (dedupe_key) DO UPDATE SET
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
  sourceUserId: string,
  reportType: SupportingReportSummary["type"]
): Promise<StoredSupportingReport | null> {
  await ensureSupportingSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM forecast_supporting_reports
    WHERE source_user_id=${sourceUserId} AND report_type=${reportType}
    ORDER BY report_date DESC, created_at DESC LIMIT 1` as Array<Record<string, unknown>>;
  return rows[0] ? stored(rows[0]) : null;
}

export async function latestSupportingReports(sourceUserId: string): Promise<{
  comparison: StoredSupportingReport | null;
  sales: StoredSupportingReport | null;
}> {
  const [comparison, sales] = await Promise.all([
    latestSupportingReport(sourceUserId, "period_comparison"),
    latestSupportingReport(sourceUserId, "sales_analysis")
  ]);
  return { comparison, sales };
}
