import handler from "../../../../src/handlers/adminMaxAdmins";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";
export const dynamic = "force-dynamic";
export const GET = adaptVercelHandler(handler);
export const POST = adaptVercelHandler(handler);
