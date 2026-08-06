import { describe, expect, it } from "vitest";
import { buildForecastFileDedupeKey } from "../src/forecast/uploadJobRepository";

const base = {
  sourceUserId: "user-1",
  sourceChatId: "chat-1",
  messageId: "message-1",
  fileUrl: "https://cdn.max.ru/report.xlsx?token=abc",
  filename: "продажи с анализом 08.xlsx"
};

describe("forecast file webhook deduplication", () => {
  it("returns the same key for repeated delivery of one MAX message", () => {
    expect(buildForecastFileDedupeKey(base)).toBe(buildForecastFileDedupeKey({ ...base }));
  });

  it("allows a manually resent file with a new message id", () => {
    expect(buildForecastFileDedupeKey(base)).not.toBe(buildForecastFileDedupeKey({
      ...base,
      messageId: "message-2"
    }));
  });

  it("uses the file URL when MAX does not provide a message id", () => {
    const withoutMessageId = { ...base, messageId: null };
    expect(buildForecastFileDedupeKey(withoutMessageId)).toBe(buildForecastFileDedupeKey({
      ...withoutMessageId
    }));
    expect(buildForecastFileDedupeKey(withoutMessageId)).not.toBe(buildForecastFileDedupeKey({
      ...withoutMessageId,
      fileUrl: "https://cdn.max.ru/report.xlsx?token=other"
    }));
  });
});
