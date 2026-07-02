"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Zone = "red" | "yellow" | "normal";
type View = "overview" | "risks" | "problems" | "comments" | "surveys";
type Survey = { id: string; title: string; status: "draft" | "active" | "closed"; createdAt: string; stats: { started: number; completed: number }; questionCount: number };
type CategoryScore = { category: string; average: number; count: number; zone: Zone };
type Problem = { question: string; option: string; count: number; share: number };
type Comment = { question: string; answer: string; sessionAnonId: string; employeeGroup?: string | null; employeeRole?: string | null; tenure?: string | null; storeOrDepartment?: string | null };
type SurveyData = { surveys: Survey[]; activeSurvey: { id: string } | null; diagnostics?: { databaseConfigured: boolean; defaultSurveyCreated: boolean; activeSurveyId: string | null; activeQuestionCount: number; surveyHashSaltConfigured: boolean; adminBaseUrlConfigured: boolean; defaultQuestionCount: number }; analytics: null | { started: number; completed: number; completionRate: number; scaleAverage: number | null; categories: CategoryScore[]; problems: Problem[]; comments: Comment[] } };

const LABELS: Record<string, string> = {
  clarity: "Понятность задач", working_conditions: "Условия работы", workload: "Нагрузка", schedule: "График", team: "Коллектив", manager: "Руководитель", training: "Обучение", onboarding: "Адаптация", rules: "Правила", communication: "Коммуникация", compensation: "Зарплата и премии", recognition: "Признание", growth: "Развитие", trust: "Доверие", satisfaction: "Удовлетворённость"
};

const ACTIONS: Record<string, string> = {
  clarity: "Проверить постановку задач и приоритеты смены.", working_conditions: "Собрать нехватку оборудования и расходников.", workload: "Проверить людей в смене, графики и пики задач.", schedule: "Зафиксировать правила публикации и изменения графика.", team: "Разобрать конфликты, адаптацию и текучку.", manager: "Провести разбор с руководителем и проверить обратную связь.", training: "Обновить обучение и наставничество.", onboarding: "Сделать чек-лист новичка и назначить наставника.", rules: "Упростить инструкции и поиск ответов.", communication: "Проверить, как офис доносит изменения до магазинов.", compensation: "Объяснить расчёт зарплаты, премий и штрафов.", recognition: "Ввести понятную обратную связь за хорошую работу.", growth: "Показать карьерные маршруты и условия роста.", trust: "Разобрать причины недоверия по комментариям.", satisfaction: "Использовать как общий индикатор и смотреть слабые зоны."
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Ошибка запроса");
  return data;
}

function zoneForProblem(share: number): Zone { return share >= 30 ? "red" : share >= 15 ? "yellow" : "normal"; }
function zoneText(zone: Zone) { return zone === "red" ? "красная" : zone === "yellow" ? "жёлтая" : "норма"; }
function zoneClass(zone: Zone) { return zone === "red" ? "border-red-200 bg-red-50 text-red-900" : zone === "yellow" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"; }
function barClass(zone: Zone) { return zone === "red" ? "bg-red-500" : zone === "yellow" ? "bg-amber-500" : "bg-emerald-500"; }
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }

function Kpi({ title, value, hint, zone = "normal" }: { title: string; value: string | number; hint: string; zone?: Zone }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${zoneClass(zone)}`}><p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{title}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-sm leading-5 opacity-80">{hint}</p></div>;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{ok ? "✓" : "!"} {label}</span>;
}

function CategoryChart({ categories }: { categories: CategoryScore[] }) {
  if (!categories.length) return <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Пока нет оценок по категориям.</p>;
  return <div className="space-y-4">{categories.map((category) => <div key={category.category}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{LABELS[category.category] ?? category.category}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${zoneClass(category.zone)}`}>{category.average}</span></div><div className="h-3 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${barClass(category.zone)}`} style={{ width: `${clamp((category.average / 5) * 100)}%` }} /></div><p className="mt-1 text-xs text-zinc-500">{zoneText(category.zone)} · {category.count} ответов</p></div>)}</div>;
}

function ProblemChart({ problems }: { problems: Problem[] }) {
  if (!problems.length) return <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Проблемы ещё не выбраны.</p>;
  return <div className="space-y-4">{problems.map((problem) => { const zone = zoneForProblem(problem.share); return <div key={`${problem.question}-${problem.option}`}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{problem.option}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${zoneClass(zone)}`}>{problem.share}%</span></div><div className="h-3 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${barClass(zone)}`} style={{ width: `${clamp(problem.share)}%` }} /></div><p className="mt-1 text-xs text-zinc-500">{problem.count} выборов</p></div>; })}</div>;
}

