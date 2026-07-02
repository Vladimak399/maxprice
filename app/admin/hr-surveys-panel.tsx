"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SurveyStatus = "draft" | "active" | "closed";
type Zone = "red" | "yellow" | "normal";
type Survey = { id: string; title: string; status: SurveyStatus; createdAt: string; stats: { started: number; completed: number }; questionCount: number };
type CategoryScore = { category: string; average: number; count: number; zone: Zone };
type Problem = { question: string; option: string; count: number; share: number };
type Comment = { question: string; answer: string; sessionAnonId: string; employeeGroup?: string | null; employeeRole?: string | null; tenure?: string | null; storeOrDepartment?: string | null };
type Diagnostics = { databaseConfigured: boolean; defaultSurveyCreated: boolean; activeSurveyId: string | null; activeQuestionCount: number; surveyHashSaltConfigured: boolean; adminBaseUrlConfigured: boolean; defaultQuestionCount: number };
type SurveyData = { surveys: Survey[]; activeSurvey: { id: string } | null; diagnostics?: Diagnostics; analytics: null | { started: number; completed: number; completionRate: number; scaleAverage: number | null; categories: CategoryScore[]; problems: Problem[]; comments: Comment[] } };

const CATEGORY_LABELS: Record<string, string> = {
  clarity: "Понятность задач",
  working_conditions: "Условия работы",
  workload: "Нагрузка",
  schedule: "График",
  team: "Коллектив",
  manager: "Руководитель",
  training: "Обучение",
  onboarding: "Адаптация",
  rules: "Правила и инструкции",
  communication: "Коммуникация",
  compensation: "Зарплата и премии",
  recognition: "Признание работы",
  growth: "Развитие",
  trust: "Доверие к компании",
  satisfaction: "Удовлетворённость"
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Ошибка запроса");
  return data;
}

