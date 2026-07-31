import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectMarkedRows } from "../src/unorderedGoods/imageAnalysis";

function tableSvg(): string {
  const rows = Array.from({ length: 9 }, (_, index) => {
    const y = 333 + index * 19;
    const marked = [0, 4, 8].includes(index);
    return `<rect x="574" y="${y}" width="97" height="19" fill="white"/><rect x="574" y="${y}" width="${marked ? 97 : 49}" height="19" fill="#ff2222"/><text x="585" y="${y + 14}" font-size="12" fill="#111">${index + 1}.000</text>`;
  }).join("");
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="1080" fill="white"/>${rows}<rect x="574" y="333" width="97" height="171" fill="none" stroke="#d00000" stroke-width="2"/></svg>`;
}

describe("unordered goods image analysis", () => {
  it("finds every strongly marked table row", async () => {
    const image = await sharp(Buffer.from(tableSvg())).png().toBuffer();
    const result = await detectMarkedRows(image);
    expect(result?.rowCount).toBe(9);
    expect(result?.markedIndexes).toEqual([0, 4, 8]);
  });
});
