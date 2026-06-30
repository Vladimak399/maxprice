import { getEnv } from "../utils/env.js";

export type ChatMode = "price_changes" | "returns" | "warehouse" | "repricing" | "generic";

export type ChatConfig = {
  chatId: string;
  name: string;
  mode: ChatMode;
  enabled: boolean;
  sendTo?: "user" | "chat";
  targetUserId?: string;
  targetChatId?: string;
};

const DEFAULT_CHAT_CONFIGS: Record<string, ChatConfig> = {
  PASTE_PRICE_CHAT_ID_HERE: {
    chatId: "PASTE_PRICE_CHAT_ID_HERE",
    name: "Операторы цены",
    mode: "price_changes",
    enabled: false,
    sendTo: "user"
  },
  PASTE_RETURNS_CHAT_ID_HERE: {
    chatId: "PASTE_RETURNS_CHAT_ID_HERE",
    name: "Возвраты",
    mode: "returns",
    enabled: false,
    sendTo: "user"
  },
  PASTE_WAREHOUSE_CHAT_ID_HERE: {
    chatId: "PASTE_WAREHOUSE_CHAT_ID_HERE",
    name: "РЦ поставки",
    mode: "warehouse",
    enabled: false,
    sendTo: "user"
  }
};

function parseEnvChatConfigs(): Record<string, ChatConfig> {
  const raw = getEnv("CHAT_CONFIGS_JSON");
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, Omit<ChatConfig, "chatId"> & { chatId?: string }>;
    const result: Record<string, ChatConfig> = {};

    for (const [chatId, config] of Object.entries(parsed)) {
      result[chatId] = {
        chatId: config.chatId ?? chatId,
        name: config.name,
        mode: config.mode,
        enabled: Boolean(config.enabled),
        sendTo: config.sendTo,
        targetUserId: config.targetUserId,
        targetChatId: config.targetChatId
      };
    }

    return result;
  } catch (error) {
    console.error("Failed to parse CHAT_CONFIGS_JSON", error);
    return {};
  }
}

export function getAllChatConfigs(): Record<string, ChatConfig> {
  return {
    ...DEFAULT_CHAT_CONFIGS,
    ...parseEnvChatConfigs()
  };
}

export function getChatConfig(chatId: string | null): ChatConfig | null {
  if (!chatId) return null;
  const configs = getAllChatConfigs();
  return configs[chatId] ?? null;
}

export function resolveTarget(config: ChatConfig | null): { userId?: string; chatId?: string } {
  const targetChatId = config?.targetChatId ?? getEnv("TARGET_CHAT_ID");
  const targetUserId = config?.targetUserId ?? getEnv("TARGET_USER_ID");

  if (config?.sendTo === "chat" && targetChatId) return { chatId: targetChatId };
  if (config?.sendTo === "user" && targetUserId) return { userId: targetUserId };
  if (targetChatId) return { chatId: targetChatId };
  if (targetUserId) return { userId: targetUserId };
  return {};
}
