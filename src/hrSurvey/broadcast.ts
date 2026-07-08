import { randomUUID } from "node:crypto";
import { getSql } from "../knowledge/db";
import { sendMessageToUser } from "../max/client";
import { getQuestions, listKnownBotUsers, setSurveyStatus } from "./repository";

const inviteKeyboard = [{
  type: "inline_keyboard" as const,
  payload: { buttons: [[{ type: "message" as const, text: "Пройти опрос" }]] }
}];

export async function sendSurveyInvite(surveyId: string, title: string): Promise<{ campaignId: string; total: number; sent: number; failed: number; errors: string[] }> {
  const sql = getSql();
  const users = await listKnownBotUsers();
  const questions = await getQuestions(surveyId);
  const campaignId = randomUUID();
  await sql`INSERT INTO hr_survey_campaigns (id,survey_id,title,status,total_count,started_at) VALUES (${campaignId},${surveyId},${title},'sending',${users.length},now())`;
  await setSurveyStatus(surveyId, "active");

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const text = `HR-опрос: ${title}\n\nПожалуйста, пройдите короткую анонимную анкету. Вопросы будут зависеть от того, где вы работаете: магазин, офис или склад. Обычно это занимает 3-5 минут.\n\nНажмите кнопку ниже, чтобы начать.`;

  for (const user of users) {
    try {
      await sendMessageToUser(user.userId, text, { attachments: inviteKeyboard });
      sent += 1;
      await sql`INSERT INTO hr_survey_invites (campaign_id,survey_id,user_id,status,error) VALUES (${campaignId},${surveyId},${user.userId},'sent',null) ON CONFLICT (campaign_id,user_id) DO UPDATE SET status='sent', error=null, sent_at=now()`;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push(`${user.userId}: ${message}`);
      await sql`INSERT INTO hr_survey_invites (campaign_id,survey_id,user_id,status,error) VALUES (${campaignId},${surveyId},${user.userId},'failed',${message}) ON CONFLICT (campaign_id,user_id) DO UPDATE SET status='failed', error=EXCLUDED.error, sent_at=now()`;
    }
  }

  await sql`UPDATE hr_survey_campaigns SET status=${failed > 0 && sent === 0 ? "failed" : "finished"}, sent_count=${sent}, failed_count=${failed}, finished_at=now() WHERE id=${campaignId}`;
  return { campaignId, total: users.length, sent, failed, errors: errors.slice(0, 10) };
}

export async function listSurveyCampaigns(surveyId: string) {
  const rows = await getSql()`SELECT id,survey_id,title,status,total_count,sent_count,failed_count,created_at,started_at,finished_at FROM hr_survey_campaigns WHERE survey_id=${surveyId} ORDER BY created_at DESC LIMIT 10` as any[];
  return rows.map((row) => ({
    id: row.id,
    surveyId: row.survey_id,
    title: row.title,
    status: row.status,
    total: Number(row.total_count),
    sent: Number(row.sent_count),
    failed: Number(row.failed_count),
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
  }));
}
