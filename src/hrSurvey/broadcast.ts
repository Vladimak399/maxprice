import { sendMessageToUser } from "../max/client";
import { getQuestions, listKnownBotUsers, setSurveyStatus } from "./repository";

const inviteKeyboard = [{
  type: "inline_keyboard" as const,
  payload: { buttons: [[{ type: "message" as const, text: "Пройти опрос" }]] }
}];

export async function sendSurveyInvite(surveyId: string, title: string): Promise<{ total: number; sent: number; failed: number; errors: string[] }> {
  const users = await listKnownBotUsers();
  const questions = await getQuestions(surveyId);
  await setSurveyStatus(surveyId, "active");
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const text = `HR-опрос: ${title}\n\nПожалуйста, пройдите короткую анонимную анкету. Вопросы будут зависеть от того, где вы работаете: магазин, офис или склад. Обычно это занимает 3-5 минут.\n\nВ базе ${questions.length} вопросов, но вам будут показаны только релевантные.`;
  for (const user of users) {
    try {
      await sendMessageToUser(user.userId, text, { attachments: inviteKeyboard, notify: true });
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${user.userId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return { total: users.length, sent, failed, errors: errors.slice(0, 10) };
}
