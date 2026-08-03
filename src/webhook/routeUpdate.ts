import { parseUpdate } from './parseUpdate';
import { query } from '../db';

// Minimal Express-compatible handler factory
export function createWebhookHandler() {
  return async function handleWebhook(req: any, res: any) {
    try {
      const update = req.body;
      const parsed = parseUpdate(update);

      // Basic validation
      if (!parsed.externalId) return res.status(400).json({ ok: false, error: 'missing external id' });
      if (!parsed.images || parsed.images.length === 0) {
        // For non-image routes, you might route elsewhere; here we persist a lightweight event
        await query('INSERT INTO unordered_goods_events (external_id, chat_id, payload) VALUES ($1,$2,$3) ON CONFLICT (external_id) DO NOTHING', [parsed.externalId, parsed.chatId, update]);
        return res.status(200).json({ ok: true, message: 'no images; event persisted' });
      }

      // Create a job record for async processing. idempotent by external_id
      const now = new Date().toISOString();
      const insertSql = `INSERT INTO ocr_jobs (external_id, input, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id`;

      const result = await query(insertSql, [parsed.externalId, { update, parsed }, now]);

      // If no row returned, job already exists. Return 200 with info.
      if (result.rows.length === 0) {
        return res.status(200).json({ ok: true, message: 'job already exists' });
      }

      // Fast 200 — job created, worker will pick it up
      return res.status(200).json({ ok: true, message: 'job queued' });
    } catch (err: any) {
      console.error('webhook handler error', err);
      // Important: when job couldn't be persisted due to server/db error — return 5xx
      return res.status(500).json({ ok: false, error: 'internal server error' });
    }
  };
}
