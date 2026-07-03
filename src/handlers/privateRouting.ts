export type PrivateMessageRoute =
  | "admin"
  | "survey_exit"
  | "survey_continue"
  | "survey_blocked"
  | "survey_answer"
  | "menu"
  | "knowledge_menu"
  | "product_knowledge"
  | "knowledge";

type PrivateMessageContext = {
  hasActiveSurvey: boolean;
  isAdminCommand: boolean;
  isSurveyExitCommand: boolean;
  isSurveyCommand: boolean;
  isMenuCommand: boolean;
  isKnowledgeMenuCommand: boolean;
  isProductKnowledgeIntent: boolean;
};

export function resolvePrivateMessageRoute(context: PrivateMessageContext): PrivateMessageRoute {
  if (context.isAdminCommand) return "admin";
  if (context.hasActiveSurvey) {
    if (context.isSurveyExitCommand) return "survey_exit";
    if (context.isSurveyCommand) return "survey_continue";
    if (context.isMenuCommand || context.isKnowledgeMenuCommand || context.isProductKnowledgeIntent) return "survey_blocked";
    return "survey_answer";
  }
  if (context.isSurveyExitCommand) return "survey_exit";
  if (context.isSurveyCommand) return "survey_continue";
  if (context.isMenuCommand) return "menu";
  if (context.isKnowledgeMenuCommand) return "knowledge_menu";
  if (context.isProductKnowledgeIntent) return "product_knowledge";
  return "knowledge";
}
