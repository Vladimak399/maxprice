import * as XLSX from "xlsx";
import { ensureSchema, getSql } from "../knowledge/db";
import { anonSessionId } from "./repository";

export const FORBIDDEN_EXPORT_COLUMNS = ["user_hash", "chat_hash", "source_chat_id", "user_id", "chat_id", "message_id"];

export const CATEGORY_LABELS: Record<string, string> = {
  profile: "Профиль сотрудника",
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
  satisfaction: "Общая удовлетворенность",
  enps: "Рекомендация работодателя",
  blockers: "Что мешает работать",
  improvements: "Что улучшить",
  comment: "Комментарии",
  anonymous_problem: "Анонимные проблемы"
};

const CATEGORY_HELP: Record<string, { meaning: string; action: string }> = {
  clarity: { meaning: "Непонятны ожидания и приоритеты.", action: "Проверить постановку задач, приоритеты смены и инструкции." },
  working_conditions: { meaning: "Не хватает условий, инструментов или расходников.", action: "Собрать нехватку оборудования, расходников и доступов по точкам." },
  workload: { meaning: "Сотрудники могут не успевать выполнять работу качественно.", action: "Проверить графики, количество людей в смене и пики задач." },
  schedule: { meaning: "Есть напряжение вокруг графика.", action: "Проверить срок публикации графика и частоту изменений." },
  team: { meaning: "Возможны конфликты или слабая взаимопомощь.", action: "Проверить конфликты, текучку и адаптацию новичков." },
  manager: { meaning: "Есть риск проблем в управлении и обратной связи.", action: "Провести управленческий разбор и дать руководителю обратную связь." },
  training: { meaning: "Не хватает обучения для уверенной работы.", action: "Обновить адаптацию, наставничество и базу знаний." },
  onboarding: { meaning: "Новички могут входить в работу без понятного маршрута.", action: "Сделать чек-лист новичка и назначить наставника." },
  rules: { meaning: "Правила и инструкции могут быть непонятны.", action: "Упростить инструкции и канал поиска ответов." },
  communication: { meaning: "Изменения доходят поздно или непонятно.", action: "Проверить, как офис доносит изменения до магазинов." },
  compensation: { meaning: "Есть напряжение вокруг зарплаты, премий или штрафов.", action: "Объяснить систему премий, штрафов и расчёта зарплаты." },
  recognition: { meaning: "Сотрудники не видят признания хорошей работы.", action: "Ввести понятную обратную связь и фиксацию хорошей работы." },
  growth: { meaning: "Не видно развития внутри компании.", action: "Показать карьерные маршруты и условия роста." },
  trust: { meaning: "Есть риск падения доверия к компании.", action: "Разобрать причины недоверия, особенно по комментариям." },
  satisfaction: { meaning: "Итоговый индикатор отношения к работе.", action: "Использовать как главный сигнал и проверять слабые категории." }
};

const PROBLEM_HELP: Record<string, { check: string; action: string }> = {
  "Нехватка сотрудников": { check: "Графики, закрытие смен, текучку, нагрузку по магазинам.", action: "Проверить укомплектованность смен и причины незакрытых часов." },
  "Большая нагрузка": { check: "Распределение задач, пики нагрузки, дублирование задач.", action: "Убрать лишние задачи и перераспределить работу по смене." },
  "График": { check: "Срок публикации графика и частоту изменений.", action: "Зафиксировать правила публикации и изменения графика." },
  "Зарплата": { check: "Прозрачность премий, штрафов и ожидания сотрудников.", action: "Объяснить расчёт зарплаты и премий простым языком." },
  "Руководитель": { check: "Стиль коммуникации, обратную связь, решение рабочих вопросов.", action: "Провести разбор с руководителем." },
  "Коллектив": { check: "Конфликты, текучку, адаптацию новичков.", action: "Разобрать конфликты и усилить адаптацию." },
  "Нехватка обучения": { check: "Адаптацию, инструкции, наставничество.", action: "Обновить обучение и назначить наставников." },
  "Нехватка оборудования или расходников": { check: "Список недостающего по магазинам.", action: "Собрать заявки и закрыть критичные нехватки." },
  "Плохая коммуникация": { check: "Канал постановки задач и сроки доведения изменений.", action: "Навести порядок в каналах задач и ответственных." },
  "Непонятные задачи": { check: "Приоритеты, зоны ответственности, повторяющиеся поручения.", action: "Описать приоритеты и зоны ответственности." },
  "Другое": { check: "Открытые комментарии и анонимные проблемы.", action: "Разобрать комментарии вручную." }
};

