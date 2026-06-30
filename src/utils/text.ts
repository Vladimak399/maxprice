export function chunkText(text: string, maxLength = 3900): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const cutAt = remaining.lastIndexOf("\n\n", maxLength);
    const safeCutAt = cutAt > maxLength * 0.5 ? cutAt : maxLength;
    chunks.push(remaining.slice(0, safeCutAt).trim());
    remaining = remaining.slice(safeCutAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
