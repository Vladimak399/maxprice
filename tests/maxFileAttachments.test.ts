import { describe, expect, it } from "vitest";
import { extractMaxFiles } from "../src/max/fileAttachments";

describe("extractMaxFiles", () => {
  it("extracts MAX file attachments", () => {
    const files = extractMaxFiles({
      update_type: "message_created",
      message: {
        body: {
          attachments: [{
            type: "file",
            payload: { url: "https://cdn.max.ru/reports/fact.xlsx", token: "token-1" },
            filename: "факт 08.08.xlsx",
            size: 12345
          }]
        }
      }
    });

    expect(files).toEqual([{
      url: "https://cdn.max.ru/reports/fact.xlsx",
      token: "token-1",
      filename: "факт 08.08.xlsx",
      size: 12345
    }]);
  });
});
