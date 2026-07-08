import type { ExtractedMaxUpdate, MaxUpdate } from "../types/max";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function getStringAtPath(source: unknown, path: string[]): string | null {
  let current: unknown = source;

  for (const key of path) {
    const record = asRecord(current);
    if (!record || !(key in record)) return null;
    current = record[key];
  }

  if (typeof current === "string" && current.trim()) return current.trim();
  if (typeof current === "number") return String(current);
  return null;
}

export function extractMaxUpdate(update: MaxUpdate): ExtractedMaxUpdate {
  const updateType =
    getStringAtPath(update, ["update_type"]) ??
    getStringAtPath(update, ["type"]) ??
    getStringAtPath(update, ["event_type"]);

  const text =
    getStringAtPath(update, ["message", "body", "text"]) ??
    getStringAtPath(update, ["message", "message", "text"]) ??
    getStringAtPath(update, ["message", "text"]) ??
    getStringAtPath(update, ["body", "text"]) ??
    getStringAtPath(update, ["text"]) ??
    "";

  const chatId =
    getStringAtPath(update, ["chat_id"]) ??
    getStringAtPath(update, ["message", "recipient", "chat_id"]) ??
    getStringAtPath(update, ["message", "recipient", "id"]) ??
    getStringAtPath(update, ["recipient", "chat_id"]) ??
    getStringAtPath(update, ["recipient", "id"]);

  const userId =
    getStringAtPath(update, ["user", "user_id"]) ??
    getStringAtPath(update, ["message", "sender", "user_id"]) ??
    getStringAtPath(update, ["sender", "user_id"]);

  const messageId =
    getStringAtPath(update, ["message", "message_id"]) ??
    getStringAtPath(update, ["message", "body", "mid"]) ??
    getStringAtPath(update, ["message", "message", "mid"]) ??
    getStringAtPath(update, ["message", "id"]) ??
    getStringAtPath(update, ["message_id"]);

  return { updateType, chatId, userId, messageId, text };
}
