import { analyzeUnorderedGoodsScreenshot } from "./ocr";
import { analyzeWithOpenRouter } from "./openrouter";
import type { UnorderedGoodsAnalysis } from "./types";

export async function analyzeScreenshot(image: Buffer): Promise<UnorderedGoodsAnalysis> {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try { return await analyzeWithOpenRouter(image); }
    catch (error) { console.warn("OpenRouter vision failed; falling back to local OCR", { message: error instanceof Error ? error.message : String(error) }); }
  }
  return analyzeUnorderedGoodsScreenshot(image);
}
