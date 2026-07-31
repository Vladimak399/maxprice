import { randomUUID } from "node:crypto";
import { ensureSchema, getSql } from "../knowledge/db";
import type { UnorderedGoodsAnalysis } from "./types";

export async function saveUnorderedGoodsEvent(input: { messageId: string | null; sourceChatId: string | null; sourceUserId: string | null; imageUrl: string; result: UnorderedGoodsAnalysis }): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const id = randomUUID();
  const inserted = await sql`INSERT INTO unordered_goods_events (id, message_id, source_chat_id, source_user_id, image_url, counterparty, warehouse, document_number, document_date_text, ocr_confidence, raw_ocr_text)
    VALUES (${id}, ${input.messageId}, ${input.sourceChatId}, ${input.sourceUserId}, ${input.imageUrl}, ${input.result.counterparty}, ${input.result.warehouse}, ${input.result.documentNumber}, ${input.result.documentDate}, ${input.result.ocrConfidence}, ${input.result.rawText})
    ON CONFLICT (message_id, image_url) DO NOTHING RETURNING id` as Array<{ id: string }>;
  if (!inserted[0]) return false;
  for (const row of input.result.markedRows) await sql`INSERT INTO unordered_goods_items (id, event_id, source_row_number, product_code, product_name, received_quantity, ordered_quantity, marker_ratio, ocr_text)
    VALUES (${randomUUID()}, ${id}, ${row.sourceRowNumber}, ${row.productCode}, ${row.productName}, ${row.receivedQuantity}, ${row.orderedQuantity}, ${row.markerRatio}, ${row.ocrText})`;
  return true;
}

export async function getUnorderedGoodsStats(): Promise<unknown> {
  await ensureSchema();
  const sql = getSql();
  const [totals, counterparties, products, recent] = await Promise.all([
    sql`SELECT count(DISTINCT e.id)::int AS events, count(i.id)::int AS items, count(DISTINCT e.counterparty)::int AS counterparties
      FROM unordered_goods_events e LEFT JOIN unordered_goods_items i ON i.event_id=e.id WHERE e.created_at >= now() - interval '30 days'`,
    sql`SELECT COALESCE(e.counterparty,'Не распознан') AS counterparty, count(DISTINCT e.id)::int AS events, count(i.id)::int AS items
      FROM unordered_goods_events e LEFT JOIN unordered_goods_items i ON i.event_id=e.id WHERE e.created_at >= now() - interval '30 days'
      GROUP BY e.counterparty ORDER BY events DESC, items DESC LIMIT 20`,
    sql`SELECT COALESCE(i.product_code,'') AS product_code, i.product_name, count(*)::int AS occurrences
      FROM unordered_goods_items i JOIN unordered_goods_events e ON e.id=i.event_id WHERE e.created_at >= now() - interval '30 days'
      GROUP BY i.product_code,i.product_name ORDER BY occurrences DESC LIMIT 30`,
    sql`SELECT e.id,e.created_at,e.counterparty,e.warehouse,e.document_number,count(i.id)::int AS items
      FROM unordered_goods_events e LEFT JOIN unordered_goods_items i ON i.event_id=e.id
      GROUP BY e.id ORDER BY e.created_at DESC LIMIT 30`
  ]);
  return { periodDays: 30, totals: totals[0] ?? { events: 0, items: 0, counterparties: 0 }, counterparties, products, recent };
}
