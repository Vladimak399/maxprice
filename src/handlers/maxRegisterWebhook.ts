import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registerWebhook } from "../max/client";
import type { RegisterWebhookBody } from "../types/max";
import { isAdminAuthorized } from "../utils/auth";
import { getEnv, requireEnv } from "../utils/env";

function readBody(req: VercelRequest): RegisterWebhookBody {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as RegisterWebhookBody;
    } catch {
      return {};
    }
  }

  return (req.body ?? {}) as RegisterWebhookBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAdminAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = readBody(req);
  const url = body.url ?? getEnv("PUBLIC_WEBHOOK_URL");
  const secret = requireEnv("MAX_WEBHOOK_SECRET");
  const updateTypes = body.updateTypes ?? ["message_created", "bot_started", "bot_added"];

  if (!url) {
    res.status(400).json({ error: "Missing webhook url. Set PUBLIC_WEBHOOK_URL or pass body.url" });
    return;
  }

  try {
    const result = await registerWebhook(url, updateTypes, secret);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error("Failed to register webhook", error);
    res.status(500).json({ ok: false, error: "Failed to register webhook" });
  }
}
