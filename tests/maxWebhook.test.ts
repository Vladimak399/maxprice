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

  it("routes screenshot-only messages to unordered_goods", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({ source: { name: "Товар без заказа", mode: "unordered_goods", enabled: true, sendTo: "chat", targetChatId: "destination" } });
    const result = analyzeWebhookUpdate({ update_type: "message_created", message: { recipient: { chat_id: "source" }, sender: { user_id: "user" }, body: { mid: "photo.1", attachments: [{ type: "image", payload: { url: "https://cdn.max.ru/photo.webp" } }] } } });
    expect(result.reason).toContain("analyze image attachments");
    expect(result.chatConfig?.mode).toBe("unordered_goods");
  });

  it("routes screenshot-only messages from the existing price_changes chat to OCR", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({ source: { name: "Операторы цены", mode: "price_changes", enabled: true, sendTo: "chat", targetChatId: "destination" } });
    const result = analyzeWebhookUpdate({ update_type: "message_created", message: { recipient: { chat_id: "source" }, sender: { user_id: "user" }, body: { mid: "photo.2", attachments: [{ type: "image", payload: { url: "https://cdn.max.ru/photo.webp" } }] } } });
    expect(result.reason).toContain("price-monitoring chat");
    expect(result.chatConfig?.mode).toBe("price_changes");
  });

  it("routes supply statistics commands from the notification chat", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({ source: { name: "Операторы цены", mode: "price_changes", enabled: true, sendTo: "chat", targetChatId: "destination" } });
    const result = analyzeWebhookUpdate({ update_type: "message_created", message: { recipient: { chat_id: "destination" }, sender: { user_id: "manager" }, body: { text: "поставщики 90" } } });
    expect(result.statsCommandDetected).toBe(true);
    expect(result.targetSourceConfig?.chatId).toBe("source");
    expect(result.reason).toContain("notification chat");
  });

  it("does not route supply statistics commands from the operator chat", () => {
    process.env.CHAT_CONFIGS_JSON = JSON.stringify({ source: { name: "Операторы цены", mode: "price_changes", enabled: true, sendTo: "chat", targetChatId: "destination" } });
    const result = analyzeWebhookUpdate({ update_type: "message_created", message: { recipient: { chat_id: "source" }, sender: { user_id: "operator" }, body: { text: "поставщики 90" } } });
    expect(result.statsCommandDetected).toBe(true);
    expect(result.targetSourceConfig).toBeNull();
    expect(result.reason).not.toContain("notification chat");
  });
});
