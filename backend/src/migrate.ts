import pg from 'pg';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL required');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const migrations = [
  { version: '001', file: '001_foundation.sql' },
  { version: '002', file: '002_payment_methods.sql' },
  { version: '003', file: '003_admin_controls.sql' },
  { version: '004', file: '004_add_money_requests.sql' }
];


const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(42821001)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)'
  );

  for (const migration of migrations) {
    const result = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [migration.version]
    );

    if (result.rowCount === 0) {
      const sql = await readFile(
        new URL('../migrations/' + migration.file, import.meta.url),
        'utf8'
      );

      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [migration.version]
      );

      console.log('Applied migration:', migration.version);
    }
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
