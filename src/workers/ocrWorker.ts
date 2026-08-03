import { Worker, Queue, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';
import fetch from 'node-fetch';
import { runTransaction, query } from '../db';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const queueName = 'ocr-jobs';
export const queue = new Queue(queueName, { connection });
new QueueScheduler(queueName, { connection });

// Worker that processes OCR jobs. This is a skeleton — replace model calls with real integrations.
export const worker = new Worker(
  queueName,
  async (job) => {
    const jobId = job.id;
    console.log('Processing OCR job', jobId, job.data);

    // Mark job as processing in DB
    await query('UPDATE ocr_jobs SET status=$1, attempt = attempt + 1, updated_at = now() WHERE id = $2', ['processing', job.data.dbId || jobId]);

    try {
      const input = job.data.input;
      const imageUrl = input?.parsed?.images?.[0];
      if (!imageUrl) throw new Error('no image url');

      // Download image with no-auto-redirects
      const resp = await fetch(imageUrl, { redirect: 'manual', timeout: 15000 });
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        throw new Error('redirects not allowed; got location=' + location);
      }
      if (!resp.ok) throw new Error('failed to download image status=' + resp.status);

      const buffer = await resp.arrayBuffer();
      const sizeBytes = buffer.byteLength;
      console.log('downloaded image bytes=', sizeBytes);

      // Placeholder: call primary vision model (with timeout) -> fallback -> tesseract
      // Simulate minimal OCR result
      const ocrResult = { text: 'placeholder', rows: [], confidence: 50 };

      // Transactionally insert event + items + outbox entry
      await runTransaction(async (client) => {
        const insertEvent = await client.query('INSERT INTO unordered_goods_events (external_id, chat_id, payload) VALUES ($1,$2,$3) RETURNING id', [input.parsed.externalId, input.parsed.chatId, { source: 'ocr-worker' }]);
        const eventId = insertEvent.rows[0].id;

        // Example: insert items (empty for skeleton)
        // await client.query('INSERT INTO unordered_goods_items (event_id, item_payload) VALUES ($1,$2)', [eventId, { /* item */ }]);

        // Insert outbox notification
        await client.query('INSERT INTO outbox (topic, payload) VALUES ($1,$2)', ['unordered_goods_processed', { eventId, ocrResult }]);

        // Update ocr_jobs result and link event
        await client.query('UPDATE ocr_jobs SET status=$1, result=$2, event_id=$3, updated_at=now() WHERE external_id=$4', ['completed', ocrResult, eventId, input.parsed.externalId]);
      });

      return { success: true };
    } catch (err: any) {
      console.error('worker error', err);
      // mark job as failed
      try {
        await query('UPDATE ocr_jobs SET status=$1, failed_reason=$2, updated_at=now() WHERE external_id=$3', ['failed', String(err?.message || err), job.data.input?.parsed?.externalId]);
      } catch (e) {
        console.error('failed to update job status', e);
      }
      // Rethrow to let BullMQ handle retries/backoff as configured
      throw err;
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log('job completed', job.id);
});
worker.on('failed', (job, err) => {
  console.warn('job failed', job?.id, err?.message);
});
