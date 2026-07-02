"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { parseCsv } from "../../src/admin/csv";
import type { ArticleStatus, KnowledgeArticle, KnowledgeCategory, KnowledgeStats, UnansweredQuestion } from "../../src/knowledge/types";
import { HrSurveysPanel } from "./hr-surveys-panel";

type AdminData = { stats: KnowledgeStats; categories: KnowledgeCategory[]; articles: KnowledgeArticle[]; unanswered: UnansweredQuestion[] };
type Tab = "articles" | "unanswered" | "import" | "categories" | "surveys";
type Notice = { tone: "error" | "success"; text: string } | null;
const EMPTY_STATS: KnowledgeStats = { articles: 0, published: 0, unanswered: 0, helpful: 0, unhelpful: 0 };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Ошибка запроса");
  return data;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }); onSuccess(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось войти"); }
    finally { setPending(false); }
  }
  return <main className="grid min-h-[100dvh] place-items-center px-4 py-10"><section className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-[0_24px_70px_-38px_rgba(24,24,27,0.28)] md:p-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Суперцены</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">База знаний</h1><p className="mt-2 text-sm leading-6 text-zinc-600">Войдите, чтобы управлять инструкциями и HR-опросами.</p><form className="mt-8 space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm font-medium">Пароль администратора</span><input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}<button className="button-primary w-full" disabled={pending}>{pending ? "Проверяем" : "Войти"}</button></form></section></main>;
}

function Stats({ stats }: { stats: KnowledgeStats }) {
  const items = [["Всего инструкций", stats.articles], ["Опубликовано", stats.published], ["Без ответа", stats.unanswered], ["Полезные ответы", stats.helpful], ["Нужна доработка", stats.unhelpful]];
  return <dl className="grid grid-cols-2 divide-x divide-zinc-200 border-y border-zinc-200 py-5 md:grid-cols-5">{items.map(([label, value]) => <div className="px-4 first:pl-0" key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd></div>)}</dl>;
}

