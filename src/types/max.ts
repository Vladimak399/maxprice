export type MaxUpdate = Record<string, unknown>;

export type ExtractedMaxUpdate = {
  updateType: string | null;
  chatId: string | null;
  userId: string | null;
  messageId: string | null;
  text: string;
};

export type MaxSendMessageBody = {
  text: string;
  notify?: boolean;
};

export type RegisterWebhookBody = {
  url?: string;
  updateTypes?: string[];
};
