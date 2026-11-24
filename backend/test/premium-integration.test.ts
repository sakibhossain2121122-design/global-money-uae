import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

const url = 'postgresql://gmu_test@127.0.0.1:5544/gmu14_test';

test('Premium deposit lifecycle', async () => {
  const pool = new pg.Pool({ connectionString: url });
  const port = 3108;
  const child = spawn(process.execPath, ['src/server.ts'], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      PORT: String(port),
      SYNTHETIC_REQUESTS_ENABLED: 'true'
    },
    stdio: 'ignore'
  });

  async function api(path: string, method = 'GET',
    body?: unknown, token?: string) {
    const r = await fetch(
      `http://127.0.0.1:${port}/v1/${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      }
    );
    return { status: r.status, body: await r.json() };
  }

  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) { ready = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'API did not start');

    const password = 'Premium-Test-Only-123!';
    const suffix = Date.now();

    async function account(name: string, admin = false) {
      const email = `${name}${suffix}@example.com`;
      assert.equal((await api('auth/register', 'POST',
        { name, email, password })).status, 202);

      if (admin) {
        await pool.query(
          "UPDATE customers SET role='admin' WHERE email=$1",
          [email.toLowerCase()]
        );
      }

      const login = await api('auth/login', 'POST',
        { email, password });
      assert.equal(login.status, 200);
      return login.body.token as string;
    }

    const alice = await account('Alice');
    const bob = await account('Bob');
    const admin = await account('Admin', true);

    const payload = {
      amountAed: 100,
      paymentMethodId: 'botim_money',
      receiptFixtureKey: 'synthetic:test_receipt',
      idempotencyKey: `deposit-${suffix}`
    };

    const created = await api(
      'deposit-requests', 'POST', payload, alice
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.postingEnabled, false);
    const id = created.body.id;

    assert.equal((await api(
      'deposit-requests', 'POST', payload, alice
    )).status, 409);

    assert.deepEqual((await api(
      'deposit-requests', 'GET', undefined, bob
    )).body, []);

    assert.equal((await api(
      'admin/deposit-requests', 'GET', undefined, alice
    )).status, 403);

    const list = await api(
      'admin/deposit-requests', 'GET', undefined, admin
    );
    assert.equal(list.status, 200);
    assert.ok(list.body.some((r: {id: string}) => r.id === id));

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id, status: 'under_review' }, admin
    )).status, 200);

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id, status: 'approved' }, admin
    )).status, 409);

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id, status: 'rejected' }, admin
    )).status, 200);

    const wallet = await api(
      'wallet', 'GET', undefined, alice
    );
    assert.equal(wallet.status, 200);
    assert.equal(wallet.body.postingEnabled, false);
    assert.equal(wallet.body.balance, null);

    console.log('Premium deposit lifecycle: PASS');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await pool.end();
  }
});
