import { afterEach, describe, expect, it } from "vitest";
import { resolveTarget, type ChatConfig } from "../src/config/chats";

const baseConfig: ChatConfig = { chatId: "source", name: "source", mode: "price_changes", enabled: true, sendTo: "chat" };

describe("resolveTarget", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("prefers per-chat targetChatId over global TARGET_CHAT_ID", () => {
    process.env.TARGET_CHAT_ID = "global-destination";
    expect(resolveTarget({ ...baseConfig, targetChatId: "config-destination" })).toEqual({ chatId: "config-destination" });
  });

  it("falls back to global TARGET_CHAT_ID for chat targets", () => {
    process.env.TARGET_CHAT_ID = "global-destination";
    expect(resolveTarget(baseConfig)).toEqual({ chatId: "global-destination" });
  });
});
