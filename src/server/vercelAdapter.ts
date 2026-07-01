import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { NextRequest } from "next/server";

type Handler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

async function readBody(request: NextRequest): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const text = await request.text();
  if (!text) return undefined;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

export function adaptVercelHandler(handler: Handler) {
  return async function route(request: NextRequest): Promise<Response> {
    let statusCode = 200;
    let responseBody: BodyInit | null = null;
    const responseHeaders = new Headers();
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams.entries());
    const requestHeaders = Object.fromEntries(request.headers.entries());
    const req = { method: request.method, headers: requestHeaders, query, body: await readBody(request) } as unknown as VercelRequest;
    const res = {
      status(code: number) { statusCode = code; return this; },
      setHeader(name: string, value: number | string | readonly string[]) {
        responseHeaders.delete(name);
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
        else responseHeaders.set(name, String(value));
        return this;
      },
      json(value: unknown) {
        responseHeaders.set("Content-Type", "application/json; charset=utf-8");
        responseBody = JSON.stringify(value);
        return this;
      },
      send(value: unknown) { responseBody = typeof value === "string" ? value : JSON.stringify(value); return this; },
      end(value?: unknown) {
        if (value !== undefined) responseBody = typeof value === "string" ? value : JSON.stringify(value);
        return this;
      }
    } as unknown as VercelResponse;
    await handler(req, res);
    return new Response(responseBody, { status: statusCode, headers: responseHeaders });
  };
}
