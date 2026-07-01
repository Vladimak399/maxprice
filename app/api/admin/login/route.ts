import handler from "../../../../src/handlers/adminLogin";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";

export const dynamic = "force-dynamic";
export const GET = adaptVercelHandler(handler);
export const POST = adaptVercelHandler(handler);
export const DELETE = adaptVercelHandler(handler);
