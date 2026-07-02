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

type Survey = { id: string; title: string; description: string | null; status: string };
type QuestionType = "scale_1_5" | "single_choice" | "multi_choice" | "text";
type Question = { id: string; survey_id: string; position: number; code: string; text: string; category: string; type: QuestionType; options: unknown; required: boolean; max_choices: number | null };
type Session = { id: string; survey_id: string; employee_group: string | null; employee_role: string | null; tenure: string | null; store_or_department: string | null; completed: boolean; current_question_position: number; started_at: string | Date; completed_at: string | Date | null; attempt_no?: number | null };
type Answer = { id: number; session_id: string; survey_id: string; question_id: string; question_code: string; question_text: string; category: string; answer_text: string | null; answer_number: string | number | null; answer_json: unknown; created_at: string | Date };
type Zone = "red" | "yellow" | "normal";
type SheetRow = Record<string, string | number>;
type QuestionStat = { position: number; code: string; category: string; categoryLabel: string; question: string; type: QuestionType; count: number; average: number | null; lowShare: number; neutralShare: number; highShare: number; zone: Zone; counts: Record<1 | 2 | 3 | 4 | 5, number> };
type ProblemStat = { question: string; option: string; count: number; share: number; zone: Zone; check: string; action: string };

const CATEGORY_INFO: Record<string, { meaning: string; action: string }> = {
  clarity: { meaning: "Непонятны ожидания и приоритеты.", action: "Проверить постановку задач, приоритеты смены и инструкции." },
  working_conditions: { meaning: "Не хватает условий, инструментов или расходников.", action: "Собрать нехватку оборудования, расходников и доступов по точкам." },
  workload: { meaning: "Сотрудники могут не успевать выполнять работу качественно.", action: "Проверить графики, количество людей в смене и пики задач." },
  schedule: { meaning: "Есть напряжение вокруг графика.", action: "Проверить срок публикации графика и частоту изменений." },
  team: { meaning: "Возможны конфликты или слабая взаимопомощь.", action: "Проверить конфликты, текучку и адаптацию новичков." },
  manager: { meaning: "Есть риск проблем в управлении и обратной связи.", action: "Провести управленческий разбор и дать руководителю обратную связь." },
  training: { meaning: "Не хватает обучения для уверенной работы.", action: "Обновить адаптацию, наставничество и базу знаний." },
  onboarding: { meaning: "Новички могут входить в работу без понятного маршрута.", action: "Сделать чек-лист новичка и назначить наставника." },
  rules: { meaning: "Правила и инструкции могут быть непонятны.", action: "Упростить инструкции и канал поиска ответов." },
  communication: { meaning: "Изменения и задачи доходят поздно или непонятно.", action: "Проверить, как офис доносит изменения до магазинов." },
  compensation: { meaning: "Есть напряжение вокруг зарплаты, премий или штрафов.", action: "Объяснить систему премий, штрафов и расчёта зарплаты." },
  recognition: { meaning: "Сотрудники не видят признания хорошей работы.", action: "Ввести понятную обратную связь и фиксацию хорошей работы." },
  growth: { meaning: "Не видно развития внутри компании.", action: "Показать карьерные маршруты и условия роста." },
  trust: { meaning: "Есть риск падения доверия к компании.", action: "Разобрать причины недоверия, особенно по комментариям." },
  satisfaction: { meaning: "Итоговый индикатор отношения к работе.", action: "Использовать как главный сигнал и проверять слабые категории." }
};

const PROBLEM_INFO: Record<string, { check: string; action: string }> = {
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

const NEGATIVE_WORDS = ["плохо", "невозможно", "не хватает", "конфликт", "хамит", "штраф", "задержка", "устал", "увольнение", "бардак", "не успеваю", "проблем"];
const COMMENT_CODES = new Set(["one_change", "keep_good", "anonymous_problem"]);

const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const pct = (share: number) => `${round(share * 100, 1)}%`;
const toDate = (value: string | Date | null) => value ? new Date(value).toISOString() : "";
const toNumber = (value: string | number | null) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);

function answerOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

function displayAnswer(answer?: Answer): string {
  if (!answer) return "";
  const options = answerOptions(answer.answer_json);
  if (options.length) return options.join(", ");
  const number = toNumber(answer.answer_number);
  return answer.answer_text ?? (number == null ? "" : String(number));
}

