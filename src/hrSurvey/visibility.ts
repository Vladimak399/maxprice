import type { HrSurveyQuestion } from "./types";

export function questionBranch(question: HrSurveyQuestion): "Магазин" | "Офис" | "Склад" | null {
  if (question.code.startsWith("store_")) return "Магазин";
  if (question.code.startsWith("office_")) return "Офис";
  if (question.code.startsWith("warehouse_")) return "Склад";
  return null;
}

export function isVisibleQuestion(question: HrSurveyQuestion, session: { employee_group?: string | null }): boolean {
  const branch = questionBranch(question);
  return !branch || session.employee_group === branch;
}

export function visibleQuestions(questions: HrSurveyQuestion[], session: { employee_group?: string | null }): HrSurveyQuestion[] {
  return questions.filter((question) => isVisibleQuestion(question, session));
}
