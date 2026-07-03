import { describe, expect, it } from "vitest";
import { resolvePrivateMessageRoute } from "../src/handlers/privateRouting";

const context = {
  hasActiveSurvey: false,
  isAdminCommand: false,
  isSurveyExitCommand: false,
  isSurveyCommand: false,
  isMenuCommand: false,
  isKnowledgeMenuCommand: false,
  isProductKnowledgeIntent: false
};

describe("private message routing", () => {
  it("keeps ordinary messages inside an active survey", () => {
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true })).toBe("survey_answer");
  });

  it("blocks knowledge and menu commands while a survey is active", () => {
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true, isKnowledgeMenuCommand: true })).toBe("survey_blocked");
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true, isProductKnowledgeIntent: true })).toBe("survey_blocked");
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true, isMenuCommand: true })).toBe("survey_blocked");
  });

  it("allows explicit exit and continue commands", () => {
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true, isSurveyExitCommand: true })).toBe("survey_exit");
    expect(resolvePrivateMessageRoute({ ...context, hasActiveSurvey: true, isSurveyCommand: true })).toBe("survey_continue");
  });

  it("returns to knowledge routing after the survey is paused", () => {
    expect(resolvePrivateMessageRoute({ ...context, isKnowledgeMenuCommand: true })).toBe("knowledge_menu");
    expect(resolvePrivateMessageRoute({ ...context, isProductKnowledgeIntent: true })).toBe("product_knowledge");
    expect(resolvePrivateMessageRoute(context)).toBe("knowledge");
  });
});
