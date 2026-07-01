import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parsePriceMessage } from "../parser/priceParser";
import { formatReport } from "../parser/reportFormatter";
import { isAdminAuthorized } from "../utils/auth";

type TestParseBody = {
  text?: string;
};

function readBody(req: VercelRequest): TestParseBody {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as TestParseBody;
    } catch {
      return {};
    }
  }

  return (req.body ?? {}) as TestParseBody;
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

  const body = readBody(req);
  const text = body.text ?? "";

  const result = parsePriceMessage(text);
  const report = formatReport(result);

  res.status(200).json({
    growthItems: result.growthItems,
    zeroPriceItems: result.zeroPriceItems,
    report
  });
}
