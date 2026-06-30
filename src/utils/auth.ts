import type { VercelRequest } from "@vercel/node";
import { getEnv, requireEnv } from "./env.js";

export function isAdminAuthorized(req: VercelRequest): boolean {
  const adminSecret = requireEnv("ADMIN_SECRET");
  const header = req.headers.authorization;
  return header === `Bearer ${adminSecret}`;
}

export function isWebhookSecretValid(req: VercelRequest): boolean {
  const expectedSecret = requireEnv("MAX_WEBHOOK_SECRET");
  const receivedSecret = req.headers["x-max-bot-api-secret"];

  if (Array.isArray(receivedSecret)) {
    return receivedSecret.includes(expectedSecret);
  }

  return receivedSecret === expectedSecret;
}

export function shouldNotifyUnknownChats(): boolean {
  return getEnv("ADMIN_NOTIFY_UNKNOWN_CHATS")?.toLowerCase() === "true";
}
