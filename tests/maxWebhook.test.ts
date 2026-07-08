import { afterEach, describe, expect, it } from "vitest";
import { analyzeWebhookUpdate } from "../src/handlers/maxWebhook";

describe("MAX webhook command routing", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("detects commands before price parser in price_changes chats", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({ source: { name: "Операторы цены", mode: "price_changes", enabled: true, sendTo: "chat", targetChatId: "destination" } });
    const result = analyzeWebhookUpdate({ update_type: "message_created", message: { recipient: { chat_id: "source" }, sender: { user_id: "user" }, body: { text: "/start" } } });

    expect(result.reason).toContain("command before price parsing");
    expect(result.chatConfig?.mode).toBe("price_changes");
  });
});
