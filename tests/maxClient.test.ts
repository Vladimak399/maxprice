import { afterEach, describe, expect, it } from "vitest";
import { buildSendMessageBody, getMaxAuthHeader } from "../src/max/client";
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
});