const COMMENT_CODES = new Set(["one_change", "keep_good", "anonymous_problem"]);
const NEGATIVE_WORDS = ["плохо", "невозможно", "не хватает", "конфликт", "хамит", "штраф", "задержка", "устал", "увольнение", "бардак", "не успеваю", "проблем"];

type Zone = "red" | "yellow" | "normal";

function round(value: number, digits = 2): number { return Number(value.toFixed(digits)); }
function pct(value: number): string { return `${round(value * 100, 1)}%`; }
function asNumber(value: unknown): number | null { const number = Number(value); return Number.isFinite(number) ? number : null; }
function asDate(value: unknown): string { return value ? new Date(value as string).toLocaleString("ru-RU") : ""; }
function categoryLabel(category: string): string { return CATEGORY_LABELS[category] ?? category; }
function zoneLabel(zone: Zone): string { return zone === "red" ? "красная" : zone === "yellow" ? "жёлтая" : "нормальная"; }
function zoneByScore(average: number | null, lowShare: number): Zone { if (average === null) return "normal"; if (average < 3.2 || lowShare > 0.3) return "red"; if (average <= 3.8 || lowShare >= 0.15) return "yellow"; return "normal"; }
function zoneByShare(share: number): Zone { if (share >= 0.3) return "red"; if (share >= 0.15) return "yellow"; return "normal"; }
function conclusion(zone: Zone): string { return zone === "red" ? "Критичная зона. Нужен разбор причин и ответственный." : zone === "yellow" ? "Зона напряжения. Нужно уточнить причины." : "Существенной проблемы не видно."; }

function answerOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

function answerText(answer: any): string {
  if (!answer) return "";
  const selected = answerOptions(answer.answer_json);
  if (selected.length) return selected.join(", ");
  const score = asNumber(answer.answer_number);
  return answer.answer_text ?? (score === null ? "" : String(score));
}

