import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearAdminSession, isAdminSessionAuthorized, setAdminSession, verifyAdminPassword } from "../admin/session";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method === "GET") {
    res.status(200).json({ authenticated: isAdminSessionAuthorized(req) });
    return;
  }

  if (req.method === "DELETE") {
    clearAdminSession(res);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as { password?: unknown };
  if (typeof body.password !== "string" || !verifyAdminPassword(body.password)) {
    res.status(401).json({ error: "Неверный пароль" });
    return;
  }

  setAdminSession(res);
  res.status(200).json({ ok: true });
}
