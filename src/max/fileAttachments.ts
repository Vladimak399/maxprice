import type { MaxUpdate } from "../types/max";

type RecordValue = Record<string, unknown>;

export type IncomingMaxFile = {
  url: string;
  token?: string;
  filename: string;
  size?: number;
};

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function extractMaxFiles(update: MaxUpdate): IncomingMaxFile[] {
  const message = record(update.message);
  const body = record(message?.body) ?? record(message?.message) ?? message;
  const candidates = [body?.attachments, message?.attachments, update.attachments];
  const result: IncomingMaxFile[] = [];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const value of candidate) {
      const attachment = record(value);
      if (!attachment || stringValue(attachment.type)?.toLowerCase() !== "file") continue;
      const payload = record(attachment.payload) ?? attachment;
      const url = stringValue(payload.url) ?? stringValue(payload.download_url) ?? stringValue(payload.downloadUrl);
      if (!url || result.some((item) => item.url === url)) continue;
      const filename = stringValue(attachment.filename) ?? stringValue(payload.filename) ?? stringValue(attachment.name) ?? "report.xlsx";
      const token = stringValue(payload.token) ?? undefined;
      const size = numberValue(attachment.size) ?? numberValue(payload.size);
      result.push({ url, token, filename, size });
    }
  }

  return result;
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  return /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export async function downloadMaxFile(urlValue: string, maxBytes = 25 * 1024 * 1024): Promise<Buffer> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) throw new Error("Unsafe MAX file URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`MAX file download failed: ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Файл слишком большой. Максимум 25 МБ.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("Файл слишком большой. Максимум 25 МБ.");
  return bytes;
}
