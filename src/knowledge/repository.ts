import { randomUUID } from "node:crypto";
import { ensureSchema, getSql } from "./db";
import { normalizeQuestion, searchKnowledge } from "./search";
import type { ArticleStatus, KnowledgeArticle, KnowledgeCategory, KnowledgeStats, UnansweredQuestion } from "./types";

type ArticleRow = {
  id: string;
  category_id: string;
  category_title: string;
  question: string;
  answer: string;
  keywords: string[];
  status: ArticleStatus;
  updated_at: string | Date;
};

type CategoryRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  active: boolean;
};

function toArticle(row: ArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryTitle: row.category_title,
    question: row.question,
    answer: row.answer,
    keywords: row.keywords ?? [],
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function listCategories(activeOnly = false): Promise<KnowledgeCategory[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = activeOnly
    ? await sql`SELECT id, slug, title, position, active FROM kb_categories WHERE active = true ORDER BY position, title`
    : await sql`SELECT id, slug, title, position, active FROM kb_categories ORDER BY position, title`;
  return (rows as CategoryRow[]).map((row) => ({ ...row }));
}

export async function saveCategory(input: { id?: string; title: string; active?: boolean }): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = input.id ?? randomUUID();
  const slug = normalizeQuestion(input.title).replaceAll(" ", "-") || id;
  const positions = await sql`SELECT COALESCE(max(position), 0)::int + 10 AS position FROM kb_categories` as Array<{ position: number }>;
  const position = positions[0]?.position ?? 10;
  await sql`INSERT INTO kb_categories (id, slug, title, position, active)
    VALUES (${id}, ${slug}, ${input.title.trim()}, ${position}, ${input.active ?? true})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, active = EXCLUDED.active, updated_at = now()`;
  return id;
}

export async function listArticles(status?: ArticleStatus): Promise<KnowledgeArticle[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = status
    ? await sql`SELECT a.id, a.category_id, c.title AS category_title, a.question, a.answer, a.keywords, a.status, a.updated_at
        FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id
        WHERE a.status = ${status} ORDER BY a.updated_at DESC`
    : await sql`SELECT a.id, a.category_id, c.title AS category_title, a.question, a.answer, a.keywords, a.status, a.updated_at
        FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id
        ORDER BY a.updated_at DESC`;
  return (rows as ArticleRow[]).map(toArticle);
}

export async function findArticles(query: string, limit = 3): Promise<KnowledgeArticle[]> {
  return searchKnowledge(query, await listArticles("published"), limit);
}

export async function listCategoryArticles(categoryId: string, limit = 8): Promise<KnowledgeArticle[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT a.id, a.category_id, c.title AS category_title, a.question, a.answer, a.keywords, a.status, a.updated_at
    FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id
    WHERE a.status = 'published' AND a.category_id = ${categoryId}
    ORDER BY a.updated_at DESC LIMIT ${limit}`;
  return (rows as ArticleRow[]).map(toArticle);
}

export async function saveArticle(input: {
  id?: string;
  categoryId: string;
  question: string;
  answer: string;
  keywords?: string[];
  status?: ArticleStatus;
}): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = input.id ?? randomUUID();
  const keywords = (input.keywords ?? []).map((value) => value.trim()).filter(Boolean);
  const status = input.status ?? "draft";

  await sql`INSERT INTO kb_articles (id, category_id, question, answer, keywords, status)
    VALUES (${id}, ${input.categoryId}, ${input.question.trim()}, ${input.answer.trim()}, ${keywords}, ${status})
    ON CONFLICT (id) DO UPDATE SET
      category_id = EXCLUDED.category_id,
      question = EXCLUDED.question,
      answer = EXCLUDED.answer,
      keywords = EXCLUDED.keywords,
      status = EXCLUDED.status,
      updated_at = now()`;
  return id;
}

export async function deleteArticle(id: string): Promise<void> {
  await ensureSchema();
  await getSql()`DELETE FROM kb_articles WHERE id = ${id}`;
}

export async function recordUnanswered(question: string, chatId: string | null, userId: string | null): Promise<void> {
  const normalized = normalizeQuestion(question);
  if (!normalized) return;
  await ensureSchema();
  await getSql()`INSERT INTO kb_unanswered (normalized_question, question, chat_id, user_id)
    VALUES (${normalized}, ${question.trim()}, ${chatId}, ${userId})
    ON CONFLICT (normalized_question) DO UPDATE SET
      occurrences = kb_unanswered.occurrences + 1,
      question = EXCLUDED.question,
      chat_id = EXCLUDED.chat_id,
      user_id = EXCLUDED.user_id,
      resolved = false,
      last_asked_at = now()`;
}

export async function listUnanswered(): Promise<UnansweredQuestion[]> {
  await ensureSchema();
  const rows = await getSql()`SELECT id, question, occurrences, last_asked_at, resolved
    FROM kb_unanswered ORDER BY resolved, occurrences DESC, last_asked_at DESC LIMIT 100`;
  return (rows as Array<{ id: number; question: string; occurrences: number; last_asked_at: string | Date; resolved: boolean }>).map((row) => ({
    id: Number(row.id),
    question: row.question,
    occurrences: row.occurrences,
    lastAskedAt: new Date(row.last_asked_at).toISOString(),
    resolved: row.resolved
  }));
}

export async function resolveUnanswered(id: number): Promise<void> {
  await ensureSchema();
  await getSql()`UPDATE kb_unanswered SET resolved = true WHERE id = ${id}`;
}

export async function rememberArticle(chatId: string, userId: string | null, articleId: string): Promise<void> {
  await ensureSchema();
  await getSql()`INSERT INTO kb_sessions (chat_id, user_id, last_article_id)
    VALUES (${chatId}, ${userId}, ${articleId})
    ON CONFLICT (chat_id) DO UPDATE SET user_id = EXCLUDED.user_id, last_article_id = EXCLUDED.last_article_id, updated_at = now()`;
}

export async function recordFeedback(chatId: string, userId: string | null, helpful: boolean): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const sessions = await sql`SELECT last_article_id FROM kb_sessions WHERE chat_id = ${chatId}` as Array<{ last_article_id: string | null }>;
  const articleId = sessions[0]?.last_article_id;
  if (!articleId) return false;
  await sql`INSERT INTO kb_feedback (article_id, chat_id, user_id, helpful) VALUES (${articleId}, ${chatId}, ${userId}, ${helpful})`;
  return true;
}

export async function getStats(): Promise<KnowledgeStats> {
  await ensureSchema();
  const rows = await getSql()`SELECT
    (SELECT count(*)::int FROM kb_articles) AS articles,
    (SELECT count(*)::int FROM kb_articles WHERE status = 'published') AS published,
    (SELECT count(*)::int FROM kb_unanswered WHERE resolved = false) AS unanswered,
    (SELECT count(*)::int FROM kb_feedback WHERE helpful = true) AS helpful,
    (SELECT count(*)::int FROM kb_feedback WHERE helpful = false) AS unhelpful` as Array<KnowledgeStats>;
  return rows[0] ?? { articles: 0, published: 0, unanswered: 0, helpful: 0, unhelpful: 0 };
}
