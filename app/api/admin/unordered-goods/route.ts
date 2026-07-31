import handler from "../../../../src/handlers/adminUnorderedGoods";
import { adaptVercelHandler } from "../../../../src/server/vercelAdapter";

export const dynamic = "force-dynamic";
export const GET = adaptVercelHandler(handler);
