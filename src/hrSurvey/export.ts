// @ts-nocheck
import { ensureSchema, getSql } from "../knowledge/db";
import { anonSessionId } from "./repository";
import { buildSurveyAnalyticsModel } from "./analytics";
import { buildXlsx, cell, green, red, STYLE, tableSheet, yellow, type Cell, type SheetSpec } from "./xlsxBuilder";

export const FORBIDDEN_EXPORT_COLUMNS = ["user_hash", "chat_hash", "source_chat_id", "user_id", "chat_id", "message_id"];

type Zone = "red" | "yellow" | "normal";

function asDate(value: unknown): string { return value ? new Date(value as string).toLocaleString("ru-RU") : ""; }
function asNumber(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function zoneLabel(zone: Zone): string { return zone === "red" ? "красная" : zone === "yellow" ? "жёлтая" : "нормальная"; }
function zoneCell(value: string | number, zone: Zone): Cell { return zone === "red" ? red(value) : zone === "yellow" ? yellow(value) : green(value); }
function riskZone(value: number | null | undefined): Zone { if (value === null || value === undefined) return "normal"; if (value >= 60) return "red"; if (value >= 35) return "yellow"; return "normal"; }
function scoreZone(value: number | null | undefined): Zone { if (value === null || value === undefined) return "normal"; if (value < 3.2) return "red"; if (value <= 3.8) return "yellow"; return "normal"; }
function answerOptions(value: unknown): string[] { if (Array.isArray(value)) return value.map(String); if (typeof value !== "string") return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function answerText(answer: any): string { if (!answer) return ""; const selected = answerOptions(answer.answer_json); if (selected.length) return selected.join(", "); const score = asNumber(answer.answer_number); return answer.answer_text ?? (score === null ? "" : String(score)); }
function sessionAverage(sessionId: string, answers: any[]): number | null { const values = answers.filter((answer) => answer.session_id === sessionId && answer.answer_number !== null && answer.answer_number !== undefined).map((answer) => Number(answer.answer_number)).filter(Number.isFinite); return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null; }
function reliabilityCell(value: string): Cell { return value === "good" ? green("можно анализировать") : value === "medium" ? yellow("осторожно") : red("мало данных"); }

export async function buildSurveyWorkbook(surveyId: string): Promise<Buffer> {
  await ensureSchema();
  const sql = getSql();
  const surveys = await sql`SELECT id,title,description,status FROM hr_surveys WHERE id=${surveyId}` as any[];
  const survey = surveys[0];
  if (!survey) throw new Error("Опрос не найден");
  const questions = await sql`SELECT id,survey_id,position,code,text,category,type,options,required,max_choices FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as any[];
  const sessions = await sql`SELECT id,survey_id,employee_group,employee_role,tenure,store_or_department,completed,current_question_position,started_at,completed_at,attempt_no FROM hr_survey_sessions WHERE survey_id=${surveyId} ORDER BY started_at` as any[];
  const answers = await sql`SELECT id,session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json,created_at FROM hr_survey_answers WHERE survey_id=${surveyId} ORDER BY created_at,id` as any[];
  const analytics = buildSurveyAnalyticsModel({ questions, sessions, answers });
  const redZones = analytics.categories.filter((item) => item.zone === "red").length;
  const yellowZones = analytics.categories.filter((item) => item.zone === "yellow").length;
  const overviewRows: Cell[][] = [
    [cell(`HR-опрос: ${survey.title}`, STYLE.title), "", "", "", "", "", "", ""],
    [cell(`Статус: ${survey.status} · Выгрузка: ${new Date().toLocaleString("ru-RU")} · Анализ строится по завершённым анкетам.`, STYLE.note), "", "", "", "", "", "", ""],
    [],
    [cell("Начато", STYLE.kpi), cell(analytics.started, STYLE.kpi), cell("Завершено", STYLE.kpi), cell(analytics.completed, STYLE.kpi), cell("Завершение", STYLE.kpi), cell(`${analytics.completionRate}%`, STYLE.kpi), cell("Качество данных", STYLE.kpi), analytics.dataQuality?.enoughForOverall ? green("нормально") : yellow("мало анкет")],
    [cell("Средний балл", STYLE.kpi), zoneCell(analytics.scaleAverage ?? "нет данных", scoreZone(analytics.scaleAverage)), cell("Индекс риска", STYLE.kpi), zoneCell(analytics.riskIndex ?? 0, riskZone(analytics.riskIndex)), cell("eNPS", STYLE.kpi), zoneCell(analytics.enps?.score ?? "нет данных", (analytics.enps?.score ?? 0) < 0 ? "red" : (analytics.enps?.score ?? 0) < 30 ? "yellow" : "normal"), cell("Риск увольнения", STYLE.kpi), zoneCell(`${analytics.turnoverRisk?.shareHigh ?? 0}%`, (analytics.turnoverRisk?.shareHigh ?? 0) >= 20 ? "red" : (analytics.turnoverRisk?.shareHigh ?? 0) >= 10 ? "yellow" : "normal")],
    [cell("Красные зоны", STYLE.kpi), redZones ? red(redZones) : green(0), cell("Жёлтые зоны", STYLE.kpi), yellowZones ? yellow(yellowZones) : green(0), cell("Комментариев", STYLE.kpi), cell(analytics.comments.length, STYLE.kpi), cell("Критичных комментариев", STYLE.kpi), red(analytics.comments.filter((item) => item.urgency === "critical").length)],
    [],
    [cell("Главный вывод", STYLE.section), "", "", "", cell("Первые действия HR", STYLE.section), "", "", ""],
    [zoneCell(analytics.dataQuality?.warning ?? (analytics.riskIndex && analytics.riskIndex >= 60 ? "Высокий риск. Начать с плана действий и комментариев." : analytics.riskIndex && analytics.riskIndex >= 35 ? "Есть зоны напряжения. Нужен разбор слабых категорий." : "Критичных сигналов немного. Проверить локальные проблемы и комментарии."), analytics.dataQuality?.warning ? "yellow" : riskZone(analytics.riskIndex)), "", "", "", cell("1. Открыть лист 02 План действий.\n2. Назначить ответственных по P1.\n3. Проверить комментарии с критичной срочностью.\n4. Сравнить срезы по роли, стажу и магазину.", STYLE.note), "", "", ""],
    [],
    [cell("Топ проблем", STYLE.section), cell("Выборов", STYLE.section), cell("Доля", STYLE.section), cell("Зона", STYLE.section), cell("Слабые оценочные вопросы", STYLE.section), cell("Балл", STYLE.section), cell("Зона", STYLE.section), cell("Что делать", STYLE.section)],
    ...Array.from({ length: Math.max(5, Math.min(10, Math.max(analytics.problems.length, analytics.weakQuestions?.length ?? 0))) }, (_, index) => {
      const problem = analytics.problems[index];
      const weak = analytics.weakQuestions?.[index];
      return [problem?.option ?? "", problem?.count ?? "", problem ? `${problem.share}%` : "", problem ? zoneCell(zoneLabel(problem.zone), problem.zone) : "", weak?.question ?? "", weak?.average ?? "", weak ? zoneCell(zoneLabel(weak.zone), weak.zone) : "", weak?.action ?? ""];
    })
  ];

  const answersBySession = new Map<string, Map<string, any>>();
  for (const answer of answers) { const map = answersBySession.get(answer.session_id) ?? new Map<string, any>(); map.set(answer.question_code, answer); answersBySession.set(answer.session_id, map); }
  const sheets: SheetSpec[] = [
    { name: "01 Обзор HR", columns: [24, 13, 18, 13, 24, 13, 24, 52], rows: overviewRows, merges: ["A1:H1", "A2:H2", "A9:D9", "E9:H9"], freeze: false },
    tableSheet("02 План действий", ["Приоритет", "Зона", "Тип", "Проблема", "Метрика", "Доказательство", "Что сделать", "Где проявляется", "Ответственный", "Срок", "Статус", "Комментарий HR"], (analytics.actionPlan ?? []).map((item) => [item.priority, zoneCell(zoneLabel(item.zone), item.zone), item.type, item.title, item.metric, item.evidence, item.action, item.scope ?? "", item.assignee ?? "", item.dueDate ?? "", item.status ?? "Новая", item.hrComment ?? ""]), [12, 12, 16, 48, 24, 46, 48, 22, 18, 14, 14, 30]),
    tableSheet("03 Риски категорий", ["Категория", "Балл", "Ответов", "Низкие оценки", "Зона", "Что делать"], analytics.categories.map((item) => [item.label ?? item.category, item.average, item.count, `${item.lowShare ?? 0}%`, zoneCell(zoneLabel(item.zone), item.zone), item.action ?? ""]), [28, 10, 10, 14, 12, 56]),
    tableSheet("04 Срезы", ["Срез", "Группа", "Анкет", "Средний балл", "Зона", "Надёжность", "Топ проблема", "Комментариев"], (analytics.slices ?? []).map((item) => [item.slice, item.group, item.count, item.average ?? "", zoneCell(zoneLabel(item.zone), item.zone), reliabilityCell(item.reliability), item.topProblem ?? "", item.comments]), [18, 30, 10, 14, 12, 18, 34, 12]),
    tableSheet("05 Проблемы", ["Проблема", "Выборов", "Доля", "Зона", "Вопрос", "Рекомендуемое действие"], analytics.problems.map((item) => [item.option, item.count, `${item.share}%`, zoneCell(zoneLabel(item.zone), item.zone), item.question, item.action ?? ""]), [36, 10, 10, 12, 48, 56]),
    tableSheet("06 Комментарии", ["Дата", "Анкета", "Группа", "Роль", "Стаж", "Магазин/отдел", "Тема", "Тон", "Срочность", "Комментарий", "Комментарий HR"], analytics.comments.map((item) => [asDate(item.createdAt), item.sessionAnonId, item.employeeGroup ?? "", item.employeeRole ?? "", item.tenure ?? "", item.storeOrDepartment ?? "", item.topic ?? "", item.sentiment ?? "", item.urgency === "critical" ? red("критично") : item.urgency === "attention" ? yellow("внимание") : green("обычно"), item.answer, ""]), [18, 12, 16, 18, 16, 20, 18, 12, 14, 70, 28]),
    tableSheet("07 Анкеты", ["Анкета", "Попытка", "Начало", "Завершение", "Группа", "Роль", "Стаж", "Магазин/отдел", "Статус", "Средний балл", "Риск ухода", "Что мешает", "Что улучшить", "Главный комментарий"], sessions.map((session) => { const map = answersBySession.get(session.id) ?? new Map<string, any>(); const avg = sessionAverage(session.id, answers); const quit = answerText(map.get("quit_risk")); return [anonSessionId(session.id), session.attempt_no ?? "", asDate(session.started_at), asDate(session.completed_at), session.employee_group ?? "", session.employee_role ?? "", session.tenure ?? "", session.store_or_department ?? "", session.completed ? green("завершена") : yellow("в процессе"), avg ?? "", quit.includes("ищу") || quit.includes("думаю") ? red(quit) : quit.includes("Иногда") ? yellow(quit) : green(quit || ""), answerText(map.get("blockers")), answerText(map.get("improvements")), answerText(map.get("one_change"))]; }), [12, 10, 18, 18, 16, 18, 16, 20, 14, 12, 18, 40, 40, 52]),
    tableSheet("99 Детальные ответы", ["Дата", "Анкета", "Попытка", "Группа", "Роль", "Категория", "Код", "Вопрос", "Ответ", "Балл"], answers.map((answer) => { const session = sessions.find((item) => item.id === answer.session_id); return [asDate(answer.created_at), anonSessionId(answer.session_id), session?.attempt_no ?? "", session?.employee_group ?? "", session?.employee_role ?? "", answer.category, answer.question_code, answer.question_text, answerText(answer), asNumber(answer.answer_number) ?? ""]; }), [18, 12, 10, 16, 18, 22, 14, 58, 52, 10])
  ];
  return buildXlsx(sheets);
}
