import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { requireEnv } from "../utils/env";

let sqlClient: NeonQueryFunction<false, false> | null = null;
let schemaPromise: Promise<void> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) sqlClient = neon(requireEnv("DATABASE_URL"));
  return sqlClient;
}

async function createSchema(): Promise<void> {
  const sql = getSql();

  await sql`CREATE TABLE IF NOT EXISTS kb_categories (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS kb_articles (
    id text PRIMARY KEY,
    category_id text NOT NULL REFERENCES kb_categories(id),
    question text NOT NULL,
    answer text NOT NULL,
    keywords text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS kb_articles_status_idx ON kb_articles(status)`;
  await sql`CREATE INDEX IF NOT EXISTS kb_articles_category_idx ON kb_articles(category_id)`;

  await sql`CREATE TABLE IF NOT EXISTS kb_feedback (
    id bigserial PRIMARY KEY,
    article_id text NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
    chat_id text,
    user_id text,
    helpful boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS kb_unanswered (
    id bigserial PRIMARY KEY,
    normalized_question text NOT NULL UNIQUE,
    question text NOT NULL,
    chat_id text,
    user_id text,
    occurrences integer NOT NULL DEFAULT 1,
    resolved boolean NOT NULL DEFAULT false,
    last_asked_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS kb_sessions (
    chat_id text PRIMARY KEY,
    user_id text,
    last_article_id text REFERENCES kb_articles(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS hr_surveys (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text,
    status text NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
    anonymous boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS hr_survey_questions (
    id text PRIMARY KEY,
    survey_id text NOT NULL REFERENCES hr_surveys(id) ON DELETE CASCADE,
    position integer NOT NULL,
    code text NOT NULL,
    text text NOT NULL,
    category text NOT NULL,
    type text NOT NULL CHECK (type IN ('scale_1_5', 'single_choice', 'multi_choice', 'text')),
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    required boolean NOT NULL DEFAULT true,
    max_choices integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (survey_id, position),
    UNIQUE (survey_id, code)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS hr_survey_sessions (
    id text PRIMARY KEY,
    survey_id text NOT NULL REFERENCES hr_surveys(id) ON DELETE CASCADE,
    user_hash text NOT NULL,
    chat_hash text,
    source_chat_id text,
    employee_group text,
    employee_role text,
    tenure text,
    store_or_department text,
    current_question_position integer NOT NULL DEFAULT 1,
    completed boolean NOT NULL DEFAULT false,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (survey_id, user_hash)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS hr_survey_answers (
    id bigserial PRIMARY KEY,
    session_id text NOT NULL REFERENCES hr_survey_sessions(id) ON DELETE CASCADE,
    survey_id text NOT NULL REFERENCES hr_surveys(id) ON DELETE CASCADE,
    question_id text NOT NULL REFERENCES hr_survey_questions(id) ON DELETE CASCADE,
    question_code text NOT NULL,
    question_text text NOT NULL,
    category text NOT NULL,
    answer_text text,
    answer_number numeric,
    answer_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, question_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS max_admin_users (
    id bigserial PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    name text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  const categories = [
    ["returns", "returns", "Возвраты", 10],
    ["cash", "cash", "Касса", 20],
    ["receiving", "receiving", "Приёмка товара", 30],
    ["writeoffs", "writeoffs", "Списания", 40],
    ["inventory", "inventory", "Инвентаризация", 50],
    ["pricing", "pricing", "Цены и ценники", 60],
    ["personnel", "personnel", "Персонал", 70],
    ["emergency", "emergency", "Нештатные ситуации", 80]
  ] as const;

  for (const [id, slug, title, position] of categories) {
    await sql`INSERT INTO kb_categories (id, slug, title, position)
      VALUES (${id}, ${slug}, ${title}, ${position})
      ON CONFLICT (id) DO NOTHING`;
  }
}

export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}
