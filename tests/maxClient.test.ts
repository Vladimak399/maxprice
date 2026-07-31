import { afterEach, describe, expect, it } from "vitest";
import { buildSendMessageBody, extractMessageUrl, getMaxAuthHeader } from "../src/max/client";
import type { MaxAttachment } from "../src/types/max";

describe("MAX auth header", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("uses raw token by default", () => {
    delete process.env.MAX_AUTH_SCHEME;
    expect(getMaxAuthHeader("token")).toBe("token");
  });

  it("accepts lower-case bearer auth scheme", () => {
    process.env.MAX_AUTH_SCHEME = "bearer";
    expect(getMaxAuthHeader("token")).toBe("Bearer token");
  });
});

describe("MAX send message body", () => {
  it("does not send unsupported notify field", () => {
    expect(buildSendMessageBody("hello", { notify: true } as never)).toEqual({ text: "hello" });
  });

  it("keeps attachments in the message body", () => {
    const attachments: MaxAttachment[] = [{
      type: "inline_keyboard",
      payload: { buttons: [[{ type: "message", text: "Пройти опрос" }]] }
    }];

    expect(buildSendMessageBody("hello", { attachments, notify: true } as never)).toEqual({
      text: "hello",
      attachments
    });
  });

  it("keeps a native link to the original MAX message", () => {
    expect(buildSendMessageBody("alert", { link: { type: "forward", mid: "message.123" } })).toEqual({
      text: "alert",
      link: { type: "forward", mid: "message.123" }
    });
  });

  it("extracts only trusted MAX message URLs", () => {
    expect(extractMessageUrl({ messages: [{ url: "https://max.ru/jump?chat=1&message=2" }] })).toBe("https://max.ru/jump?chat=1&message=2");
    expect(extractMessageUrl({ messages: [{ url: "https://example.com/fake" }] })).toBeNull();
    expect(extractMessageUrl({ messages: [] })).toBeNull();
  });

  it("supports a link button to the source message", () => {
    const attachments: MaxAttachment[] = [{ type: "inline_keyboard", payload: { buttons: [[{ type: "link", text: "Открыть", url: "https://max.ru/source" }]] } }];
    expect(buildSendMessageBody("source", { attachments })).toEqual({ text: "source", attachments });
  });
});
