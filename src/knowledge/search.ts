import type { KnowledgeArticle } from "./types";

const WORD_PATTERN = /[a-zа-яё0-9]+/giu;

export function normalizeQuestion(value: string): string {
  return (value.toLowerCase().match(WORD_PATTERN) ?? []).join(" ").trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalizeQuestion(value).split(" ").filter((word) => word.length > 2))];
}

export function scoreArticle(query: string, article: KnowledgeArticle): number {
  const normalizedQuery = normalizeQuestion(query);
  if (!normalizedQuery) return 0;

  const question = normalizeQuestion(article.question);
  const answer = normalizeQuestion(article.answer);
  const keywords = article.keywords.map(normalizeQuestion);
  const queryTokens = tokens(normalizedQuery);

  let score = 0;
  if (question === normalizedQuery) score += 100;
  if (question.includes(normalizedQuery) || normalizedQuery.includes(question)) score += 45;

  for (const token of queryTokens) {
    if (question.includes(token)) score += 12;
    if (keywords.some((keyword) => keyword.includes(token))) score += 16;
    if (answer.includes(token)) score += 3;
  }

  return score;
}

export function searchKnowledge(query: string, articles: KnowledgeArticle[], limit = 3): KnowledgeArticle[] {
  return articles
    .map((article) => ({ article, score: scoreArticle(query, article) }))
    .filter(({ score }) => score >= 12)
    .sort((left, right) => right.score - left.score || left.article.question.localeCompare(right.article.question, "ru"))
    .slice(0, limit)
    .map(({ article }) => article);
}
