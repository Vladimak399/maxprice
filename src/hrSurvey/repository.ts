import { randomUUID, createHash } from "node:crypto";
import { ensureSchema, getSql } from "../knowledge/db";
import { DEFAULT_HR_QUESTIONS, DEFAULT_HR_SURVEY, DEFAULT_HR_SURVEY_ID } from "./defaultSurvey";
import { getSurveyHashSalt } from "./logic";
import { buildSurveyAnalyticsModel } from "./analytics";
import type { HrSurvey, HrSurveyQuestion, SurveyStats } from "./types";

const toSurvey = (r: any): HrSurvey => ({ id: r.id, title: r.title, description: r.description, status: r.status, anonymous: r.anonymous, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString() });
const toQuestion = (r: any): HrSurveyQuestion => ({ id: r.id, surveyId: r.survey_id, position: Number(r.position), code: r.code, text: r.text, category: r.category, type: r.type, options: Array.isArray(r.options) ? r.options : [], required: r.required, maxChoices: r.max_choices === null ? null : Number(r.max_choices) });
export function anonSessionId(sessionId: string): string { return createHash("sha256").update(sessionId).digest("hex").slice(0, 12); }

export async function ensureDefaultSurvey(): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  await sql`INSERT INTO hr_surveys (id,title,description,status,anonymous) VALUES (${DEFAULT_HR_SURVEY.id},${DEFAULT_HR_SURVEY.title},${DEFAULT_HR_SURVEY.description},'draft',true) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, anonymous=true, updated_at=now()`;
  for (const q of DEFAULT_HR_QUESTIONS) await sql`INSERT INTO hr_survey_questions (id,survey_id,position,code,text,category,type,options,required,max_choices) VALUES (${`${DEFAULT_HR_SURVEY_ID}-${q.position}`},${DEFAULT_HR_SURVEY_ID},${q.position},${q.code},${q.text},${q.category},${q.type},${JSON.stringify(q.options)}::jsonb,${q.required},${q.maxChoices}) ON CONFLICT (id) DO UPDATE SET position=EXCLUDED.position, code=EXCLUDED.code, text=EXCLUDED.text, category=EXCLUDED.category, type=EXCLUDED.type, options=EXCLUDED.options, required=EXCLUDED.required, max_choices=EXCLUDED.max_choices`;
  await sql`DELETE FROM hr_survey_questions WHERE survey_id=${DEFAULT_HR_SURVEY_ID} AND position>${DEFAULT_HR_QUESTIONS.length}`;
  return DEFAULT_HR_SURVEY_ID;
}

export async function listSurveys(): Promise<Array<HrSurvey & { stats: SurveyStats; questionCount: number }>> {
  await ensureSchema();
  const rows = await getSql()`SELECT s.*, count(DISTINCT sess.id)::int started, count(DISTINCT sess.id) FILTER (WHERE sess.completed)::int completed, count(DISTINCT q.id)::int question_count FROM hr_surveys s LEFT JOIN hr_survey_sessions sess ON sess.survey_id=s.id LEFT JOIN hr_survey_questions q ON q.survey_id=s.id GROUP BY s.id ORDER BY s.created_at DESC` as any[];
  return rows.map((r) => ({ ...toSurvey(r), stats: { started: Number(r.started), completed: Number(r.completed) }, questionCount: Number(r.question_count) }));
}

