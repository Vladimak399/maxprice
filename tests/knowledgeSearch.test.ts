import { describe, expect, it } from "vitest";
import { normalizeQuestion, searchKnowledge } from "../src/knowledge/search.js";
import type { KnowledgeArticle } from "../src/knowledge/types.js";

const articles: KnowledgeArticle[] = [
  {
    id: "return",
    categoryId: "returns",
    categoryTitle: "Возвраты",
    question: "Как оформить возврат товара без чека?",
    answer: "Попросите покупателя написать заявление и найдите покупку в системе.",
    keywords: ["возврат", "без чека", "покупатель"],
    status: "published",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "cash",
    categoryId: "cash",
    categoryTitle: "Касса",
    question: "Что делать, если касса не печатает чек?",
    answer: "Проверьте ленту и перезапустите кассовую программу.",
    keywords: ["касса", "чек", "принтер"],
    status: "published",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

describe("knowledge search", () => {
  it("normalizes punctuation and letter case", () => {
    expect(normalizeQuestion("  ВОЗВРАТ, без ЧЕКА? ")).toBe("возврат без чека");
  });

  it("ranks a matching instruction first", () => {
    expect(searchKnowledge("как вернуть товар без чека", articles)[0]?.id).toBe("return");
  });

  it("does not return unrelated instructions", () => {
    expect(searchKnowledge("где лежат ключи от склада", articles)).toEqual([]);
  });
});
