import { afterEach, describe, expect, it } from "vitest";
import { isForecastMessage } from "../src/handlers/forecastAwareMaxWebhook";

function update(chatId: string) {
  return {
    update_type: "message_created",
    message: {
      recipient: { chat_id: chatId },
      sender: { user_id: "user-1" },
      body: { attachments: [{ type: "file", filename: "факт 05.08.xlsx", payload: { url: "https://cdn.max.ru/report.xlsx" } }] }
    }
  };
}

describe("forecast-aware MAX routing", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("accepts forecast files in a private dialog", () => {
    expect(isForecastMessage(update("private-chat"))).toBe(true);
  });

  it("accepts forecast files in the configured notification target chat", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({
      source: {
        name: "Операторы цены",
        mode: "price_changes",
        enabled: true,
        sendTo: "chat",
        targetChatId: "-76455592930602"
      }
    });
    expect(isForecastMessage(update("-76455592930602"))).toBe(true);
  });

  it("does not intercept files from an unrelated group chat", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({
      source: {
        name: "Операторы цены",
        mode: "price_changes",
        enabled: true,
        sendTo: "chat",
        targetChatId: "-76455592930602"
      }
    });
    expect(isForecastMessage(update("-999"))).toBe(false);
  });
});
