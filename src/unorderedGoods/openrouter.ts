import sharp from "sharp";
import { detectMarkedRows } from "./imageAnalysis";
import type { MarkedTableRow, UnorderedGoodsAnalysis } from "./types";

const DEFAULT_MODEL = "qwen/qwen3.7-flash";

const PROMPT = `Проанализируй подготовленное изображение документа поступления товаров из 1С.
В верхней части находится шапка исходного документа. Ниже отдельно и крупно показаны строки, которые локальный алгоритм нашёл по красной заливке. Проверь КАЖДУЮ из этих увеличенных строк.
В результат включай только: (1) товар отсутствовал в заказе, заказанное количество пустое или 0; (2) фактически поступило больше, чем было заказано. Недопоставку, когда поступило меньше заказа, и равные количества не включай.
Не путай фасовку вида 1/12 с заказанным количеством. Ничего не придумывай. Если поле не читается, верни null.
Для каждой проблемной строки верни номер строки, штрихкод/код, точное название, фактическое количество, заказанное количество и тип: unordered или excess.`;

type VisionRow = { row_number?: number | null; product_code?: string | null; product_name?: string | null; received_quantity?: number | null; ordered_quantity?: number | null; violation_type?: "unordered" | "excess" | null };
type VisionResponse = { counterparty?: string | null; warehouse?: string | null; document_number?: string | null; document_date?: string | null; confidence?: number | null; problem_rows?: VisionRow[] };

function responseSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "unordered_goods_receipt",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          counterparty: { type: ["string", "null"] }, warehouse: { type: ["string", "null"] }, document_number: { type: ["string", "null"] }, document_date: { type: ["string", "null"] }, confidence: { type: ["number", "null"] },
          problem_rows: { type: "array", items: { type: "object", additionalProperties: false, properties: { row_number: { type: ["integer", "null"] }, product_code: { type: ["string", "null"] }, product_name: { type: ["string", "null"] }, received_quantity: { type: ["number", "null"] }, ordered_quantity: { type: ["number", "null"] }, violation_type: { type: ["string", "null"], enum: ["unordered", "excess", null] } }, required: ["row_number", "product_code", "product_name", "received_quantity", "ordered_quantity", "violation_type"] } }
        },
        required: ["counterparty", "warehouse", "document_number", "document_date", "confidence", "problem_rows"]
      }
    }
  };
}

function parseContent(payload: unknown): VisionResponse {
  const record = payload as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = record.choices?.[0]?.message?.content;
  if (typeof content === "string") return JSON.parse(content) as VisionResponse;
  throw new Error("OpenRouter returned no structured content");
}

export function mapVisionResponse(value: VisionResponse): UnorderedGoodsAnalysis {
  const rows = (value.problem_rows ?? []).filter((row) => {
    if (typeof row.ordered_quantity === "number" && typeof row.received_quantity === "number") return row.received_quantity > row.ordered_quantity;
    return row.ordered_quantity === null && (row.violation_type === "unordered" || row.violation_type === "excess");
  });
  const markedRows: MarkedTableRow[] = rows.map((row, index) => ({ visibleIndex: index + 1, sourceRowNumber: row.row_number ?? null, productCode: row.product_code ?? null, productName: row.product_name?.trim() || "Товар не распознан", receivedQuantity: row.received_quantity ?? null, orderedQuantity: row.ordered_quantity ?? null, markerRatio: 1, ocrText: JSON.stringify(row) }));
  return { counterparty: value.counterparty ?? null, warehouse: value.warehouse ?? null, documentNumber: value.document_number ?? null, documentDate: value.document_date ?? null, ocrConfidence: Math.max(0, Math.min(100, value.confidence ?? 85)), visibleRows: markedRows.length, markedRows, rawText: JSON.stringify(value) };
}

async function prepareVisionImage(image: Buffer): Promise<Buffer> {
  const marker = await detectMarkedRows(image);
  if (!marker?.markedIndexes.length) return image;
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 1920;
  const targetWidth = Math.min(2880, Math.round(width * 1.5));
  const parts: Buffer[] = [];
  parts.push(await sharp(image).extract({ left: 0, top: 0, width, height: Math.min(marker.y, metadata.height ?? marker.y) }).resize({ width: targetWidth }).png().toBuffer());
  for (const index of marker.markedIndexes) {
    const top = Math.floor(marker.y + index * marker.height / marker.rowCount);
    const bottom = Math.floor(marker.y + (index + 1) * marker.height / marker.rowCount);
    parts.push(await sharp(image).extract({ left: 0, top, width, height: Math.max(1, bottom - top) }).resize({ width: targetWidth }).extend({ top: 8, bottom: 8, background: "white" }).png().toBuffer());
  }
  const heights = await Promise.all(parts.map(async (part) => (await sharp(part).metadata()).height ?? 1));
  let offset = 0;
  const composites = parts.map((part, index) => { const top = offset; offset += heights[index]!; return { input: part, left: 0, top }; });
  return sharp({ create: { width: targetWidth, height: offset, channels: 3, background: "white" } }).composite(composites).png().toBuffer();
}

export async function analyzeWithOpenRouter(image: Buffer): Promise<UnorderedGoodsAnalysis> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const preparedImage = await prepareVisionImage(image);
  const metadata = await sharp(preparedImage).metadata();
  const mime = metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : "image/jpeg";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": process.env.PUBLIC_WEBHOOK_URL?.trim() ?? "https://maxprice.vercel.app", "X-Title": "maxprice unordered goods" },
    body: JSON.stringify({ model: process.env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_MODEL, temperature: 0, max_tokens: 2500, response_format: responseSchema(), messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${preparedImage.toString("base64")}` } }] }] }),
    signal: AbortSignal.timeout(50_000)
  });
  const payload = await response.json() as unknown;
  if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  return mapVisionResponse(parseContent(payload));
}
