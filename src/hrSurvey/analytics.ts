// @ts-nocheck
import { anonSessionId } from "./repository";
import { scoreZone } from "./logic";

export const CATEGORY_LABELS: Record<string, string> = {
  clarity: "Понятность задач",
  working_conditions: "Условия работы",
  staffing: "Укомплектованность",
  workload: "Нагрузка",
  fairness: "Справедливость нагрузки",
  schedule: "График",
  team: "Коллектив",
  manager: "Руководитель",
  training: "Обучение",
  onboarding: "Адаптация",
  rules: "Правила и инструкции",
  communication: "Коммуникация",
  office_store: "Офис и магазины",
  compensation: "Зарплата и премии",
  recognition: "Признание работы",
  growth: "Развитие",
  safety: "Безопасность и уважение",
  trust: "Доверие к компании",
  satisfaction: "Общая удовлетворенность",
  enps: "Рекомендация работодателя",
  turnover: "Риск увольнения",
  retention: "Что удерживает",
  blockers: "Что мешает работать",
  improvements: "Что улучшить",
  comment: "Комментарии",
  anonymous_problem: "Анонимные проблемы"
};

export const CATEGORY_ACTIONS: Record<string, string> = {
  clarity: "Проверить постановку задач, приоритеты смены и инструкции.",
  working_conditions: "Собрать нехватку оборудования, расходников и доступов по точкам.",
  staffing: "Проверить укомплектованность смен, вакансии, больничные и незакрытые часы.",
  workload: "Проверить графики, количество людей в смене и пики задач.",
  fairness: "Проверить распределение задач внутри смены и перегруз отдельных ролей.",
  schedule: "Проверить срок публикации графика и частоту изменений.",
  team: "Проверить конфликты, текучку и адаптацию новичков.",
  manager: "Провести управленческий разбор и дать руководителю обратную связь.",
  training: "Обновить адаптацию, наставничество и базу знаний.",
  onboarding: "Сделать чек-лист новичка и назначить наставника.",
  rules: "Упростить инструкции и канал поиска ответов.",
  communication: "Проверить, как изменения доводятся до сотрудников.",
  office_store: "Разобрать, какие задачи офиса не совпадают с реальностью магазинов и склада.",
  compensation: "Объяснить систему премий, штрафов и расчёта зарплаты.",
  recognition: "Ввести понятную обратную связь и фиксацию хорошей работы.",
  growth: "Показать карьерные маршруты и условия роста.",
  safety: "Проверить грубое общение, давление, страх сообщать о проблемах и конфликты.",
  trust: "Разобрать причины недоверия, особенно по комментариям.",
  satisfaction: "Использовать как главный сигнал и проверять слабые категории."
};

const PROBLEM_ACTIONS: Record<string, string> = {
  "Нехватка сотрудников": "Проверить укомплектованность смен и причины незакрытых часов.",
  "Большая нагрузка": "Убрать лишние задачи и перераспределить работу по смене.",
  "График": "Зафиксировать правила публикации и изменения графика.",
  "Зарплата": "Объяснить расчёт зарплаты, премий и штрафов простым языком.",
  "Руководитель": "Провести разбор с руководителем и проверить стиль коммуникации.",
  "Коллектив": "Разобрать конфликты и усилить адаптацию.",
  "Нехватка обучения": "Обновить обучение и назначить наставников.",
  "Нехватка оборудования или расходников": "Собрать заявки и закрыть критичные нехватки.",
  "Плохая коммуникация": "Навести порядок в каналах задач и ответственных.",
  "Непонятные задачи": "Описать приоритеты и зоны ответственности.",
  "Давление или грубое общение": "Проверить безопасность коммуникации и провести конфиденциальный разбор.",
  "Проблемы между офисом и магазином": "Разобрать задачи офиса, которые мешают магазинам или складу.",
  "Безопасность и уважительное общение": "Проверить случаи давления, грубости и страха сообщать о проблемах.",
  "Работу офиса с магазинами": "Проверить сроки, понятность и реалистичность задач от офиса.",
  "Количество сотрудников в смене": "Сверить графики, нагрузку и фактическое закрытие смен.",
  "Другое": "Разобрать открытые комментарии вручную."
};