export async function getActiveSurvey(): Promise<HrSurvey | null> { await ensureSchema(); const rows = await getSql()`SELECT * FROM hr_surveys WHERE status='active' ORDER BY updated_at DESC LIMIT 1` as any[]; return rows[0] ? toSurvey(rows[0]) : null; }
export async function setSurveyStatus(id: string, status: 'draft' | 'active' | 'closed'): Promise<void> { await ensureSchema(); const sql = getSql(); if (status === 'active') await sql`UPDATE hr_surveys SET status='closed', updated_at=now() WHERE status='active' AND id<>${id}`; await sql`UPDATE hr_surveys SET status=${status}, updated_at=now() WHERE id=${id}`; }
export async function getQuestions(surveyId: string): Promise<HrSurveyQuestion[]> { await ensureSchema(); const rows = await getSql()`SELECT * FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as any[]; return rows.map(toQuestion); }
export async function getQuestion(surveyId: string, position: number): Promise<HrSurveyQuestion | null> { const rows = await getSql()`SELECT * FROM hr_survey_questions WHERE survey_id=${surveyId} AND position=${position}` as any[]; return rows[0] ? toQuestion(rows[0]) : null; }

export async function findOrCreateSession(surveyId: string, userHash: string, chatHash: string | null) {
  await ensureSchema();
  const sql = getSql();
  const openRows = await sql`SELECT * FROM hr_survey_sessions WHERE survey_id=${surveyId} AND user_hash=${userHash} AND completed=false ORDER BY updated_at DESC LIMIT 1` as any[];
  if (openRows[0]) return openRows[0];
  const maxRows = await sql`SELECT COALESCE(max(attempt_no),0)::int attempt FROM hr_survey_sessions WHERE survey_id=${surveyId} AND user_hash=${userHash}` as any[];
  const attemptNo = Number(maxRows[0]?.attempt ?? 0) + 1;
  const id = randomUUID();
  const rows = await sql`INSERT INTO hr_survey_sessions (id,survey_id,user_hash,chat_hash,source_chat_id,attempt_no) VALUES (${id},${surveyId},${userHash},${chatHash},null,${attemptNo}) RETURNING *` as any[];
  return rows[0];
}

export async function findOpenSession(userHash: string) { await ensureSchema(); const rows = await getSql()`SELECT sess.* FROM hr_survey_sessions sess JOIN hr_surveys s ON s.id=sess.survey_id WHERE sess.user_hash=${userHash} AND sess.completed=false AND s.status='active' ORDER BY sess.updated_at DESC LIMIT 1` as any[]; return rows[0] ?? null; }
export async function saveAnswer(session: any, question: HrSurveyQuestion, parsed: any): Promise<void> { const sql = getSql(); await sql`INSERT INTO hr_survey_answers (session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json) VALUES (${session.id},${session.survey_id},${question.id},${question.code},${question.text},${question.category},${parsed.answerText},${parsed.answerNumber},${parsed.answerJson ? JSON.stringify(parsed.answerJson) : null}::jsonb) ON CONFLICT (session_id,question_id) DO UPDATE SET answer_text=EXCLUDED.answer_text, answer_number=EXCLUDED.answer_number, answer_json=EXCLUDED.answer_json, created_at=now()`; const next = question.position + 1; if (parsed.profileField === 'employeeGroup') await sql`UPDATE hr_survey_sessions SET current_question_position=${next}, employee_group=${parsed.profileValue}, updated_at=now() WHERE id=${session.id}`; else if (parsed.profileField === 'employeeRole') await sql`UPDATE hr_survey_sessions SET current_question_position=${next}, employee_role=${parsed.profileValue}, updated_at=now() WHERE id=${session.id}`; else if (parsed.profileField === 'tenure') await sql`UPDATE hr_survey_sessions SET current_question_position=${next}, tenure=${parsed.profileValue}, updated_at=now() WHERE id=${session.id}`; else if (parsed.profileField === 'storeOrDepartment') await sql`UPDATE hr_survey_sessions SET current_question_position=${next}, store_or_department=${parsed.profileValue}, updated_at=now() WHERE id=${session.id}`; else await sql`UPDATE hr_survey_sessions SET current_question_position=${next}, updated_at=now() WHERE id=${session.id}`; }
export async function completeSession(sessionId: string): Promise<void> { await getSql()`UPDATE hr_survey_sessions SET completed=true, completed_at=now(), updated_at=now() WHERE id=${sessionId}`; }

export async function getAnalytics(surveyId: string) {
  await ensureSchema();
  const sql = getSql();
  const questions = await sql`SELECT id,survey_id,position,code,text,category,type,options,required,max_choices FROM hr_survey_questions WHERE survey_id=${surveyId} ORDER BY position` as any[];
  const sessions = await sql`SELECT id,survey_id,employee_group,employee_role,tenure,store_or_department,completed,current_question_position,started_at,completed_at,attempt_no FROM hr_survey_sessions WHERE survey_id=${surveyId} ORDER BY started_at` as any[];
  const answers = await sql`SELECT id,session_id,survey_id,question_id,question_code,question_text,category,answer_text,answer_number,answer_json,created_at FROM hr_survey_answers WHERE survey_id=${surveyId} ORDER BY created_at,id` as any[];
  return buildSurveyAnalyticsModel({ questions, sessions, answers });
}

export async function listMaxAdmins() { await ensureSchema(); return await getSql()`SELECT id,user_id,name,active,created_at FROM max_admin_users ORDER BY created_at DESC`; }
export async function upsertMaxAdmin(userId: string, name: string | null) { await ensureSchema(); await getSql()`INSERT INTO max_admin_users (user_id,name,active) VALUES (${userId},${name},true) ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, active=true`; }
export async function isMaxAdmin(userId: string) { await ensureSchema(); const rows = await getSql()`SELECT 1 FROM max_admin_users WHERE user_id=${userId} AND active=true LIMIT 1` as any[]; return Boolean(rows[0]); }
export async function getSurveyDiagnostics() { await ensureSchema(); const active = await getActiveSurvey(); const surveys = await listSurveys(); const activeQuestionCount = active ? (await getQuestions(active.id)).length : 0; return { databaseConfigured: true, defaultSurveyCreated: surveys.some((s) => s.id === DEFAULT_HR_SURVEY_ID), activeSurveyId: active?.id ?? null, activeQuestionCount, surveyHashSaltConfigured: Boolean(getSurveyHashSalt()), adminBaseUrlConfigured: Boolean(process.env.ADMIN_BASE_URL?.trim()), defaultQuestionCount: DEFAULT_HR_QUESTIONS.length }; }
