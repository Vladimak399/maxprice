import handler from "../../../../src/handlers/maxDebugChat";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";

export const dynamic = "force-dynamic";
export const POST = adaptVercelHandler(handler);
