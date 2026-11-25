import pg from 'pg';
import { readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test');
const pool = new pg.Pool({connectionString:url});
try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const file of ['001_foundation.sql','002_payment_methods.sql','003_admin_controls.sql','004_premium_staging.sql','005_request_lifecycle.sql','006_request_status.sql','007_transaction_reference.sql','008_reference_history.sql','009_reconstructed_premium_ui.sql']) {
    await pool.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  }
  const methods = await pool.query('SELECT id,enabled FROM payment_methods ORDER BY id');
  if ((methods.rowCount ?? 0) < 6 || methods.rows.some(row => row.enabled)) throw new Error('Payment methods must exist but remain disabled');
  const locks = await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('posting_disabled','journals_disabled','audit_logs_immutable') AND NOT tgisinternal");
  if (locks.rows[0].n !== 3) throw new Error('Financial posting/audit protection trigger missing');
  console.log('Premium staging migrations: PASS (disposable database only)');
} finally { await pool.end(); }
