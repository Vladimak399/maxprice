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
  attachments?: MaxAttachment[];
};

export type MaxMessageButton = {
  type: "message";
  text: string;
};

export type MaxAttachment = {
  type: "inline_keyboard";
  payload: { buttons: MaxMessageButton[][] };
};

export type MaxMessageLink = {
  type: "forward" | "reply";
  mid: string;
};

export type RegisterWebhookBody = {
  url?: string;
  updateTypes?: string[];
};
