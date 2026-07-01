import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminSessionAuthorized } from "../admin/session";
import { isDatabaseConfigured } from "../knowledge/db";
import {
  deleteArticle,
  getStats,
  listArticles,
  listCategories,
  listUnanswered,
  resolveUnanswered,
  saveArticle,
  saveCategory
} from "../knowledge/repository";
import type { ArticleStatus } from "../knowledge/types";

type ArticleInput = {
  id?: string;
  categoryId?: string;
  question?: string;
  answer?: string;
  keywords?: string[];
  status?: ArticleStatus;
};

function invalidArticle(input: ArticleInput): boolean {
  return !input.categoryId?.trim() || !input.question?.trim() || !input.answer?.trim() || !["draft", "published"].includes(input.status ?? "draft");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!isAdminSessionAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: "База данных не подключена", code: "DATABASE_NOT_CONFIGURED" });
    return;
  }

  try {
    if (req.method === "GET") {
      const [stats, categories, articles, unanswered] = await Promise.all([
        getStats(),
        listCategories(),
        listArticles(),
        listUnanswered()
      ]);
      res.status(200).json({ stats, categories, articles, unanswered });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = body.action;

    if (action === "article.save") {
      const article = (body.article ?? {}) as ArticleInput;
      if (invalidArticle(article)) {
        res.status(400).json({ error: "Заполните категорию, вопрос и ответ" });
        return;
      }
      const id = await saveArticle(article as Required<Pick<ArticleInput, "categoryId" | "question" | "answer">> & ArticleInput);
      res.status(200).json({ ok: true, id });
      return;
    }

    if (action === "article.delete" && typeof body.id === "string") {
      await deleteArticle(body.id);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "category.save") {
      const category = (body.category ?? {}) as { id?: string; title?: string; active?: boolean };
      if (!category.title?.trim()) {
        res.status(400).json({ error: "Укажите название категории" });
        return;
      }
      const id = await saveCategory({ id: category.id, title: category.title, active: category.active });
      res.status(200).json({ ok: true, id });
      return;
    }

    if (action === "unanswered.resolve" && Number.isInteger(body.id)) {
      await resolveUnanswered(Number(body.id));
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "articles.import" && Array.isArray(body.articles)) {
      const articles = body.articles as ArticleInput[];
      if (articles.length > 500 || articles.some(invalidArticle)) {
        res.status(400).json({ error: "Импорт содержит некорректные записи или превышает 500 строк" });
        return;
      }
      for (const article of articles) {
        await saveArticle(article as Required<Pick<ArticleInput, "categoryId" | "question" | "answer">> & ArticleInput);
      }
      res.status(200).json({ ok: true, imported: articles.length });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("Knowledge admin API error", error);
    res.status(500).json({ error: "Не удалось выполнить операцию" });
  }
}
