import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireEnv } from "../utils/env";

const COOKIE_NAME = "kb_admin";
const SESSION_SECONDS = 12 * 60 * 60;

function signature(value: string): string {
  return createHmac("sha256", requireEnv("ADMIN_SECRET")).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=", 2)).filter(([key, value]) => Boolean(key && value)));
}

export function verifyAdminPassword(value: string): boolean {
  return safeEqual(value, requireEnv("ADMIN_SECRET"));
}

export function setAdminSession(res: VercelResponse): void {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${expires}.${signature(expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
}

export function clearAdminSession(res: VercelResponse): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function isAdminSessionAuthorized(req: VercelRequest): boolean {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const [expires, providedSignature] = token.split(".", 2);
  if (!expires || !providedSignature || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(providedSignature, signature(expires));
}
