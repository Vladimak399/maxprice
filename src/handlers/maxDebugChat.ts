import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatConfig } from "../config/chats";
import { extractMaxUpdate } from "../max/updateExtractor";
import { parsePriceMessage } from "../parser/priceParser";
import { formatReport } from "../parser/reportFormatter";
import type { MaxUpdate } from "../types/max";
import { isAdminAuthorized } from "../utils/auth";

function readUpdate(req: VercelRequest): MaxUpdate {
  const body = typeof req.body === "string" ? JSON.parse(req.body) as Record<string, unknown> : (req.body ?? {}) as Record<string, unknown>;
  return (body.update ?? body) as MaxUpdate;
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAdminAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const update = readUpdate(req);
    const extracted = extractMaxUpdate(update);
    const chatConfig = getChatConfig(extracted.chatId);
    const parseResult = parsePriceMessage(extracted.text);
    const report = formatReport(parseResult);

    res.status(200).json({
      extracted,
      chatConfig,
      parseResult,
      report
    });
  } catch (error) {
    console.error("Debug endpoint error", error);
    res.status(400).json({ error: "Invalid body" });
  }
}
