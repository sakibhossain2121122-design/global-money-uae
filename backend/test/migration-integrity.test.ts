import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl || !['127.0.0.1','localhost'].includes(new URL(adminUrl).hostname))
  throw new Error('TEST_ADMIN_DATABASE_URL must be a disposable local PostgreSQL 17 cluster');
const admin = new pg.Pool({ connectionString: adminUrl });
const name = 'gm_integrity_' + randomUUID().replaceAll('-', '') + '_test';
const url = new URL(adminUrl); url.pathname = '/' + name;
let pool: pg.Pool;
const migrate = () => spawnSync(process.execPath, ['src/migrate.ts'], { env: { ...process.env, DATABASE_URL: url.href }, encoding: 'utf8' });
const permissions = await readFile(new URL('../sql/gm-app-permissions.sql', import.meta.url), 'utf8');
try {
  const version = (await admin.query('SHOW server_version_num')).rows[0].server_version_num;
  assert.equal(Math.floor(Number(version) / 10000), 17, 'PostgreSQL 17 required');
  console.log('PostgreSQL server_version_num:', version);
  await admin.query('CREATE DATABASE ' + name);
  pool = new pg.Pool({ connectionString: url.href });
  const reset = () => pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const fresh = async () => { await reset(); const r = migrate(); assert.equal(r.status, 0, r.stderr); };
  await test('fresh install and repeated migration preserve data', async () => {
    await fresh();
    await pool.query("INSERT INTO customers(email,password_hash,name) VALUES('keep@example.invalid','unused','Keep')");
    assert.equal(migrate().status, 0);
    assert.equal((await pool.query('SELECT count(*) FROM customers')).rows[0].count, '1');
    assert.equal((await pool.query("SELECT count(*) FROM schema_migrations WHERE length(checksum)=64")).rows[0].count, '9');
  });
  await test('unknown schema and legacy unchecksummed records require review', async () => {
    await reset(); await pool.query("CREATE TABLE legacy_data(value text); INSERT INTO legacy_data VALUES('preserve')");
    assert.match(migrate().stderr, /explicit review/);
    assert.equal((await pool.query('SELECT value FROM legacy_data')).rows[0].value, 'preserve');
    await reset(); await pool.query("CREATE TABLE schema_migrations(version text PRIMARY KEY); INSERT INTO schema_migrations VALUES('001')");
    assert.match(migrate().stderr, /explicit owner review/);
    assert.equal((await pool.query('SELECT * FROM schema_migrations')).rows.length, 1);
    assert.equal((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name='schema_migrations' AND column_name='checksum'")).rows[0].count, '0');
  });
  await test('tampered checksum and unknown versions fail closed', async () => {
    await fresh(); await pool.query("UPDATE schema_migrations SET checksum=repeat('0',64) WHERE version='001'");
    assert.match(migrate().stderr, /checksum mismatch/);
    await fresh(); await pool.query("INSERT INTO schema_migrations VALUES('999',repeat('a',64))");
    assert.match(migrate().stderr, /Unsupported migration history/);
  });
  await test('missing tables, columns, constraints, indexes, triggers and changed function detected', async () => {
    for (const sql of [
      'DROP TABLE service_request_events',
      'ALTER TABLE customers DROP COLUMN name',
      'ALTER TABLE service_requests DROP CONSTRAINT service_requests_status_check',
      'DROP INDEX service_customer_idempotency',
      'ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled',
      "CREATE OR REPLACE FUNCTION deny_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$"
    ]) {
      await fresh(); await pool.query(sql);
      assert.match(migrate().stderr, /Schema integrity mismatch/, sql);
      assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '9');
    }
  });
  await test('gm_app permissions are idempotent, remove stale column grants and deny privilege escalation', async () => {
    await fresh(); await pool.query(permissions); await pool.query('GRANT UPDATE(role) ON customers TO gm_app; GRANT UPDATE(role) ON customers TO PUBLIC');
    await pool.query(permissions); await pool.query(permissions);
    const runtimeUrl = new URL(url); runtimeUrl.username = 'gm_app';
    const app = new pg.Pool({ connectionString: runtimeUrl.href });
    try {
      assert.equal((await app.query('SELECT current_user')).rows[0].current_user, 'gm_app');
      await app.query("INSERT INTO customers(email,password_hash,name) VALUES('app@example.invalid','hash','App')");
      await app.query("UPDATE customers SET name='Updated' WHERE email='app@example.invalid'");
      await app.query("INSERT INTO audit_logs(action) VALUES('test.append')");
      for (const sql of [
        "UPDATE customers SET role='admin'", 'DELETE FROM audit_logs', "UPDATE audit_logs SET action='tampered'", 'TRUNCATE audit_logs',
        'DELETE FROM service_request_events', 'TRUNCATE service_request_events',
        'CREATE TABLE public.forbidden(id int)', 'ALTER TABLE customers ADD COLUMN forbidden int',
        'ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled',
        "INSERT INTO ledger_journals(idempotency_key) VALUES('forbidden')", 'DELETE FROM ledger_entries',
        "INSERT INTO transactions(customer_id) SELECT id FROM customers LIMIT 1", 'DELETE FROM schema_migrations'
      ]) await assert.rejects(() => app.query(sql), /permission denied|must be owner/, sql);
      assert.equal((await pool.query('SELECT action FROM audit_logs')).rows[0].action, 'test.append');
      assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count, '0');
    } finally { await app.end(); }
    // Even an owner cannot accidentally post through ordinary SQL.
    await assert.rejects(() => pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('owner-denial')"), /Service not yet available/);
    await assert.rejects(() => pool.query('DELETE FROM ledger_entries'), /Service not yet available/);
    assert.equal(migrate().status, 0, 'ACL changes do not change structural signature');
  });
} finally {
  await pool!?.end();
  await admin.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
  await admin.end();
}
