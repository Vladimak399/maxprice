export type ArticleStatus = "draft" | "published";

export type KnowledgeCategory = {
  id: string;
  slug: string;
  title: string;
  position: number;
  active: boolean;
};

export type KnowledgeArticle = {
  id: string;
  categoryId: string;
  categoryTitle: string;
  question: string;
  answer: string;
  keywords: string[];
  status: ArticleStatus;
  updatedAt: string;
};

export type UnansweredQuestion = {
  id: number;
  question: string;
  occurrences: number;
  lastAskedAt: string;
  resolved: boolean;
};

export type KnowledgeStats = {
  articles: number;
  published: number;
  unanswered: number;
  helpful: number;
  unhelpful: number;
};
