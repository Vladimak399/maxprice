import { describe, expect, it } from "vitest";
import { extractMaxUpdate } from "../src/max/updateExtractor";

describe("extractMaxUpdate", () => {
  it("extracts /start from current MAX message_created payload", () => {
    const update = {
      update_type: "message_created",
      message: {
        recipient: { chat_id: 6213, chat_type: "dialog", user_id: 10138 },
        sender: { user_id: 947, name: "Евгений" },
        body: { mid: "mid.1", text: "/start" }
      }
    };

    expect(extractMaxUpdate(update)).toEqual({
      updateType: "message_created",
      chatId: "6213",
      userId: "947",
      messageId: "mid.1",
      text: "/start"
    });
  });

  it("extracts text from legacy MAX message payloads", () => {
    const update = {
      update_type: "message_created",
      message: {
        recipient: { chat_id: 1111, chat_type: "dialog", user_id: 2222 },
        sender: { user_id: 3333 },
        message: { mid: "mid.legacy", text: "/start" }
      }
    };

    expect(extractMaxUpdate(update).text).toBe("/start");
    expect(extractMaxUpdate(update).messageId).toBe("mid.legacy");
  });
});
