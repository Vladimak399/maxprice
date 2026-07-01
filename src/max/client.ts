import { requireEnv } from "../utils/env";
import { chunkText } from "../utils/text";
import type { MaxAttachment } from "../types/max";

const MAX_API_BASE_URL = "https://platform-api2.max.ru";

function getHeaders(): HeadersInit {
  return {
    Authorization: requireEnv("MAX_BOT_TOKEN"),
    "Content-Type": "application/json"
  };
}

async function requestMax(path: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(`${MAX_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`MAX API error ${response.status}: ${text}`);
  }

  return data;
}

type SendMessageOptions = { attachments?: MaxAttachment[]; notify?: boolean };

export async function sendMessageToUser(userId: string, text: string, options: SendMessageOptions = {}): Promise<void> {
  const chunks = chunkText(text, 3900);
  for (const [index, chunk] of chunks.entries()) {
    await requestMax(`/messages?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      body: JSON.stringify({ text: chunk, notify: options.notify ?? true, attachments: index === chunks.length - 1 ? options.attachments : undefined })
    });
  }
}

export async function sendMessageToChat(chatId: string, text: string, options: SendMessageOptions = {}): Promise<void> {
  const chunks = chunkText(text, 3900);
  for (const [index, chunk] of chunks.entries()) {
    await requestMax(`/messages?chat_id=${encodeURIComponent(chatId)}`, {
      method: "POST",
      body: JSON.stringify({ text: chunk, notify: options.notify ?? true, attachments: index === chunks.length - 1 ? options.attachments : undefined })
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
