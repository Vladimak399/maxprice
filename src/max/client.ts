import { Agent, request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";
import { requireEnv } from "../utils/env";
import { chunkText } from "../utils/text";
import type { MaxAttachment } from "../types/max";
import { RUSSIAN_TRUSTED_ROOT_CA } from "./russianTrustedRoot";

const MAX_API_BASE_URL = "https://platform-api2.max.ru";
const maxHttpsAgent = new Agent({ ca: [...rootCertificates, RUSSIAN_TRUSTED_ROOT_CA] });

export class MaxApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`MAX API error ${status}: ${body}`);
  }
}

export function getMaxAuthHeader(token = requireEnv("MAX_BOT_TOKEN")): string {
  return process.env.MAX_AUTH_SCHEME?.trim().toLowerCase() === "bearer" ? `Bearer ${token}` : token;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: getMaxAuthHeader(),
    "Content-Type": "application/json"
  };
}

async function requestMax(path: string, options: RequestInit): Promise<unknown> {
  const body = typeof options.body === "string" ? options.body : undefined;

  return new Promise((resolve, reject) => {
    const request = httpsRequest(`${MAX_API_BASE_URL}${path}`, {
      method: options.method,
      headers: getHeaders(),
      agent: maxHttpsAgent
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = response.statusCode ?? 500;
        if (status < 200 || status >= 300) {
          reject(new MaxApiError(status, text));
          return;
        }
        try {
          resolve(text ? JSON.parse(text) as unknown : null);
        } catch {
          reject(new Error("MAX API returned invalid JSON"));
        }
      });
    });

    request.setTimeout(20_000, () => request.destroy(new Error("MAX API request timed out")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

type SendMessageOptions = { attachments?: MaxAttachment[] };

export function buildSendMessageBody(text: string, options: SendMessageOptions = {}): { text: string; attachments?: MaxAttachment[] } {
  return {
    text,
    ...(options.attachments ? { attachments: options.attachments } : {})
  };
}

export async function sendMessageToUser(userId: string, text: string, options: SendMessageOptions = {}): Promise<void> {
  const chunks = chunkText(text, 3900);
  for (const [index, chunk] of chunks.entries()) {
    await requestMax(`/messages?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      body: JSON.stringify(buildSendMessageBody(chunk, { attachments: index === chunks.length - 1 ? options.attachments : undefined }))
    });
  }
}

export async function sendMessageToChat(chatId: string, text: string, options: SendMessageOptions = {}): Promise<void> {
  const chunks = chunkText(text, 3900);
  for (const [index, chunk] of chunks.entries()) {
    await requestMax(`/messages?chat_id=${encodeURIComponent(chatId)}`, {
      method: "POST",
      body: JSON.stringify(buildSendMessageBody(chunk, { attachments: index === chunks.length - 1 ? options.attachments : undefined }))
    });
  }
}

export async function sendMessage(target: { userId?: string; chatId?: string }, text: string, options: SendMessageOptions = {}): Promise<void> {
  if (target.chatId) {
    await sendMessageToChat(target.chatId, text, options);
    return;
  }

  if (target.userId) {
    await sendMessageToUser(target.userId, text, options);
    return;
  }

  throw new Error("No MAX target userId/chatId configured");
}

export async function registerWebhook(url: string, updateTypes: string[], secret: string): Promise<unknown> {
  return requestMax("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url,
      update_types: updateTypes,
      secret
    })
  });
}