const TOPIC_RULES: Array<[string, RegExp]> = [
  ["Зарплата", /зарплат|прем|деньг|штраф|оплат/],
  ["График", /график|смен|выходн|час/],
  ["Руководитель", /руковод|директор|админ|начальн|старш/],
  ["Коллектив", /коллектив|коллег|конфликт/],
  ["Обучение", /обуч|объясн|не знаю|инструкц|стажир/],
  ["Нагрузка", /нагруз|не успеваю|много задач|один в смене/],
  ["Офис и магазины", /офис|магазин|задач|отчет|поставк/],
  ["Условия", /оборудован|расходник|ценник|товар|касс|склад/],
  ["Безопасность", /страх|хам|груб|давлен|униж|оскорб/]
];

const BAD_WORDS = ["плохо", "невозможно", "не хватает", "конфликт", "хам", "штраф", "задерж", "устал", "увол", "бардак", "не успева", "давлен", "униж", "страх", "проблем"];
const GOOD_WORDS = ["хорош", "нрав", "удоб", "спасибо", "норм", "отлич", "помог", "сохрани"];

function round(value: number, digits = 2) { return Number(value.toFixed(digits)); }
function zoneByScore(avg: number | null, lowShare = 0) { if (avg === null) return "normal"; if (avg < 3.2 || lowShare > 0.3) return "red"; if (avg <= 3.8 || lowShare >= 0.15) return "yellow"; return "normal"; }
function zoneByShare(share: number) { if (share >= 30) return "red"; if (share >= 15) return "yellow"; return "normal"; }
function answerOptions(value: unknown): string[] { if (Array.isArray(value)) return value.map(String); if (typeof value !== "string") return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function topicOf(text: string) { const lower = text.toLowerCase(); return TOPIC_RULES.find(([, rule]) => rule.test(lower))?.[0] ?? "Другое"; }
function sentimentOf(text: string) { const lower = text.toLowerCase(); const bad = BAD_WORDS.some((word) => lower.includes(word)); const good = GOOD_WORDS.some((word) => lower.includes(word)); return bad ? "negative" : good ? "positive" : "neutral"; }
function urgencyOf(text: string, code: string) { const lower = text.toLowerCase(); if (code === "anonymous_problem" || /увол|страх|хам|груб|униж|давлен|угроз|конфликт/.test(lower)) return "critical"; if (BAD_WORDS.some((word) => lower.includes(word))) return "attention"; return "normal"; }
function reliability(count: number) { return count >= 5 ? "good" : count >= 3 ? "medium" : "low"; }
function enpsNumber(value: string | null | undefined) { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null; }
function sessionAverage(sessionIds: Set<string>, answers: any[]) { const values = answers.filter((a) => sessionIds.has(a.session_id) && a.answer_number !== null && a.answer_number !== undefined).map((a) => Number(a.answer_number)).filter(Number.isFinite); return values.length ? round(values.reduce((s, v) => s + v, 0) / values.length) : null; }

export function buildSurveyAnalyticsModel({ questions, sessions, answers }: { questions: any[]; sessions: any[]; answers: any[] }) {
  const completedSessions = sessions.filter((session) => session.completed);
  const completedIds = new Set(completedSessions.map((session) => session.id));
  const completedAnswers = answers.filter((answer) => completedIds.has(answer.session_id));
  const scaleQuestions = questions.filter((question) => question.type === "scale_1_5");
  const started = sessions.length;
  const completed = completedSessions.length;
  const completionRate = started ? Math.round((completed / started) * 100) : 0;
  const scoreAnswers = completedAnswers.filter((answer) => answer.answer_number !== null && answer.answer_number !== undefined).map((answer) => Number(answer.answer_number)).filter(Number.isFinite);
  const scaleAverage = scoreAnswers.length ? round(scoreAnswers.reduce((sum, value) => sum + value, 0) / scoreAnswers.length) : null;

  const questionStats = scaleQuestions.map((question) => {
    const rows = completedAnswers.filter((answer) => answer.question_id === question.id && answer.answer_number !== null && answer.answer_number !== undefined);
    const scores = rows.map((answer) => Number(answer.answer_number)).filter(Number.isFinite);
    const average = scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
    const low = scores.filter((value) => value <= 2).length;
    const lowShare = scores.length ? low / scores.length : 0;
    const zone = zoneByScore(average, lowShare);
    return { code: question.code, question: question.text, category: question.category, categoryLabel: CATEGORY_LABELS[question.category] ?? question.category, average, lowShare, count: scores.length, zone, action: CATEGORY_ACTIONS[question.category] ?? "Разобрать вручную" };
  });

  const categoryMap = new Map<string, { scores: number[]; lows: number }>();
  for (const answer of completedAnswers) {
    if (answer.answer_number === null || answer.answer_number === undefined) continue;
    const value = Number(answer.answer_number);
    if (!Number.isFinite(value)) continue;
    const current = categoryMap.get(answer.category) ?? { scores: [], lows: 0 };
    current.scores.push(value);
    if (value <= 2) current.lows += 1;
    categoryMap.set(answer.category, current);
  }
  const categories = [...categoryMap.entries()].map(([category, data]) => {
    const average = round(data.scores.reduce((sum, value) => sum + value, 0) / data.scores.length);
    const lowShare = data.scores.length ? data.lows / data.scores.length : 0;
    const zone = zoneByScore(average, lowShare);
    return { category, label: CATEGORY_LABELS[category] ?? category, average, count: data.scores.length, lowShare: round(lowShare * 100, 1), zone, action: CATEGORY_ACTIONS[category] ?? "Разобрать вручную" };
  }).sort((left, right) => left.average - right.average);

  const problemMap = new Map<string, { question: string; option: string; count: number }>();
  for (const answer of completedAnswers) {
    for (const option of answerOptions(answer.answer_json)) {
      const key = `${answer.question_text}|${option}`;
      const current = problemMap.get(key) ?? { question: answer.question_text, option, count: 0 };
      current.count += 1;
      problemMap.set(key, current);
    }
  }
  const problems = [...problemMap.values()].map((item) => {
    const share = completed ? round((item.count / completed) * 100, 1) : 0;
    return { ...item, share, zone: zoneByShare(share), action: PROBLEM_ACTIONS[item.option] ?? PROBLEM_ACTIONS["Другое"] };
  }).sort((left, right) => right.count - left.count);

  const enpsValues = completedAnswers.filter((answer) => answer.question_code === "enps").map((answer) => enpsNumber(answer.answer_text)).filter((value) => value !== null) as number[];
  const promoters = enpsValues.filter((value) => value >= 9).length;
  const passives = enpsValues.filter((value) => value >= 7 && value <= 8).length;
  const detractors = enpsValues.filter((value) => value <= 6).length;
  const enps = { responses: enpsValues.length, promoters, passives, detractors, score: enpsValues.length ? Math.round(((promoters - detractors) / enpsValues.length) * 100) : null };

  const quitValues = completedAnswers.filter((answer) => answer.question_code === "quit_risk").map((answer) => answer.answer_text ?? "");
  const turnoverHigh = quitValues.filter((value) => value === "Да, думаю" || value === "Уже ищу работу").length;
  const turnoverMedium = quitValues.filter((value) => value === "Иногда").length;
  const turnoverLow = quitValues.filter((value) => value === "Нет").length;
  const turnoverRisk = { high: turnoverHigh, medium: turnoverMedium, low: turnoverLow, shareHigh: quitValues.length ? round((turnoverHigh / quitValues.length) * 100, 1) : 0 };

  const comments = completedAnswers.filter((answer) => answer.answer_text?.trim() && !answer.answer_number && !answer.answer_json).map((answer) => {
    const session = sessions.find((item) => item.id === answer.session_id);
    const text = answer.answer_text.trim();
    const urgency = urgencyOf(text, answer.question_code);
    return { createdAt: new Date(answer.created_at).toISOString(), sessionAnonId: anonSessionId(answer.session_id), question: answer.question_text, answer: text, employeeGroup: session?.employee_group ?? null, employeeRole: session?.employee_role ?? null, tenure: session?.tenure ?? null, storeOrDepartment: session?.store_or_department ?? null, topic: topicOf(text), sentiment: sentimentOf(text), urgency, attention: urgency !== "normal" };
  }).sort((left, right) => Number(right.attention) - Number(left.attention));

  function slice(field: string, label: string) {
    const map = new Map<string, any[]>();
    for (const session of completedSessions) {
      const key = String(session[field] ?? "Не указано").trim() || "Не указано";
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return [...map.entries()].map(([group, rows]) => {
      const ids = new Set(rows.map((row) => row.id));
      const average = sessionAverage(ids, completedAnswers);
      const groupAnswers = completedAnswers.filter((answer) => ids.has(answer.session_id));
      const groupProblems = new Map<string, number>();
      for (const answer of groupAnswers) for (const option of answerOptions(answer.answer_json)) groupProblems.set(option, (groupProblems.get(option) ?? 0) + 1);
      const topProblem = [...groupProblems.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { slice: label, group, count: rows.length, average, zone: zoneByScore(average), reliability: reliability(rows.length), topProblem, comments: comments.filter((comment) => rows.some((row) => anonSessionId(row.id) === comment.sessionAnonId)).length };
    }).sort((left, right) => (right.count - left.count));
  }
  const slices = [...slice("employee_group", "Место работы"), ...slice("employee_role", "Роль"), ...slice("tenure", "Стаж"), ...slice("store_or_department", "Магазин/отдел")];

  const weakQuestions = questionStats.filter((item) => item.count > 0 && item.average !== null).sort((left, right) => (left.average ?? 99) - (right.average ?? 99)).slice(0, 10);
  const actionPlan = [
    ...weakQuestions.filter((item) => item.zone !== "normal").map((item, index) => ({ id: `question-${item.code}`, priority: item.zone === "red" ? `P1-${index + 1}` : `P2-${index + 1}`, zone: item.zone, type: "низкая оценка", title: item.question, metric: `${item.average} балла · низких оценок ${round(item.lowShare * 100, 1)}%`, evidence: item.categoryLabel, action: item.action, scope: item.categoryLabel, status: "Новая" })),
    ...problems.filter((item) => item.zone !== "normal").map((item, index) => ({ id: `problem-${index + 1}`, priority: item.zone === "red" ? `P1-П${index + 1}` : `P2-П${index + 1}`, zone: item.zone, type: "частый выбор", title: item.option, metric: `${item.count} выборов · ${item.share}%`, evidence: item.question, action: item.action, scope: "Проблемы", status: "Новая" })),
    ...comments.filter((item) => item.attention).slice(0, 5).map((item, index) => ({ id: `comment-${index + 1}`, priority: item.urgency === "critical" ? `P1-К${index + 1}` : `P2-К${index + 1}`, zone: item.urgency === "critical" ? "red" : "yellow", type: "комментарий", title: item.topic ?? "Комментарий", metric: item.employeeGroup || item.employeeRole ? [item.employeeGroup, item.employeeRole].filter(Boolean).join(" · ") : "открытый ответ", evidence: item.answer, action: "Прочитать комментарий, проверить факты и назначить ответственного.", scope: item.storeOrDepartment ?? item.employeeGroup ?? "Не указано", status: "Новая" }))
  ].slice(0, 15);

  const riskParts = [
    scaleAverage === null ? 0 : Math.max(0, (3.8 - scaleAverage) / 2.8) * 35,
    Math.min(30, categories.filter((item) => item.zone === "red").length * 8 + categories.filter((item) => item.zone === "yellow").length * 3),
    Math.min(20, problems.filter((item) => item.zone === "red").length * 7 + problems.filter((item) => item.zone === "yellow").length * 3),
    Math.min(15, turnoverRisk.shareHigh / 2)
  ];
  const riskIndex = Math.round(Math.min(100, riskParts.reduce((sum, value) => sum + value, 0)));
  const dataQuality = { started, completed, completionRate, enoughForOverall: completed >= 5, minCompletedRecommended: 5, warning: completed < 5 ? "Мало завершённых анкет. Общие выводы можно смотреть только предварительно." : null };

  return { started, completed, completionRate, scaleAverage, riskIndex, dataQuality, enps, turnoverRisk, categories, problems, weakQuestions, actionPlan, slices, comments };
}