function scoreZone(average: number | null, lowShare: number): Zone {
  if (average == null) return "normal";
  if (average < 3.2 || lowShare > 0.3) return "red";
  if (average <= 3.8 || lowShare >= 0.15) return "yellow";
  return "normal";
}

function problemZone(share: number): Zone {
  if (share >= 0.3) return "red";
  if (share >= 0.15) return "yellow";
  return "normal";
}

function zoneText(zone: Zone): string {
  if (zone === "red") return "красная";
  if (zone === "yellow") return "жёлтая";
  return "нормальная";
}

function questionStats(questions: Question[], answers: Answer[]): QuestionStat[] {
  const byQuestion = new Map<string, Answer[]>();
  for (const answer of answers) byQuestion.set(answer.question_id, [...(byQuestion.get(answer.question_id) ?? []), answer]);
  return questions.map((question) => {
    const rows = byQuestion.get(question.id) ?? [];
    const scores = rows.map((row) => toNumber(row.answer_number)).filter((value): value is number => value !== null);
    const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const score of scores) if (score >= 1 && score <= 5) counts[score as 1 | 2 | 3 | 4 | 5] += 1;
    const average = scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    const lowShare = scores.length ? (counts[1] + counts[2]) / scores.length : 0;
    const neutralShare = scores.length ? counts[3] / scores.length : 0;
    const highShare = scores.length ? (counts[4] + counts[5]) / scores.length : 0;
    const zone = question.type === "scale_1_5" ? scoreZone(average, lowShare) : "normal";
    return { position: Number(question.position), code: question.code, category: question.category, categoryLabel: categoryLabel(question.category), question: question.text, type: question.type, count: rows.length, average, lowShare, neutralShare, highShare, zone, counts };
  });
}

function categoryStats(stats: QuestionStat[]): Array<{ category: string; label: string; average: number | null; count: number; lowShare: number; zone: Zone; meaning: string; action: string }> {
  const grouped = new Map<string, { total: number; count: number; lows: number }>();
  for (const stat of stats) {
    if (stat.type !== "scale_1_5" || stat.average == null) continue;
    const current = grouped.get(stat.category) ?? { total: 0, count: 0, lows: 0 };
    current.total += stat.average * stat.count;
    current.count += stat.count;
    current.lows += Math.round(stat.lowShare * stat.count);
    grouped.set(stat.category, current);
  }
  return [...grouped.entries()].map(([category, value]) => {
    const average = value.count ? round(value.total / value.count) : null;
    const lowShare = value.count ? value.lows / value.count : 0;
    const details = CATEGORY_INFO[category] ?? { meaning: "Категория требует ручного анализа.", action: "Разобрать ответы и комментарии по этой теме." };
    return { category, label: categoryLabel(category), average, count: value.count, lowShare, zone: scoreZone(average, lowShare), meaning: details.meaning, action: details.action };
  }).sort((left, right) => (left.average ?? 99) - (right.average ?? 99));
}