function zoneClass(zone: Zone): string {
  if (zone === "red") return "border-red-200 bg-red-50 text-red-900";
  if (zone === "yellow") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function zoneLabel(zone: Zone): string {
  if (zone === "red") return "красная зона";
  if (zone === "yellow") return "жёлтая зона";
  return "норма";
}

function problemZone(share: number): Zone {
  if (share >= 30) return "red";
  if (share >= 15) return "yellow";
  return "normal";
}

function KpiCard({ label, value, hint, tone = "neutral" }: { label: string; value: string | number; hint?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClass = tone === "bad" ? "border-red-200 bg-red-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white";
  return <div className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}><p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>{hint && <p className="mt-2 text-sm leading-5 text-zinc-600">{hint}</p>}</div>;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{ok ? "✓" : "!"} {label}</span>;
}

export function HrSurveysPanel() {
  const [data, setData] = useState<SurveyData>({ surveys: [], activeSurvey: null, analytics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await api<SurveyData>("/api/admin/surveys")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить опросы"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function action(actionName: string, id?: string) {
    await api("/api/admin/surveys", { method: "POST", body: JSON.stringify({ action: actionName, id }) });
    await load();
  }

  const activeSurvey = useMemo(() => data.surveys.find((survey) => survey.id === data.activeSurvey?.id) ?? data.surveys[0] ?? null, [data]);
  const analytics = data.analytics;
  const weakCategories = [...(analytics?.categories ?? [])].sort((left, right) => left.average - right.average).slice(0, 6);
  const topProblems = [...(analytics?.problems ?? [])].sort((left, right) => right.count - left.count).slice(0, 8);
  const redCount = analytics?.categories.filter((category) => category.zone === "red").length ?? 0;
  const yellowCount = analytics?.categories.filter((category) => category.zone === "yellow").length ?? 0;
  const avg = analytics?.scaleAverage ?? null;

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">HR dashboard</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Опросы сотрудников</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">Сводка для HR: запуск опроса, красные зоны, частые проблемы, комментарии и Excel-отчёт в рабочем виде.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-100" onClick={() => void action("survey.ensureDefault")}>Создать дефолтный опрос</button>
            <button className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10" onClick={() => void load()} disabled={loading}>Обновить</button>
          </div>
        </div>
        {data.diagnostics && <div className="mt-6 flex flex-wrap gap-2"><StatusPill ok={data.diagnostics.defaultSurveyCreated} label="опрос создан" /><StatusPill ok={Boolean(data.diagnostics.activeSurveyId)} label="опрос активен" /><StatusPill ok={data.diagnostics.surveyHashSaltConfigured} label="анонимизация" /><StatusPill ok={data.diagnostics.activeQuestionCount > 0} label={`${data.diagnostics.activeQuestionCount || 0} вопросов`} /></div>}
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Начато" value={analytics?.started ?? 0} hint="Все созданные анкеты, включая повторные прохождения." />
        <KpiCard label="Завершено" value={analytics?.completed ?? 0} hint={`${analytics?.completionRate ?? 0}% дошли до конца`} tone={(analytics?.completionRate ?? 0) >= 70 ? "good" : (analytics?.completionRate ?? 0) >= 40 ? "warn" : "bad"} />
        <KpiCard label="Средний балл" value={avg ?? "—"} hint="Среднее по шкальным вопросам 1-5" tone={avg === null ? "neutral" : avg < 3.2 ? "bad" : avg <= 3.8 ? "warn" : "good"} />
        <KpiCard label="Зоны риска" value={`${redCount} / ${yellowCount}`} hint="Красные / жёлтые категории" tone={redCount > 0 ? "bad" : yellowCount > 0 ? "warn" : "good"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Что требует внимания</h3><p className="mt-1 text-sm text-zinc-500">Сначала разбирать красные зоны, затем частые проблемы.</p></div>{activeSurvey && <a className="button-secondary" href={`/api/admin/surveys/export?surveyId=${encodeURIComponent(activeSurvey.id)}`}>Скачать красивый Excel</a>}</div>
          <div className="mt-5 space-y-3">
            {weakCategories.length === 0 && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Пока нет данных для анализа.</p>}
            {weakCategories.map((category) => <div className={`rounded-2xl border p-4 ${zoneClass(category.zone)}`} key={category.category}><div className="flex items-center justify-between gap-3"><p className="font-semibold">{CATEGORY_LABELS[category.category] ?? category.category}</p><span className="rounded-full bg-white/70 px-3 py-1 text-sm font-semibold">{category.average}</span></div><p className="mt-1 text-sm opacity-80">{zoneLabel(category.zone)} · {category.count} ответов</p></div>)}
          </div>
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Как запустить</h3>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-zinc-700"><li><b>1.</b> Создать дефолтный HR-опрос.</li><li><b>2.</b> Активировать опрос.</li><li><b>3.</b> Сотрудник пишет боту <code className="rounded bg-zinc-100 px-1">опрос</code> или жмёт «Пройти опрос».</li><li><b>4.</b> HR смотрит дашборд и скачивает Excel.</li></ol>
          <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600">Повторное прохождение сохраняется как новая попытка. Старые ответы не удаляются.</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Топ проблем</h3>
          <div className="mt-4 space-y-3">
            {topProblems.map((problem) => { const zone = problemZone(problem.share); return <div className="rounded-2xl border border-zinc-200 p-4" key={`${problem.question}-${problem.option}`}><div className="flex items-center justify-between gap-3"><p className="font-medium">{problem.option}</p><span className={`rounded-full px-3 py-1 text-sm font-semibold ${zoneClass(zone)}`}>{problem.share}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-900" style={{ width: `${Math.min(problem.share, 100)}%` }} /></div><p className="mt-2 text-sm text-zinc-500">{problem.count} выборов</p></div>; })}
            {topProblems.length === 0 && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Проблемы ещё не выбраны.</p>}
          </div>
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Комментарии HR</h3>
          <div className="mt-4 space-y-3">
            {(analytics?.comments ?? []).slice(0, 6).map((comment) => <blockquote className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6" key={`${comment.sessionAnonId}-${comment.question}`}><p>“{comment.answer}”</p><footer className="mt-2 text-xs text-zinc-500">{comment.question}</footer></blockquote>)}
            {(analytics?.comments ?? []).length === 0 && <p className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-500">Открытых комментариев пока нет.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Опросы</h3>
        <div className="mt-4 grid gap-4">
          {data.surveys.map((survey) => <article className="rounded-2xl border border-zinc-200 p-4" key={survey.id}><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="font-semibold">{survey.title}</p><p className="mt-1 text-sm text-zinc-500">Статус: {survey.status} · Вопросов: {survey.questionCount} · Начато: {survey.stats.started} · Завершено: {survey.stats.completed}</p></div><div className="flex flex-wrap gap-2"><a className="button-secondary" href={`/api/admin/surveys/export?surveyId=${encodeURIComponent(survey.id)}`}>Excel</a><button className="button-secondary" disabled={survey.status === "active"} onClick={() => void action("survey.activate", survey.id)}>{survey.status === "active" ? "Активен" : "Активировать"}</button><button className="button-secondary" onClick={() => void action("survey.close", survey.id)}>Закрыть</button></div></div></article>)}
          {!loading && data.surveys.length === 0 && <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">Опросов пока нет.</p>}
        </div>
      </section>
    </div>
  );
}
