import { Pool, PoolClient } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function runTransaction<T>(cb: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await cb(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
