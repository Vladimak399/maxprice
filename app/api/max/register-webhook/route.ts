import handler from "../../../../src/handlers/maxRegisterWebhook";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = adaptVercelHandler(handler);
