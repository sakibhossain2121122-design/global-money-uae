import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { schemaSignature } from './schema-integrity.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const registry = ['001_foundation.sql','002_payment_methods.sql','003_admin_controls.sql','004_premium_staging.sql','005_request_lifecycle.sql','006_request_status.sql','007_transaction_reference.sql','008_reference_history.sql','009_reconstructed_premium_ui.sql'];
const migrations = await Promise.all(registry.map(async file => {
  const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
  return { version: file.slice(0, 3), sql, checksum: createHash('sha256').update(sql).digest('hex') };
}));
const client = await pool.connect();
const reference = 'gm_reference_' + randomUUID().replaceAll('-', '');
const historyDDL = `CREATE TABLE schema_migrations (
 version text PRIMARY KEY,
 checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$')
)`;
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(42821001)');
  await client.query('SET LOCAL search_path TO public, pg_catalog');
  const exists = (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation;
  let applied: { version: string; checksum: string }[] = [];
  if (exists) {
    const columns = (await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='schema_migrations'`)).rows.map(r => r.column_name);
    if (!columns.includes('checksum')) throw new Error('Unchecksummed migration history: explicit owner review required; no automatic backfill');
    applied = (await client.query('SELECT version, checksum FROM public.schema_migrations ORDER BY version')).rows;
    if (!applied.length) throw new Error('Empty existing migration history requires explicit review');
    for (let i = 0; i < applied.length; i++) {
      const expected = migrations[i];
      if (!expected || applied[i].version !== expected.version || applied[i].checksum !== expected.checksum)
        throw new Error('Unsupported migration history or checksum mismatch; explicit review required');
    }
  } else {
    // Do not stamp an existing untracked schema as a fresh installation.
    if ((await schemaSignature(client, 'public')).length) throw new Error('Untracked existing schema requires explicit review');
    await client.query(historyDDL);
  }
  // Build a transactional reference from the version-controlled SQL, never infer
  // missing legacy migrations. No reference data or DDL survives this transaction.
  await client.query(`CREATE SCHEMA "${reference}"`);
  await client.query(`SET LOCAL search_path TO "${reference}", pg_catalog`);
  await client.query(historyDDL);
  for (let i = 0; i < applied.length; i++) await client.query(migrations[i].sql);
  const verify = async () => {
    const expected = await schemaSignature(client, reference);
    const actual = await schemaSignature(client, 'public');
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Schema integrity mismatch; explicit review required');
  };
  await verify();
  for (const migration of migrations.slice(applied.length)) {
    await client.query(`SET LOCAL search_path TO "${reference}", pg_catalog`);
    await client.query(migration.sql);
    await client.query('SET LOCAL search_path TO public, pg_catalog');
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [migration.version, migration.checksum]);
    await verify();
    console.log('Applied migration:', migration.version);
  }
  await client.query(`DROP SCHEMA "${reference}" CASCADE`);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
