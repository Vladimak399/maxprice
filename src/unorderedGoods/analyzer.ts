import { analyzeUnorderedGoodsScreenshot } from "./ocr";
import { analyzeWithOpenRouter } from "./openrouter";
import type { UnorderedGoodsAnalysis } from "./types";

export async function analyzeScreenshot(image: Buffer): Promise<UnorderedGoodsAnalysis> {
  let visionError: unknown = null;
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try { return await analyzeWithOpenRouter(image); }
    catch (error) { visionError = error; console.warn("OpenRouter vision failed; falling back to local OCR", { message: error instanceof Error ? error.message : String(error) }); }
  }
  try { return await analyzeUnorderedGoodsScreenshot(image); }
  catch (localError) {
    if (!visionError) throw localError;
    const visionMessage = visionError instanceof Error ? visionError.message : String(visionError);
    const localMessage = localError instanceof Error ? localError.message : String(localError);
    throw new Error(`Оба способа распознавания завершились ошибкой. OpenRouter: ${visionMessage}. Локальный OCR: ${localMessage}`);
  }
}