function RiskDonut({ red, yellow, normal }: { red: number; yellow: number; normal: number }) {
  const total = Math.max(1, red + yellow + normal);
  const redPart = (red / total) * 100;
  const yellowPart = ((red + yellow) / total) * 100;
  return <div className="flex items-center gap-5"><div className="grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#ef4444 0 ${redPart}%, #f59e0b ${redPart}% ${yellowPart}%, #22c55e ${yellowPart}% 100%)` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span className="text-2xl font-semibold">{red + yellow}</span><span className="-mt-4 text-xs text-zinc-500">зон риска</span></div></div><div className="space-y-2 text-sm"><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-red-500" />Красные: {red}</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-amber-500" />Жёлтые: {yellow}</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-emerald-500" />Норма: {normal}</p></div></div>;
}

export function HrSurveysPanel() {
  const [data, setData] = useState<SurveyData>({ surveys: [], activeSurvey: null, analytics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await api<SurveyData>("/api/admin/surveys")); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить опросы"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function action(actionName: string, id?: string) { await api("/api/admin/surveys", { method: "POST", body: JSON.stringify({ action: actionName, id }) }); await load(); }

  const activeSurvey = useMemo(() => data.surveys.find((survey) => survey.id === data.activeSurvey?.id) ?? data.surveys[0] ?? null, [data]);
  const analytics = data.analytics;
  const categories = [...(analytics?.categories ?? [])].sort((a, b) => a.average - b.average);
  const problems = [...(analytics?.problems ?? [])].sort((a, b) => b.count - a.count);
  const redCount = categories.filter((category) => category.zone === "red").length;
  const yellowCount = categories.filter((category) => category.zone === "yellow").length;
  const normalCount = categories.filter((category) => category.zone === "normal").length;
  const avg = analytics?.scaleAverage ?? null;
  const actionPlan = [
    ...categories.filter((category) => category.zone !== "normal").map((category, index) => ({ priority: category.zone === "red" ? `P1-${index + 1}` : `P2-${index + 1}`, zone: category.zone, problem: LABELS[category.category] ?? category.category, metric: `${category.average} балла · ${category.count} ответов`, action: ACTIONS[category.category] ?? "Разобрать причины и комментарии вручную." })),
    ...problems.filter((problem) => zoneForProblem(problem.share) !== "normal").map((problem, index) => ({ priority: zoneForProblem(problem.share) === "red" ? `P1-П${index + 1}` : `P2-П${index + 1}`, zone: zoneForProblem(problem.share), problem: problem.option, metric: `${problem.count} выборов · ${problem.share}%`, action: "Проверить факты, найти повторяющиеся причины, назначить ответственного." }))
  ].slice(0, 12);
  const comments = (analytics?.comments ?? []).filter((comment) => !query.trim() || `${comment.answer} ${comment.question} ${comment.employeeGroup ?? ""} ${comment.employeeRole ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tabs: Array<[View, string]> = [["overview", "Обзор"], ["risks", "План действий"], ["problems", "Проблемы"], ["comments", "Комментарии"], ["surveys", "Опросы"]];

  return <div className="space-y-8">
    <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">HR dashboard</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Опросы сотрудников</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">Графики, зоны риска, топ проблем, комментарии и план действий для HR.</p></div><div className="flex flex-wrap gap-2"><button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100" onClick={() => void action("survey.ensureDefault")}>Создать опрос</button>{activeSurvey && <a className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-300" href={`/api/admin/surveys/export?surveyId=${encodeURIComponent(activeSurvey.id)}`}>Скачать Excel</a>}<button className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10" onClick={() => void load()} disabled={loading}>{loading ? "Обновляем" : "Обновить"}</button></div></div>{data.diagnostics && <div className="mt-6 flex flex-wrap gap-2"><StatusPill ok={data.diagnostics.defaultSurveyCreated} label="опрос создан" /><StatusPill ok={Boolean(data.diagnostics.activeSurveyId)} label="активен" /><StatusPill ok={data.diagnostics.surveyHashSaltConfigured} label="анонимизация" /><StatusPill ok={data.diagnostics.activeQuestionCount > 0} label={`${data.diagnostics.activeQuestionCount || 0} вопросов`} /></div>}</div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">{tabs.map(([id, label]) => <button className={`min-w-max rounded-xl px-4 py-2 text-sm font-medium ${view === id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`} key={id} onClick={() => setView(id)}>{label}</button>)}</div>

    {view === "overview" && <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Kpi title="Начато" value={analytics?.started ?? 0} hint="Все анкеты, включая повторные прохождения." /><Kpi title="Завершено" value={analytics?.completed ?? 0} hint={`${analytics?.completionRate ?? 0}% дошли до конца`} zone={(analytics?.completionRate ?? 0) >= 70 ? "normal" : (analytics?.completionRate ?? 0) >= 40 ? "yellow" : "red"} /><Kpi title="Средний балл" value={avg ?? "—"} hint="Среднее по оценочным вопросам 1-5" zone={avg === null ? "normal" : avg < 3.2 ? "red" : avg <= 3.8 ? "yellow" : "normal"} /><Kpi title="Риск-зоны" value={`${redCount} / ${yellowCount}`} hint="Красные / жёлтые категории" zone={redCount > 0 ? "red" : yellowCount > 0 ? "yellow" : "normal"} /></section><section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Карта риска</h3><p className="mt-1 text-sm text-zinc-500">Распределение категорий по зонам.</p><div className="mt-6"><RiskDonut red={redCount} yellow={yellowCount} normal={normalCount} /></div></div><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Категории по баллам</h3><p className="mt-1 text-sm text-zinc-500">Чем короче полоса, тем хуже оценка.</p><div className="mt-5"><CategoryChart categories={categories.slice(0, 8)} /></div></div></section><section className="grid gap-6 xl:grid-cols-2"><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Топ проблем</h3><div className="mt-5"><ProblemChart problems={problems.slice(0, 7)} /></div></div><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Что делать сначала</h3><div className="mt-5 space-y-3">{actionPlan.slice(0, 5).map((item) => <div className={`rounded-2xl border p-4 ${zoneClass(item.zone)}`} key={`${item.priority}-${item.problem}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.priority} · {item.problem}</p><span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">{item.metric}</span></div><p className="mt-2 text-sm leading-6">{item.action}</p></div>)}{actionPlan.length === 0 && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Пока нет красных или жёлтых зон.</p>}</div></div></section></>}

    {view === "risks" && <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">План действий HR</h3><p className="mt-1 text-sm text-zinc-500">Это рабочий список: проблема, доказательство и первое действие.</p><div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200"><div className="min-w-[900px]"><div className="grid grid-cols-[90px_120px_1fr_180px_1.2fr] bg-zinc-950 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white"><span>Приоритет</span><span>Зона</span><span>Проблема</span><span>Метрика</span><span>Первое действие</span></div>{actionPlan.map((item) => <div className="grid grid-cols-[90px_120px_1fr_180px_1.2fr] gap-3 border-t border-zinc-100 px-4 py-4 text-sm" key={`${item.priority}-${item.problem}`}><b>{item.priority}</b><span className={`rounded-full px-3 py-1 text-center text-xs font-semibold ${zoneClass(item.zone)}`}>{zoneText(item.zone)}</span><span>{item.problem}</span><span className="text-zinc-500">{item.metric}</span><span>{item.action}</span></div>)}{actionPlan.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">Пока нет зон риска.</p>}</div></div></section>}

    {view === "problems" && <section className="grid gap-6 xl:grid-cols-[1fr_1fr]"><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Проблемы графиком</h3><div className="mt-5"><ProblemChart problems={problems} /></div></div><div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Категории графиком</h3><div className="mt-5"><CategoryChart categories={categories} /></div></div></section>}

    {view === "comments" && <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h3 className="text-xl font-semibold">Комментарии HR</h3><p className="mt-1 text-sm text-zinc-500">Открытые ответы сотрудников. Можно искать по словам: зарплата, график, руководитель, нагрузка.</p></div><input className="field max-w-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по комментариям" /></div><div className="mt-5 space-y-3">{comments.slice(0, 50).map((comment) => <blockquote className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6" key={`${comment.sessionAnonId}-${comment.question}-${comment.answer}`}><p>“{comment.answer}”</p><footer className="mt-2 text-xs text-zinc-500">{comment.question}{comment.employeeGroup ? ` · ${comment.employeeGroup}` : ""}{comment.employeeRole ? ` · ${comment.employeeRole}` : ""}</footer></blockquote>)}{comments.length === 0 && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Комментарии не найдены.</p>}</div></section>}

    {view === "surveys" && <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">Опросы</h3><div className="mt-4 grid gap-4">{data.surveys.map((survey) => <article className="rounded-2xl border border-zinc-200 p-4" key={survey.id}><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="font-semibold">{survey.title}</p><p className="mt-1 text-sm text-zinc-500">Статус: {survey.status} · Вопросов: {survey.questionCount} · Начато: {survey.stats.started} · Завершено: {survey.stats.completed}</p></div><div className="flex flex-wrap gap-2"><a className="button-secondary" href={`/api/admin/surveys/export?surveyId=${encodeURIComponent(survey.id)}`}>Excel</a><button className="button-secondary" disabled={survey.status === "active"} onClick={() => void action("survey.activate", survey.id)}>{survey.status === "active" ? "Активен" : "Активировать"}</button><button className="button-secondary" onClick={() => void action("survey.close", survey.id)}>Закрыть</button></div></div></article>)}{!loading && data.surveys.length === 0 && <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">Опросов пока нет.</p>}</div></section>}
  </div>;
}
