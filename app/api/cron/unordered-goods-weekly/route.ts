import { NextRequest, NextResponse } from "next/server";
import { getAllChatConfigs } from "../../../../src/config/chats";
import { isDatabaseConfigured } from "../../../../src/knowledge/db";
import { sendMessage } from "../../../../src/max/client";
import { getWeeklyUnorderedGoodsComparison } from "../../../../src/unorderedGoods/repository";
import { formatWeeklyUnorderedGoodsReport, uniqueNotificationTargets } from "../../../../src/unorderedGoods/weeklyReport";
import { getEnv } from "../../../../src/utils/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = getEnv("CRON_SECRET");
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });

  const targets = uniqueNotificationTargets(Object.values(getAllChatConfigs()));
  if (!targets.length) return NextResponse.json({ error: "No notification targets configured" }, { status: 503 });

  const data = await getWeeklyUnorderedGoodsComparison();
  const report = formatWeeklyUnorderedGoodsReport(data);
  const failures: string[] = [];
  let sent = 0;
  for (const target of targets) {
    try {
      await sendMessage(target, report);
      sent += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return NextResponse.json({ ok: failures.length === 0, sent, failed: failures.length, failures }, { status: sent ? 200 : 502 });
}
