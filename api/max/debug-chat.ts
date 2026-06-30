import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getChatConfig } from "../../src/config/chats.js";
import { extractMaxUpdate } from "../../src/max/updateExtractor.js";
import { parsePriceMessage } from "../../src/parser/priceParser.js";
import { formatReport } from "../../src/parser/reportFormatter.js";
import type { MaxUpdate } from "../../src/types/max.js";
import { isAdminAuthorized } from "../../src/utils/auth.js";

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
