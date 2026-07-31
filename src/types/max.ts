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
  type: "message" | "link";
  text: string;
  url?: string;
};

export type MaxAttachment =
  | { type: "inline_keyboard"; payload: { buttons: MaxMessageButton[][] } }
  | { type: "image"; payload: { url: string } };

export type RegisterWebhookBody = {
  url?: string;
  updateTypes?: string[];
};
