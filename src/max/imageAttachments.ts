import type { IncomingMaxImage } from "../unorderedGoods/types";
import type { MaxUpdate } from "../types/max";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function imageUrl(payload: RecordValue): string | null {
  const direct = stringValue(payload.url) ?? stringValue(payload.download_url) ?? stringValue(payload.downloadUrl);
  if (direct) return direct;
  const photos = record(payload.photos);
  if (!photos) return null;
  const preferred = ["xxl", "xl", "large", "big", "medium", "small"];
  for (const key of preferred) {
    const value = photos[key];
    const url = stringValue(value) ?? stringValue(record(value)?.url);
    if (url) return url;
  }
  return null;
}

export function extractMaxImages(update: MaxUpdate): IncomingMaxImage[] {
  const message = record(update.message);
  const body = record(message?.body) ?? record(message?.message) ?? message;
  const candidates = [body?.attachments, message?.attachments, update.attachments];
  const result: IncomingMaxImage[] = [];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const value of candidate) {
      const attachment = record(value);
      if (!attachment) continue;
      const type = stringValue(attachment.type)?.toLowerCase();
      if (type !== "image" && type !== "photo") continue;
      const payload = record(attachment.payload) ?? attachment;
      const url = imageUrl(payload);
      if (!url || result.some((item) => item.url === url)) continue;
      const attachmentId = stringValue(payload.id) ?? stringValue(payload.token) ?? stringValue(attachment.id) ?? undefined;
      result.push({ url, attachmentId });
    }
  }
  return result;
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  return /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export async function downloadMaxImage(urlValue: string, maxBytes = 12 * 1024 * 1024): Promise<Buffer> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) throw new Error("Unsafe MAX image URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`MAX image download failed: ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("MAX image is too large");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("MAX image is too large");
  return bytes;
}
