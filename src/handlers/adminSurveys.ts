import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminSessionAuthorized } from "../admin/session";
import { isDatabaseConfigured, getSql, ensureSchema } from "../knowledge/db";
import { buildSurveyWorkbook } from "../hrSurvey/export";
import { ensureDefaultSurvey, getActiveSurvey, getAnalytics, getSurveyDiagnostics, listSurveys, setSurveyStatus } from "../hrSurvey/repository";

function authorized(req: VercelRequest) { const h = req.headers.authorization; return isAdminSessionAuthorized(req) || h === `Bearer ${process.env.ADMIN_SECRET}`; }
function slugId(value: string) { return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "survey"; }

async function createSurvey(title: string, description: string | null) {
  await ensureSchema();
  const id = `${slugId(title)}-${randomUUID().slice(0, 8)}`;
  await getSql()`INSERT INTO hr_surveys (id,title,description,status,anonymous) VALUES (${id},${title},${description},'draft',true)`;
  return id;
}

async function duplicateSurvey(sourceId: string) {
  await ensureSchema();
  const sql = getSql();
  const surveys = await sql`SELECT * FROM hr_surveys WHERE id=${sourceId}` as any[];
  const source = surveys[0];
  if (!source) throw new Error("Опрос не найден");
  const id = `${sourceId}-copy-${randomUUID().slice(0, 6)}`;
  await sql`INSERT INTO hr_surveys (id,title,description,status,anonymous) VALUES (${id},${`Копия: ${source.title}`},${source.description},'draft',true)`;
  const questions = await sql`SELECT * FROM hr_survey_questions WHERE survey_id=${sourceId} ORDER BY position` as any[];
  for (const q of questions) await sql`INSERT INTO hr_survey_questions (id,survey_id,position,code,text,category,type,options,required,max_choices) VALUES (${randomUUID()},${id},${q.position},${q.code},${q.text},${q.category},${q.type},${JSON.stringify(q.options)}::jsonb,${q.required},${q.max_choices})`;
  return id;
}

async function deleteSurvey(id: string) { await ensureSchema(); await getSql()`DELETE FROM hr_surveys WHERE id=${id}`; }
async function updateSurvey(id: string, title: string, description: string | null) { await ensureSchema(); await getSql()`UPDATE hr_surveys SET title=${title}, description=${description}, updated_at=now() WHERE id=${id}`; }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!authorized(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isDatabaseConfigured()) { res.status(503).json({ error: "База данных не подключена" }); return; }
  try {
    if (req.method === "GET") {
      const exportId = typeof req.query.surveyId === "string" && req.headers["x-survey-export"] === "1" ? req.query.surveyId : null;
      if (exportId) { const buf = await buildSurveyWorkbook(exportId); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="hr-survey-${exportId}.xlsx"`); res.send(buf); return; }
      const surveys = await listSurveys(); const activeSurvey = await getActiveSurvey(); const selected = typeof req.query.surveyId === "string" ? req.query.surveyId : activeSurvey?.id ?? surveys[0]?.id; const analytics = selected ? await getAnalytics(selected) : null; const diagnostics = await getSurveyDiagnostics(); res.status(200).json({ surveys, activeSurvey, selectedSurveyId: selected, analytics, diagnostics }); return;
    }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const body = (req.body ?? {}) as any;
    if (body.action === "survey.ensureDefault") { const id = await ensureDefaultSurvey(); res.status(200).json({ ok: true, id, message: "Дефолтный HR-опрос создан или обновлён без дублей." }); return; }
    if (body.action === "survey.create") { const title = String(body.title ?? "Новый HR-опрос").trim(); const description = String(body.description ?? "").trim() || null; const id = await createSurvey(title, description); res.status(200).json({ ok: true, id }); return; }
    if (body.action === "survey.duplicate" && typeof body.id === "string") { const id = await duplicateSurvey(body.id); res.status(200).json({ ok: true, id }); return; }
    if (body.action === "survey.update" && typeof body.id === "string") { await updateSurvey(body.id, String(body.title ?? "HR-опрос").trim(), String(body.description ?? "").trim() || null); res.status(200).json({ ok: true }); return; }
    if (body.action === "survey.delete" && typeof body.id === "string") { await deleteSurvey(body.id); res.status(200).json({ ok: true }); return; }
    if (["survey.activate", "survey.close", "survey.reopen"].includes(body.action) && typeof body.id === "string") { await setSurveyStatus(body.id, body.action === "survey.activate" ? "active" : body.action === "survey.close" ? "closed" : "draft"); res.status(200).json({ ok: true }); return; }
    res.status(400).json({ error: "Unknown action" });
  } catch (e) { console.error("Surveys admin API error", e); res.status(500).json({ error: e instanceof Error ? e.message : "Не удалось выполнить операцию" }); }
}