function ArticleEditor({ categories, article, onSaved, onCancel }: { categories: KnowledgeCategory[]; article: KnowledgeArticle | null; onSaved: () => void; onCancel: () => void }) {
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? categories[0]?.id ?? "");
  const [question, setQuestion] = useState(article?.question ?? "");
  const [answer, setAnswer] = useState(article?.answer ?? "");
  const [keywords, setKeywords] = useState(article?.keywords.join(", ") ?? "");
  const [status, setStatus] = useState<ArticleStatus>(article?.status ?? "draft");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setNotice(null);
    try { await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify({ action: "article.save", article: { id: article?.id, categoryId, question, answer, keywords: keywords.split(",").map((item) => item.trim()).filter(Boolean), status } }) }); onSaved(); }
    catch (caught) { setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Не удалось сохранить" }); }
    finally { setPending(false); }
  }
  return <form className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-7" onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-tight">{article ? "Редактирование" : "Новая инструкция"}</h2><p className="mt-1 text-sm text-zinc-500">Ответ публикуется в MAX после смены статуса.</p></div>{article && <button className="text-sm text-zinc-500 hover:text-zinc-900" type="button" onClick={onCancel}>Закрыть</button>}</div><div className="mt-6 grid gap-5 md:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-medium">Категория</span><select className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{categories.filter((item) => item.active).map((category) => <option value={category.id} key={category.id}>{category.title}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-medium">Статус</span><select className="field" value={status} onChange={(event) => setStatus(event.target.value as ArticleStatus)}><option value="draft">Черновик</option><option value="published">Опубликовано</option></select></label></div><label className="mt-5 block"><span className="mb-2 block text-sm font-medium">Вопрос сотрудника</span><input className="field" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} required /></label><label className="mt-5 block"><span className="mb-2 block text-sm font-medium">Инструкция</span><textarea className="field min-h-40 resize-y" value={answer} onChange={(event) => setAnswer(event.target.value)} required /></label><label className="mt-5 block"><span className="mb-2 block text-sm font-medium">Ключевые слова</span><input className="field" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="возврат, чек, покупатель" /></label>{notice && <p className={`mt-4 text-sm ${notice.tone === "error" ? "text-red-700" : "text-emerald-800"}`} role="alert">{notice.text}</p>}<div className="mt-6 flex gap-3"><button className="button-primary" disabled={pending}>{pending ? "Сохраняем" : "Сохранить"}</button>{article && <button className="button-secondary" type="button" onClick={onCancel}>Отмена</button>}</div></form>;
}

function ArticleList({ articles, onEdit, onDelete }: { articles: KnowledgeArticle[]; onEdit: (article: KnowledgeArticle) => void; onDelete: (id: string) => void }) {
  if (articles.length === 0) return <div className="border-t border-zinc-200 py-14 text-center text-sm text-zinc-500">Создайте первую инструкцию — после публикации она появится в боте.</div>;
  return <div className="divide-y divide-zinc-200 border-y border-zinc-200">{articles.map((article) => <article className="grid gap-3 py-5 md:grid-cols-[1fr_160px_150px] md:items-center" key={article.id}><div><h3 className="font-medium">{article.question}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-500">{article.answer}</p></div><div className="text-sm text-zinc-600"><p>{article.categoryTitle}</p><p className={article.status === "published" ? "mt-1 text-emerald-800" : "mt-1 text-amber-700"}>{article.status === "published" ? "Опубликовано" : "Черновик"}</p></div><div className="flex gap-3 md:justify-end"><button className="text-sm font-medium text-emerald-800" onClick={() => onEdit(article)}>Изменить</button><button className="text-sm text-red-700" onClick={() => onDelete(article.id)}>Удалить</button></div></article>)}</div>;
}

function ImportPanel({ categories, onImported }: { categories: KnowledgeCategory[]; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return; setPending(true); setNotice(null);
    try {
      const rows = parseCsv(await file.text());
      const headers = (rows.shift() ?? []).map((value) => value.toLowerCase().trim());
      const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const categoryIndex = indexOf("категория", "category", "categoryid");
      const questionIndex = indexOf("вопрос", "question");
      const answerIndex = indexOf("ответ", "answer");
      const keywordsIndex = indexOf("ключевые слова", "keywords");
      if ([categoryIndex, questionIndex, answerIndex].some((index) => index < 0)) throw new Error("Нужны колонки: категория, вопрос, ответ");
      const articles = rows.map((row) => {
        const categoryValue = row[categoryIndex]?.toLowerCase();
        const category = categories.find((item) => item.id.toLowerCase() === categoryValue || item.title.toLowerCase() === categoryValue);
        if (!category) throw new Error(`Неизвестная категория: ${row[categoryIndex] ?? ""}`);
        return { categoryId: category.id, question: row[questionIndex] ?? "", answer: row[answerIndex] ?? "", keywords: keywordsIndex >= 0 ? (row[keywordsIndex] ?? "").split("|").map((item) => item.trim()).filter(Boolean) : [], status };
      });
      await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify({ action: "articles.import", articles }) });
      setNotice({ tone: "success", text: `Импортировано: ${articles.length}` }); setFile(null); onImported();
    } catch (caught) { setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Ошибка импорта" }); }
    finally { setPending(false); }
  }
  return <section className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-tight">Импорт вопросов и ответов</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Загрузите CSV в UTF-8. Колонки: категория, вопрос, ответ, ключевые слова. Ключевые слова разделяются знаком |.</p><form className="mt-7 space-y-5 rounded-2xl border border-zinc-200 bg-white p-6" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm font-medium">CSV-файл</span><input className="field" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label><label className="block"><span className="mb-2 block text-sm font-medium">Статус новых записей</span><select className="field" value={status} onChange={(event) => setStatus(event.target.value as ArticleStatus)}><option value="draft">Черновик — проверить перед публикацией</option><option value="published">Сразу опубликовать</option></select></label>{notice && <p className={`text-sm ${notice.tone === "error" ? "text-red-700" : "text-emerald-800"}`} role="status">{notice.text}</p>}<button className="button-primary" disabled={pending || !file}>{pending ? "Импортируем" : "Импортировать"}</button></form></section>;
}

export function AdminApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminData>({ stats: EMPTY_STATS, categories: [], articles: [], unanswered: [] });
  const [tab, setTab] = useState<Tab>("articles");
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryTitle, setCategoryTitle] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await api<AdminData>("/api/admin/knowledge")); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные"); } finally { setLoading(false); } }, []);
  useEffect(() => { api<{ authenticated: boolean }>("/api/admin/login").then(({ authenticated: value }) => { setAuthenticated(value); if (value) void load(); else setLoading(false); }).catch(() => { setAuthenticated(false); setLoading(false); }); }, [load]);
  const tabs = useMemo<Array<[Tab, string, number | null]>>(() => [["articles", "Инструкции", data.articles.length], ["unanswered", "Без ответа", data.stats.unanswered], ["import", "Импорт", null], ["categories", "Категории", data.categories.length], ["surveys", "HR-опросы", null]], [data]);
  if (authenticated === null || (authenticated && loading && data.categories.length === 0 && !error)) return <div className="min-h-[100dvh] animate-pulse bg-zinc-100" />;
  if (!authenticated) return <Login onSuccess={() => { setAuthenticated(true); void load(); }} />;
  async function mutate(body: Record<string, unknown>) { await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify(body) }); await load(); }
  return <main className="mx-auto min-h-[100dvh] max-w-[1500px] px-4 py-7 md:px-8 md:py-10"><header className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Суперцены</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Админка бота</h1></div><div className="flex gap-3"><button className="button-secondary" onClick={() => void load()} disabled={loading}>Обновить</button><button className="text-sm text-zinc-500" onClick={() => api("/api/admin/login", { method: "DELETE" }).then(() => setAuthenticated(false))}>Выйти</button></div></header>{tab !== "surveys" && <div className="mt-9"><Stats stats={data.stats} /></div>}<div className="mt-9 grid gap-8 lg:grid-cols-[220px_1fr]"><nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Разделы">{tabs.map(([id, label, count]) => <button className={`flex min-w-max items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900"}`} onClick={() => setTab(id)} key={id}><span>{label}</span>{count !== null && <span className="ml-6 tabular-nums opacity-60">{count}</span>}</button>)}</nav><section className="min-w-0">{error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>}{tab === "articles" && <div className="space-y-10"><ArticleEditor key={editing?.id ?? "new"} categories={data.categories} article={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /><div><div className="mb-5 flex items-end justify-between"><h2 className="text-2xl font-semibold tracking-tight">Все инструкции</h2><span className="text-sm text-zinc-500">{data.articles.length}</span></div><ArticleList articles={data.articles} onEdit={(article) => { setEditing(article); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={(id) => { if (window.confirm("Удалить инструкцию?")) void mutate({ action: "article.delete", id }); }} /></div></div>}{tab === "unanswered" && <div><h2 className="text-2xl font-semibold tracking-tight">Вопросы без ответа</h2><p className="mt-2 text-sm text-zinc-600">Формулировки, по которым бот не нашёл опубликованную инструкцию.</p><div className="mt-7 divide-y divide-zinc-200 border-y border-zinc-200">{data.unanswered.filter((item) => !item.resolved).map((item) => <div className="grid gap-3 py-5 md:grid-cols-[1fr_100px_140px] md:items-center" key={item.id}><p className="font-medium">{item.question}</p><p className="text-sm text-zinc-500">Запросов: {item.occurrences}</p><button className="text-left text-sm font-medium text-emerald-800 md:text-right" onClick={() => void mutate({ action: "unanswered.resolve", id: item.id })}>Отметить решённым</button></div>)}{data.unanswered.every((item) => item.resolved) && <p className="py-14 text-center text-sm text-zinc-500">Новых вопросов без ответа нет.</p>}</div></div>}{tab === "import" && <ImportPanel categories={data.categories} onImported={() => void load()} />}{tab === "categories" && <div className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-tight">Категории</h2><form className="mt-6 flex gap-3" onSubmit={(event) => { event.preventDefault(); void mutate({ action: "category.save", category: { title: categoryTitle } }).then(() => setCategoryTitle("")); }}><input className="field" value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} placeholder="Название нового раздела" required /><button className="button-primary min-w-max">Добавить</button></form><div className="mt-7 divide-y divide-zinc-200 border-y border-zinc-200">{data.categories.map((category) => <div className="flex items-center justify-between py-4" key={category.id}><span className="font-medium">{category.title}</span><span className="text-xs text-zinc-500">{category.active ? "Активна" : "Скрыта"}</span></div>)}</div></div>}{tab === "surveys" && <HrSurveysPanel />}</section></div></main>;
}
