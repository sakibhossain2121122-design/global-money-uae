import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
const c = await pool.connect();
try {
 await c.query('BEGIN');
 await c.query('SELECT pg_advisory_xact_lock(42821001)');
 await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)');
 const applied = await c.query("SELECT 1 FROM schema_migrations WHERE version = '001'");
 if (!applied.rowCount) {
  await c.query(await readFile(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8'));
  await c.query("INSERT INTO schema_migrations VALUES ('001')");
 }
 await c.query('COMMIT');
} catch(e) { await c.query('ROLLBACK'); throw e; }
finally { c.release(); await pool.end(); }
