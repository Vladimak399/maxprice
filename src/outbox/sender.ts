import { query } from '../db';

// Simple sender that picks pending outbox rows and attempts delivery (skeleton)
export async function sendOutboxOnce() {
  const client = await (await import('../db')).default.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query("SELECT id, topic, payload FROM outbox WHERE status = 'pending' AND scheduled_at <= now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10");
    for (const row of res.rows) {
      try {
        // Placeholder: call external API
        console.log('sending outbox', row.id, row.topic);
        // On success:
        await client.query("UPDATE outbox SET status='sent', updated_at=now() WHERE id=$1", [row.id]);
      } catch (err) {
        console.error('outbox send error', err);
        await client.query('UPDATE outbox SET attempts = attempts + 1, scheduled_at = now() + interval '"'"' '1 minute'"'"', updated_at=now() WHERE id=$1', [row.id]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
