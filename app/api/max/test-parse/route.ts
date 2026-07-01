import handler from "../../../../src/handlers/maxTestParse";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";

export const dynamic = "force-dynamic";
export const POST = adaptVercelHandler(handler);
