import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { isAdminSessionAuthorized } from "../../../../../src/admin/session";
import { ensureSchema, getSql, isDatabaseConfigured } from "../../../../../src/knowledge/db";
import { getQuestions } from "../../../../../src/hrSurvey/repository";

export const dynamic = "force-dynamic";

type QuestionType = "scale_1_5" | "single_choice" | "multi_choice" | "text";

function authorized(request: NextRequest): boolean {
  return isAdminSessionAuthorized({ headers: Object.fromEntries(request.headers.entries()) } as never) || request.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split("\n").map((item) => item.trim()).filter(Boolean);
  return [];
}

async function nextPosition(surveyId: string): Promise<number> {
  const rows = await getSql()`SELECT COALESCE(max(position),0)::int max_position FROM hr_survey_questions WHERE survey_id=${surveyId}` as any[];
  return Number(rows[0]?.max_position ?? 0) + 1;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return Response.json({ error: "База данных не подключена" }, { status: 503 });
  const surveyId = request.nextUrl.searchParams.get("surveyId");
  if (!surveyId) return Response.json({ error: "surveyId is required" }, { status: 400 });
  await ensureSchema();
  const questions = await getQuestions(surveyId);
  return Response.json({ questions });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return Response.json({ error: "База данных не подключена" }, { status: 503 });
  await ensureSchema();
  const body = await request.json() as any;
  const surveyId = String(body.surveyId ?? "").trim();
  const text = String(body.text ?? "").trim();
  const category = String(body.category ?? "custom").trim() || "custom";
  const type = String(body.type ?? "scale_1_5") as QuestionType;
  const code = String(body.code ?? `q_${randomUUID().slice(0, 8)}`).trim();
  if (!surveyId || !text) return Response.json({ error: "surveyId and text are required" }, { status: 400 });
  if (!["scale_1_5", "single_choice", "multi_choice", "text"].includes(type)) return Response.json({ error: "Некорректный тип вопроса" }, { status: 400 });
  const position = Number(body.position) || await nextPosition(surveyId);
  const id = randomUUID();
  const options = normalizeOptions(body.options);
  const required = body.required !== false;
  const maxChoices = type === "multi_choice" ? Number(body.maxChoices ?? 3) : null;
  await getSql()`INSERT INTO hr_survey_questions (id,survey_id,position,code,text,category,type,options,required,max_choices) VALUES (${id},${surveyId},${position},${code},${text},${category},${type},${JSON.stringify(options)}::jsonb,${required},${maxChoices})`;
  return Response.json({ ok: true, id });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return Response.json({ error: "База данных не подключена" }, { status: 503 });
  await ensureSchema();
  const body = await request.json() as any;
  const id = String(body.id ?? "").trim();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const text = String(body.text ?? "").trim();
  const category = String(body.category ?? "custom").trim() || "custom";
  const type = String(body.type ?? "scale_1_5") as QuestionType;
  const code = String(body.code ?? "").trim();
  const position = Number(body.position) || 1;
  const options = normalizeOptions(body.options);
  const required = body.required !== false;
  const maxChoices = type === "multi_choice" ? Number(body.maxChoices ?? 3) : null;
  if (!text || !code) return Response.json({ error: "text and code are required" }, { status: 400 });
  await getSql()`UPDATE hr_survey_questions SET position=${position}, code=${code}, text=${text}, category=${category}, type=${type}, options=${JSON.stringify(options)}::jsonb, required=${required}, max_choices=${maxChoices} WHERE id=${id}`;
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return Response.json({ error: "База данных не подключена" }, { status: 503 });
  await ensureSchema();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await getSql()`DELETE FROM hr_survey_questions WHERE id=${id}`;
  return Response.json({ ok: true });
}
