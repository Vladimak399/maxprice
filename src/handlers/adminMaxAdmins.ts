import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminSessionAuthorized } from "../admin/session";
import { isDatabaseConfigured } from "../knowledge/db";
import { listMaxAdmins, upsertMaxAdmin } from "../hrSurvey/repository";
const authorized=(req:VercelRequest)=>isAdminSessionAuthorized(req)||req.headers.authorization===`Bearer ${process.env.ADMIN_SECRET}`;
export default async function handler(req:VercelRequest,res:VercelResponse):Promise<void>{ if(!authorized(req)){res.status(401).json({error:"Unauthorized"});return;} if(!isDatabaseConfigured()){res.status(503).json({error:"База данных не подключена"});return;} try{ if(req.method==="GET"){res.status(200).json({admins:await listMaxAdmins()});return;} if(req.method==="POST"){ const b=(req.body??{}) as {userId?:string;name?:string}; if(!b.userId?.trim()){res.status(400).json({error:"Укажите userId"});return;} await upsertMaxAdmin(b.userId.trim(), b.name?.trim() || null); res.status(200).json({ok:true});return;} res.status(405).json({error:"Method not allowed"}); }catch(e){console.error("MAX admins API error",e);res.status(500).json({error:"Не удалось выполнить операцию"});}}
