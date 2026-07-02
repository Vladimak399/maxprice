import { NextRequest } from "next/server";
import { buildSurveyWorkbook } from "../../../../../src/hrSurvey/export";
import { isAdminSessionAuthorized } from "../../../../../src/admin/session";
import { isDatabaseConfigured } from "../../../../../src/knowledge/db";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest): Promise<Response> {
  const authorized = isAdminSessionAuthorized({ headers: Object.fromEntries(request.headers.entries()) } as never) || request.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return Response.json({ error: "База данных не подключена" }, { status: 503 });
  const surveyId = request.nextUrl.searchParams.get("surveyId");
  if (!surveyId) return Response.json({ error: "surveyId is required" }, { status: 400 });
  const body = await buildSurveyWorkbook(surveyId);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="hr-survey-${surveyId}.xlsx"` } });
}
