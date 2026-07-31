import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminSessionAuthorized } from "../admin/session";
import { isDatabaseConfigured } from "../knowledge/db";
import { getUnorderedGoodsStats } from "../unorderedGoods/repository";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!isAdminSessionAuthorized(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isDatabaseConfigured()) { res.status(503).json({ error: "База данных не подключена", code: "DATABASE_NOT_CONFIGURED" }); return; }
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
  try { res.status(200).json(await getUnorderedGoodsStats()); }
  catch (error) { console.error("Failed to load unordered goods stats", error); res.status(500).json({ error: "Не удалось загрузить статистику" }); }
}
