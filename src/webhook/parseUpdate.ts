// Simple parser for incoming update. Keep minimal — normalize to {externalId, chatId, images: string[]}
export function parseUpdate(update: any) {
  // This should be extended to match actual incoming shape
  const externalId = update?.update_id || update?.message?.message_id || update?.id;
  const chatId = update?.message?.chat?.id || update?.chat?.id || 'unknown';
  const images: string[] = [];

  if (update?.message?.photo) {
    // telegram-style array of photo sizes
    const photos = update.message.photo;
    // pick the largest
    const url = photos[photos.length - 1]?.file_url;
    if (url) images.push(url);
  }
  if (update?.message?.entities) {
    // placeholder
  }
  if (update?.images && Array.isArray(update.images)) {
    for (const i of update.images) images.push(i);
  }

  return { externalId: String(externalId), chatId: String(chatId), images };
}