function sheetFromAoa(workbook: XLSX.WorkBook, name: string, rows: Array<Array<string | number>>, widths: number[] = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function sheetFromRows(workbook: XLSX.WorkBook, name: string, rows: Array<Record<string, unknown>>, widths: number[] = []) {
  const safeRows = rows.length ? rows : [{ "Нет данных": "" }];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function questionStats(questions: any[], answers: any[]) {
  return questions.map((question) => {
    const rows = answers.filter((answer) => answer.question_id === question.id);
    const scores = rows.map((answer) => asNumber(answer.answer_number)).filter((value): value is number => value !== null);
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) if (score >= 1 && score <= 5) counts[score] = (counts[score] ?? 0) + 1;
    const average = scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    const lowShare = scores.length ? ((counts[1] ?? 0) + (counts[2] ?? 0)) / scores.length : 0;
    const highShare = scores.length ? ((counts[4] ?? 0) + (counts[5] ?? 0)) / scores.length : 0;
    return { position: Number(question.position), code: question.code, category: question.category, categoryLabel: categoryLabel(question.category), question: question.text, type: question.type, count: rows.length, average, lowShare, highShare, zone: question.type === "scale_1_5" ? zoneByScore(average, lowShare) : "normal", counts };
  });
}

function categoryStats(stats: ReturnType<typeof questionStats>) {
  const map = new Map<string, { sum: number; count: number; lows: number }>();
  for (const stat of stats) {
    if (stat.type !== "scale_1_5" || stat.average === null) continue;
    const current = map.get(stat.category) ?? { sum: 0, count: 0, lows: 0 };
    current.sum += stat.average * stat.count;
    current.count += stat.count;
    current.lows += Math.round(stat.lowShare * stat.count);
    map.set(stat.category, current);
  }
  return [...map.entries()].map(([category, value]) => {
    const average = value.count ? round(value.sum / value.count) : null;
    const lowShare = value.count ? value.lows / value.count : 0;
    const help = CATEGORY_HELP[category] ?? { meaning: "Категория требует ручного анализа.", action: "Разобрать ответы и комментарии." };
    return { category, label: categoryLabel(category), average, count: value.count, lowShare, zone: zoneByScore(average, lowShare), meaning: help.meaning, action: help.action };
  }).sort((left, right) => (left.average ?? 99) - (right.average ?? 99));
}

function problemStats(answers: any[], completed: number) {
  const map = new Map<string, { question: string; option: string; count: number }>();
  for (const answer of answers) for (const option of answerOptions(answer.answer_json)) {
    const key = `${answer.question_text}|${option}`;
    const current = map.get(key) ?? { question: answer.question_text, option, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].map((item) => {
    const share = completed ? item.count / completed : 0;
    const help = PROBLEM_HELP[item.option] ?? PROBLEM_HELP["Другое"]!;
    return { ...item, share, zone: zoneByShare(share), check: help.check, action: help.action };
  }).sort((left, right) => right.count - left.count);
}

function enps(answers: any[]): string {
  const values = answers.filter((answer) => answer.question_code === "enps").map((answer) => answer.answer_text ?? "");
  const promoters = values.filter((value) => value === "Да" || value === "Скорее да").length;
  const detractors = values.filter((value) => value === "Нет" || value === "Скорее нет").length;
  return values.length ? String(Math.round((promoters / values.length - detractors / values.length) * 100)) : "Недостаточно данных";
}

function commentRows(answers: any[], sessionsById: Map<string, any>) {
  return answers.filter((answer) => COMMENT_CODES.has(answer.question_code) && answer.answer_text?.trim()).map((answer) => {
    const session = sessionsById.get(answer.session_id);
    const text = answer.answer_text.trim();
    const lower = text.toLowerCase();
    const topic = /зарплат|прем|деньг|штраф/.test(lower) ? "Зарплата" : /график|смен|выходн/.test(lower) ? "График" : /руковод|директор|админ|начальн/.test(lower) ? "Руководитель" : /коллектив|коллег|конфликт/.test(lower) ? "Коллектив" : /обуч|объясн|не знаю|инструкц/.test(lower) ? "Обучение" : /нагруз|не успеваю|много задач/.test(lower) ? "Нагрузка" : /ценник|товар|поставк|оборудован|расходник/.test(lower) ? "Рабочие процессы" : "Другое";
    const attention = answer.question_code === "anonymous_problem" || NEGATIVE_WORDS.some((word) => lower.includes(word)) ? "Да" : "Нет";
    return { "Дата": asDate(answer.created_at), "Анкета": anonSessionId(answer.session_id), "Группа": session?.employee_group ?? "", "Роль": session?.employee_role ?? "", "Стаж": session?.tenure ?? "", "Магазин/отдел": session?.store_or_department ?? "", "Тип": answer.question_code === "anonymous_problem" ? "Анонимная проблема" : answer.question_code === "keep_good" ? "Что сохранить" : "Что улучшить", "Комментарий": text, "Тема": topic, "Внимание": attention, "Комментарий HR": "" };
  });
}

function sessionAverage(sessionIds: Set<string>, answers: any[]): number | null {
  const scores = answers.filter((answer) => sessionIds.has(answer.session_id)).map((answer) => asNumber(answer.answer_number)).filter((value): value is number => value !== null);
  return scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}

function sliceRows(title: string, sessions: any[], answers: any[], field: string) {
  const map = new Map<string, any[]>();
  for (const session of sessions.filter((item) => item.completed)) {
    const key = String(session[field] ?? "Не указано").trim() || "Не указано";
    map.set(key, [...(map.get(key) ?? []), session]);
  }
  return [...map.entries()].map(([group, rows]) => ({ "Срез": title, "Группа": group, "Анкет": rows.length, "Средний балл": sessionAverage(new Set(rows.map((row) => row.id)), answers) ?? "", "Надёжность": rows.length < 3 ? "мало ответов" : "можно анализировать" }));
}

export async function buildSurveyWorkbook(surveyId: string): Promise<Buffer> {
  await ensureSchema();
  const sql = getSql();
  const surveys = await sql`SELECT id,title,description,status FROM hr_surveys WHERE id=${surveyId}` as any[];
  const survey = surveys[0];
  if (!survey) throw new Error("Опрос не найден");
  const questions = await sql`SELECT id,survey_id,position,code,text,category,type,options,required,max_choices FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as any[];
  const sessions = await sql`SELECT id,survey_id,employee_group,employee_role,tenure,store_or_department,completed,current_question_position,started_at,completed_at,attempt_no FROM hr_survey_sessions WHERE survey_id=${surveyId} ORDER BY started_at` as any[];
  const answers = await sql`SELECT id,session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json,created_at FROM hr_survey_answers WHERE survey_id=${surveyId} ORDER BY created_at,id` as any[];
  const sessionsById = new Map<string, any>(sessions.map((session) => [session.id, session]));
  const completed = sessions.filter((session) => session.completed).length;
  const started = sessions.length;
  const qStats = questionStats(questions, answers);
  const cStats = categoryStats(qStats);
  const pStats = problemStats(answers, completed);
  const comments = commentRows(answers, sessionsById);
  const average = sessionAverage(new Set(sessions.map((session) => session.id)), answers);
  const workbook = XLSX.utils.book_new();

  sheetFromAoa(workbook, "Дашборд HR", [
    ["HR-опрос", survey.title],
    ["Статус", survey.status],
    ["Дата выгрузки", new Date().toLocaleString("ru-RU")],
    ["Анкет начато", started],
    ["Анкет завершено", completed],
    ["Процент завершения", started ? pct(completed / started) : "0%"],
    ["Средний балл", average ?? "Недостаточно данных"],
    ["eNPS", enps(answers)],
    ["Красных зон", cStats.filter((item) => item.zone === "red").length],
    ["Жёлтых зон", cStats.filter((item) => item.zone === "yellow").length],
    ["Открытых комментариев", comments.length],
    ["Общий вывод", average === null ? "Пока нет числовых ответов." : average < 3.2 ? "Общая удовлетворенность в красной зоне. Нужен разбор причин." : average <= 3.8 ? "Есть зоны напряжения. Нужно разобрать слабые вопросы." : "Общая оценка нормальная. Проверьте локальные проблемы и комментарии."],
    ["", ""],
    ["ТОП проблем", "Количество / доля / зона"],
    ...pStats.slice(0, 7).map((item) => [item.option, `${item.count} / ${pct(item.share)} / ${zoneLabel(item.zone)}`]),
    ["", ""],
    ["Самые слабые вопросы", "Балл / зона"],
    ...qStats.filter((item) => item.average !== null).sort((left, right) => (left.average ?? 99) - (right.average ?? 99)).slice(0, 10).map((item) => [item.question, `${item.average} / ${zoneLabel(item.zone)}`])
  ], [42, 95]);

  const actionRows = [
    ...qStats.filter((item) => item.type === "scale_1_5" && item.zone !== "normal").map((item, index) => ({ "Приоритет": item.zone === "red" ? `P1-${index + 1}` : `P2-${index + 1}`, "Зона": zoneLabel(item.zone), "Тип": "низкая оценка", "Категория": item.categoryLabel, "Проблема": item.question, "Балл": item.average ?? "", "Низкие": pct(item.lowShare), "Ответов": item.count, "Вывод": conclusion(item.zone), "Действие": CATEGORY_HELP[item.category]?.action ?? "Разобрать вручную", "Ответственный": "", "Статус": "Новая", "Комментарий HR": "" })),
    ...pStats.filter((item) => item.zone !== "normal").map((item, index) => ({ "Приоритет": item.zone === "red" ? `P1-П${index + 1}` : `P2-П${index + 1}`, "Зона": zoneLabel(item.zone), "Тип": "частый выбор", "Категория": "Проблемы", "Проблема": item.option, "Балл": "", "Низкие": "", "Ответов": item.count, "Вывод": item.check, "Действие": item.action, "Ответственный": "", "Статус": "Новая", "Комментарий HR": "" }))
  ];
  sheetFromRows(workbook, "План действий", actionRows, [12, 12, 16, 22, 46, 10, 12, 10, 42, 42, 18, 14, 30]);
  sheetFromRows(workbook, "Вопросы", qStats.map((item) => ({ "№": item.position, "Категория": item.categoryLabel, "Вопрос": item.question, "Ответов": item.count, "Балл": item.average ?? "", "1": item.counts[1] ?? 0, "2": item.counts[2] ?? 0, "3": item.counts[3] ?? 0, "4": item.counts[4] ?? 0, "5": item.counts[5] ?? 0, "Низкие": item.type === "scale_1_5" ? pct(item.lowShare) : "", "Высокие": item.type === "scale_1_5" ? pct(item.highShare) : "", "Зона": item.type === "scale_1_5" ? zoneLabel(item.zone) : "", "Что делать": CATEGORY_HELP[item.category]?.action ?? "Разобрать вручную" })), [6, 24, 58, 10, 10, 6, 6, 6, 6, 6, 12, 12, 12, 44]);
  sheetFromRows(workbook, "Категории", cStats.map((item) => ({ "Категория": item.label, "Балл": item.average ?? "", "Ответов": item.count, "Низкие": pct(item.lowShare), "Зона": zoneLabel(item.zone), "Что означает": item.meaning, "Что делать": item.action })), [26, 10, 10, 12, 12, 50, 50]);
  sheetFromRows(workbook, "Проблемы", pStats.map((item) => ({ "Проблема": item.option, "Выборов": item.count, "Доля": pct(item.share), "Зона": zoneLabel(item.zone), "Что проверить": item.check, "Рекомендуемое действие": item.action })), [34, 10, 10, 12, 52, 52]);
  sheetFromRows(workbook, "Комментарии", comments, [18, 12, 16, 18, 16, 20, 18, 70, 20, 12, 28]);
  sheetFromRows(workbook, "Срезы", [ ...sliceRows("Место работы", sessions, answers, "employee_group"), ...sliceRows("Роль", sessions, answers, "employee_role"), ...sliceRows("Стаж", sessions, answers, "tenure"), ...sliceRows("Магазин/отдел", sessions, answers, "store_or_department") ], [18, 30, 10, 14, 20]);

  const answersBySession = new Map<string, Map<string, any>>();
  for (const answer of answers) { const map = answersBySession.get(answer.session_id) ?? new Map<string, any>(); map.set(answer.question_code, answer); answersBySession.set(answer.session_id, map); }
  sheetFromRows(workbook, "Анкеты", sessions.map((session) => { const map = answersBySession.get(session.id) ?? new Map<string, any>(); return { "Анкета": anonSessionId(session.id), "Попытка": session.attempt_no ?? "", "Начало": asDate(session.started_at), "Завершение": asDate(session.completed_at), "Группа": session.employee_group ?? "", "Роль": session.employee_role ?? "", "Стаж": session.tenure ?? "", "Магазин/отдел": session.store_or_department ?? "", "Статус": session.completed ? "завершена" : "в процессе", "Средний балл": sessionAverage(new Set([session.id]), answers) ?? "", "Что мешает": answerText(map.get("blockers")), "Что улучшить": answerText(map.get("improvements")), "Комментарий": answerText(map.get("one_change")) }; }), [12, 10, 18, 18, 16, 18, 16, 20, 14, 12, 40, 40, 52]);
  sheetFromRows(workbook, "Детальные ответы", answers.map((answer) => { const session = sessionsById.get(answer.session_id); return { "Дата": asDate(answer.created_at), "Анкета": anonSessionId(answer.session_id), "Попытка": session?.attempt_no ?? "", "Группа": session?.employee_group ?? "", "Роль": session?.employee_role ?? "", "Категория": categoryLabel(answer.category), "Код": answer.question_code, "Вопрос": answer.question_text, "Ответ": answerText(answer), "Балл": asNumber(answer.answer_number) ?? "" }; }), [18, 12, 10, 16, 18, 22, 12, 58, 52, 10]);

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
