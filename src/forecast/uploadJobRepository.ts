import { createHash } from "node:crypto";
import { getSql } from "../knowledge/db";
import type { IncomingMaxFile } from "../max/fileAttachments";
import type { ExtractedMaxUpdate } from "../types/max";
import type { ForecastUploadType } from "./reportTypes";

let schemaPromise: Promise<void> | null = null;

async function createSchema(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS forecast_file_jobs (
    dedupe_key text PRIMARY KEY,
    source_user_id text NOT NULL,
    source_chat_id text,
    message_id text,
    file_url_hash text NOT NULL,
    filename text NOT NULL,
    report_type text NOT NULL,
    status text NOT NULL CHECK (status IN ('processing','completed','failed')),
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS forecast_file_jobs_created_idx
    ON forecast_file_jobs(created_at DESC)`;
}

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildForecastFileDedupeKey(input: {
  sourceUserId: string;
  sourceChatId: string | null;
  messageId: string | null;
  fileUrl: string;
  filename: string;
}): string {
  const parts = [
    input.sourceUserId.trim(),
    input.sourceChatId?.trim() ?? "",
    input.messageId?.trim() ?? "",
    sha256(input.fileUrl),
    input.filename.trim().toLowerCase()
  ];
  return sha256(parts.join("\u001f"));
}

export async function claimForecastFileJob(input: {
  update: ExtractedMaxUpdate;
  file: IncomingMaxFile;
  type: ForecastUploadType;
}): Promise<{ claimed: boolean; dedupeKey: string }> {
  await ensureSchema();
  const sourceUserId = input.update.userId;
  if (!sourceUserId) throw new Error("Не удалось определить отправителя файла.");
  const dedupeKey = buildForecastFileDedupeKey({
    sourceUserId,
    sourceChatId: input.update.chatId,
    messageId: input.update.messageId,
    fileUrl: input.file.url,
    filename: input.file.filename
  });
  const fileUrlHash = sha256(input.file.url);
  const sql = getSql();
  const rows = await sql`INSERT INTO forecast_file_jobs (
    dedupe_key, source_user_id, source_chat_id, message_id, file_url_hash, filename, report_type, status
  ) VALUES (
    ${dedupeKey}, ${sourceUserId}, ${input.update.chatId}, ${input.update.messageId},
    ${fileUrlHash}, ${input.file.filename}, ${input.type}, 'processing'
  ) ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING dedupe_key` as Array<{ dedupe_key: string }>;
  return { claimed: Boolean(rows[0]), dedupeKey };
}

export async function completeForecastFileJob(dedupeKey: string): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE forecast_file_jobs
    SET status='completed', error=null, updated_at=now()
    WHERE dedupe_key=${dedupeKey}`;
}

export async function failForecastFileJob(dedupeKey: string, error: string): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE forecast_file_jobs
    SET status='failed', error=${error.slice(0, 2000)}, updated_at=now()
    WHERE dedupe_key=${dedupeKey}`;
}