function problemStats(answers: Answer[], completed: number): ProblemStat[] {
  const grouped = new Map<string, { question: string; option: string; count: number }>();
  for (const answer of answers) for (const option of answerOptions(answer.answer_json)) {
    const key = `${answer.question_text}|${option}`;
    const current = grouped.get(key) ?? { question: answer.question_text, option, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].map((item) => {
    const share = completed ? item.count / completed : 0;
    const details = PROBLEM_INFO[item.option] ?? PROBLEM_INFO["Другое"]!;
    return { ...item, share, zone: problemZone(share), check: details.check, action: details.action };
  }).sort((left, right) => right.count - left.count);
}

function enps(answers: Answer[]): { score: string; promoters: number; neutrals: number; detractors: number; total: number } {
  const values = answers.filter((answer) => answer.question_code === "enps").map((answer) => answer.answer_text ?? "");
  const promoters = values.filter((value) => value === "Да" || value === "Скорее да").length;
  const neutrals = values.filter((value) => value === "Не знаю").length;
  const detractors = values.filter((value) => value === "Нет" || value === "Скорее нет").length;
  const total = promoters + neutrals + detractors;
  const score = total ? String(Math.round((promoters / total - detractors / total) * 100)) : "Недостаточно данных";
  return { score, promoters, neutrals, detractors, total };
}

function comments(answers: Answer[], sessions: Map<string, Session>) {
  return answers.filter((answer) => COMMENT_CODES.has(answer.question_code) && Boolean(answer.answer_text?.trim())).map((answer) => {
    const session = sessions.get(answer.session_id);
    const text = answer.answer_text?.trim() ?? "";
    const lower = text.toLowerCase();
    const topic = /зарплат|прем|деньг|штраф/.test(lower) ? "Зарплата" : /график|смен|выходн/.test(lower) ? "График" : /руковод|директор|админ|начальн/.test(lower) ? "Руководитель" : /коллектив|коллег|конфликт/.test(lower) ? "Коллектив" : /обуч|объясн|не знаю|инструкц/.test(lower) ? "Обучение" : /нагруз|не успеваю|много задач/.test(lower) ? "Нагрузка" : /ценник|товар|поставк|оборудован|расходник/.test(lower) ? "Рабочие процессы" : "Другое";
    const attention = answer.question_code === "anonymous_problem" || NEGATIVE_WORDS.some((word) => lower.includes(word)) ? "Да" : "Нет";
    return { createdAt: toDate(answer.created_at), sessionAnonId: anonSessionId(answer.session_id), employeeGroup: session?.employee_group ?? "", employeeRole: session?.employee_role ?? "", tenure: session?.tenure ?? "", storeOrDepartment: session?.store_or_department ?? "", type: answer.question_code === "anonymous_problem" ? "Анонимная проблема" : answer.question_code === "keep_good" ? "Что сохранить" : "Что улучшить", question: answer.question_text, comment: text, topic, attention };
  });
}

function sheetFromRows(workbook: XLSX.WorkBook, name: string, rows: SheetRow[], widths: number[] = []) {
  const safeRows = rows.length ? rows : [{ "Нет данных": "" }];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  if (widths.length) sheet["!cols"] = widths.map((wch) => ({ wch }));
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  (sheet as XLSX.WorkSheet & { "!freeze"?: unknown })["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function sheetFromAoa(workbook: XLSX.WorkBook, name: string, rows: Array<Array<string | number>>, widths: number[] = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.length ? rows : [["Нет данных"]]);
  if (widths.length) sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function sessionAverage(sessionIds: Set<string>, answers: Answer[]) {
  const scores = answers.filter((answer) => sessionIds.has(answer.session_id)).map((answer) => toNumber(answer.answer_number)).filter((value): value is number => value !== null);
  return scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}

function sliceRows(name: string, sessions: Session[], answers: Answer[], selector: (session: Session) => string | null): SheetRow[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions.filter((item) => item.completed)) {
    const key = selector(session)?.trim() || "Не указано";
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.entries()].map(([group, items]) => {
    const ids = new Set(items.map((item) => item.id));
    const average = sessionAverage(ids, answers);
    return { "Срез": name, "Группа": group, "Анкет завершено": items.length, "Средний балл": average ?? "", "Комментарий": items.length < 3 ? "мало ответов" : "" };
  });
}

async function loadData(surveyId: string) {
  await ensureSchema();
  const sql = getSql();
  const surveys = await sql`SELECT id,title,description,status FROM hr_surveys WHERE id=${surveyId}` as Survey[];
  const survey = surveys[0];
  if (!survey) throw new Error("Опрос не найден");
  const questions = await sql`SELECT id,survey_id,position,code,text,category,type,options,required,max_choices FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as Question[];
  const sessions = await sql`SELECT id,survey_id,employee_group,employee_role,tenure,store_or_department,completed,current_question_position,started_at,completed_at,attempt_no FROM hr_survey_sessions WHERE survey_id=${surveyId} ORDER BY started_at` as Session[];
  const answers = await sql`SELECT id,session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json,created_at FROM hr_survey_answers WHERE survey_id=${surveyId} ORDER BY created_at,id` as Answer[];
  return { survey, questions, sessions, answers };
}

export async function buildSurveyWorkbook(surveyId: string): Promise<Buffer> {
  const data = await loadData(surveyId);
  const sessionsById = new Map(data.sessions.map((session) => [session.id, session]));
  const completed = data.sessions.filter((session) => session.completed).length;
  const started = data.sessions.length;
  const qStats = questionStats(data.questions, data.answers);
  const cStats = categoryStats(qStats);
  const pStats = problemStats(data.answers, completed);
  const cRows = comments(data.answers, sessionsById);
  const average = sessionAverage(new Set(data.sessions.map((session) => session.id)), data.answers);
  const enpsResult = enps(data.answers);
  const wb = XLSX.utils.book_new();

  sheetFromAoa(wb, "Панель HR", [
    ["Панель HR", ""],
    ["Название опроса", data.survey.title],
    ["Статус", data.survey.status],
    ["Дата выгрузки", new Date().toISOString()],
    ["Анкет начато", started],
    ["Анкет завершено", completed],
    ["Процент завершения", started ? pct(completed / started) : "0%"],
    ["Средний балл", average ?? "Недостаточно данных"],
    ["eNPS", enpsResult.score],
    ["Красных зон", cStats.filter((item) => item.zone === "red").length],
    ["Жёлтых зон", cStats.filter((item) => item.zone === "yellow").length],
    ["Открытых комментариев", cRows.length],
    ["Общий вывод", average == null ? "Пока нет числовых ответов." : average < 3.2 ? "Общая удовлетворенность в красной зоне. Нужен разбор причин." : average <= 3.8 ? "Есть зоны напряжения. Нужно разобрать слабые вопросы." : "Общая оценка нормальная, проверьте локальные проблемы и комментарии."],
    ["", ""],
    ["Топ проблем", "Количество / доля"],
    ...pStats.slice(0, 5).map((item) => [item.option, `${item.count} / ${pct(item.share)} / ${zoneText(item.zone)}`]),
    ["", ""],
    ["Самые слабые вопросы", "Средний балл / зона"],
    ...qStats.filter((item) => item.average != null).sort((a, b) => (a.average ?? 99) - (b.average ?? 99)).slice(0, 10).map((item) => [item.question, `${item.average} / ${zoneText(item.zone)}`])
  ], [34, 95]);

  sheetFromRows(wb, "Красные зоны", [
    ...qStats.filter((item) => item.type === "scale_1_5" && item.zone !== "normal").map((item, index) => ({ "Приоритет": item.zone === "red" ? `P1-${index + 1}` : `P2-${index + 1}`, "Зона": zoneText(item.zone), "Тип проблемы": "низкая оценка", "Категория": item.categoryLabel, "Вопрос или проблема": item.question, "Средний балл": item.average ?? "", "Низкие оценки 1-2, %": pct(item.lowShare), "Количество ответов": item.count, "Что это может значить": conclusion(item.zone), "Рекомендуемое действие": CATEGORY_INFO[item.category]?.action ?? "Разобрать вручную", "Ответственный": "", "Статус": "Новая", "Комментарий HR": "" })),
    ...pStats.filter((item) => item.zone !== "normal").map((item, index) => ({ "Приоритет": item.zone === "red" ? `P1-problem-${index + 1}` : `P2-problem-${index + 1}`, "Зона": zoneText(item.zone), "Тип проблемы": "частый выбор", "Категория": "Что мешает / что улучшить", "Вопрос или проблема": item.option, "Средний балл": "", "Низкие оценки 1-2, %": "", "Количество ответов": item.count, "Что это может значить": item.check, "Рекомендуемое действие": item.action, "Ответственный": "", "Статус": "Новая", "Комментарий HR": "" }))
  ], [12, 14, 18, 24, 50, 14, 18, 18, 42, 42, 18, 16, 28]);

  sheetFromRows(wb, "Вопросы", qStats.map((item) => ({ "№": item.position, "Код вопроса": item.code, "Категория": item.category, "Категория по-русски": item.categoryLabel, "Вопрос": item.question, "Тип вопроса": item.type, "Количество ответов": item.count, "Средний балл": item.average ?? "", "Оценок 1": item.counts[1], "Оценок 2": item.counts[2], "Оценок 3": item.counts[3], "Оценок 4": item.counts[4], "Оценок 5": item.counts[5], "% низких оценок 1-2": item.type === "scale_1_5" ? pct(item.lowShare) : "", "% нейтральных оценок 3": item.type === "scale_1_5" ? pct(item.neutralShare) : "", "% высоких оценок 4-5": item.type === "scale_1_5" ? pct(item.highShare) : "", "Зона": item.type === "scale_1_5" ? zoneText(item.zone) : "", "Вывод": item.type === "scale_1_5" ? conclusion(item.zone) : "Нечисловой вопрос", "Рекомендуемое действие": CATEGORY_INFO[item.category]?.action ?? "Разобрать вручную" })), [8, 14, 18, 24, 65, 16, 16, 14, 10, 10, 10, 10, 10, 18, 18, 18, 14, 44, 44]);

  sheetFromRows(wb, "Категории", cStats.map((item) => ({ "Категория": item.category, "Название по-русски": item.label, "Средний балл": item.average ?? "", "Количество ответов": item.count, "% низких оценок 1-2": pct(item.lowShare), "Зона": zoneText(item.zone), "Что означает": item.meaning, "Что делать": item.action })), [20, 28, 14, 18, 18, 14, 48, 48]);

  sheetFromRows(wb, "Проблемы", pStats.map((item, index) => ({ "Вопрос": item.question, "Вариант ответа": item.option, "Количество выборов": item.count, "Доля от завершённых анкет": pct(item.share), "Зона": zoneText(item.zone), "Приоритет": item.zone === "red" ? `P1-${index + 1}` : item.zone === "yellow" ? `P2-${index + 1}` : `P3-${index + 1}`, "Что проверить": item.check, "Рекомендуемое действие": item.action })), [55, 34, 18, 24, 14, 14, 52, 52]);

  sheetFromRows(wb, "Комментарии HR", cRows.map((item) => ({ "Дата": item.createdAt, "ID анкеты, обезличенный": item.sessionAnonId, "Группа сотрудника": item.employeeGroup, "Роль": item.employeeRole, "Стаж": item.tenure, "Магазин или отдел": item.storeOrDepartment, "Тип комментария": item.type, "Вопрос": item.question, "Комментарий": item.comment, "Потенциальная тема": item.topic, "Требует внимания": item.attention, "Комментарий HR": "" })), [22, 18, 18, 20, 18, 24, 20, 55, 70, 24, 18, 30]);

  sheetFromRows(wb, "Срезы", [
    ...sliceRows("По месту работы", data.sessions, data.answers, (session) => session.employee_group),
    ...sliceRows("По роли", data.sessions, data.answers, (session) => session.employee_role),
    ...sliceRows("По стажу", data.sessions, data.answers, (session) => session.tenure),
    ...sliceRows("По магазину/отделу", data.sessions, data.answers, (session) => session.store_or_department)
  ], [22, 30, 18, 14, 24]);

  const answersBySession = new Map<string, Map<string, Answer>>();
  for (const answer of data.answers) {
    const map = answersBySession.get(answer.session_id) ?? new Map<string, Answer>();
    map.set(answer.question_code, answer);
    answersBySession.set(answer.session_id, map);
  }
  sheetFromRows(wb, "Анкеты", data.sessions.map((session) => {
    const row: SheetRow = { "ID анкеты, обезличенный": anonSessionId(session.id), "Попытка": session.attempt_no ?? "", "Дата начала": toDate(session.started_at), "Дата завершения": toDate(session.completed_at), "Группа сотрудника": session.employee_group ?? "", "Роль": session.employee_role ?? "", "Стаж": session.tenure ?? "", "Магазин или отдел": session.store_or_department ?? "", "Завершена": session.completed ? "да" : "нет" };
    const map = answersBySession.get(session.id) ?? new Map<string, Answer>();
    for (const question of data.questions) row[`${question.code}: ${question.text.slice(0, 36)}`] = displayAnswer(map.get(question.code));
    return row;
  }), [18, 10, 22, 22, 18, 18, 18, 24, 12, ...data.questions.map(() => 26)]);

  sheetFromRows(wb, "Сырые данные", data.answers.map((answer) => {
    const session = sessionsById.get(answer.session_id);
    return { "Дата ответа": toDate(answer.created_at), "ID анкеты, обезличенный": anonSessionId(answer.session_id), "Попытка": session?.attempt_no ?? "", "Группа сотрудника": session?.employee_group ?? "", "Роль": session?.employee_role ?? "", "Стаж": session?.tenure ?? "", "Магазин или отдел": session?.store_or_department ?? "", "Категория": categoryLabel(answer.category), "Код вопроса": answer.question_code, "Вопрос": answer.question_text, "Ответ": displayAnswer(answer), "Числовой балл": toNumber(answer.answer_number) ?? "" };
  }), [22, 18, 10, 18, 18, 18, 24, 24, 16, 65, 45, 14]);

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
