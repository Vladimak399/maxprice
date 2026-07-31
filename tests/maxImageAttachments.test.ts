import { describe, expect, it } from "vitest";
import { extractMaxImages } from "../src/max/imageAttachments";

describe("MAX image attachments", () => {
  it("extracts the largest photo URL from a message without text", () => {
    const images = extractMaxImages({ message: { body: { attachments: [{ type: "image", payload: { id: "photo-1", photos: { small: "https://cdn.max.ru/s.webp", big: { url: "https://cdn.max.ru/b.webp" } } } }] } } });
    expect(images).toEqual([{ url: "https://cdn.max.ru/b.webp", attachmentId: "photo-1" }]);
  });
});
