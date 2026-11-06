
import pg from 'pg';
import { hashPassword } from './security.ts';

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';

  if (!url || !email || !password) {
    throw new Error('Required admin configuration is missing');
  }

  if (password.length < 12 || password.length > 128) {
    throw new Error('Admin password must be 12–128 characters');
  }

  const pool = new Pool({
  connectionString: url,
  ssl: {
    rejectUnauthorized: true,
  },
});
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'SELECT pg_advisory_xact_lock($1)',
      [48281001]
    );

    const existing = await client.query(
      "SELECT id FROM customers WHERE role = 'admin' LIMIT 1"
    );

    if (existing.rowCount !== 0) {
      throw new Error('An administrator already exists');
    }

    const duplicate = await client.query(
      'SELECT id FROM customers WHERE email = $1',
      [email]
    );

    if (duplicate.rowCount !== 0) {
      throw new Error('Email already registered');
    }

    const passwordHash = await hashPassword(password);

    await client.query(
      `INSERT INTO customers
       (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')`,
      [email, passwordHash, name]
    );

    await client.query('COMMIT');
    console.log('First administrator created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
