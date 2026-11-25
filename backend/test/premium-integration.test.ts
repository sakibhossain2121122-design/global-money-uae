import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Disposable TEST_DATABASE_URL ending in _test required');

test('Premium deposit lifecycle', async () => {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("UPDATE payment_methods SET staging_enabled=true WHERE id='botim_money'");
  const port = 3108;
  const child = spawn(process.execPath, ['src/server.ts'], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_RUNTIME_DATABASE_URL??url,
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


    const successRequest = await api(
      'deposit-requests', 'POST',
      {
        ...payload,
        idempotencyKey: `success-${suffix}`
      }, alice
    );

    assert.equal(successRequest.status, 201);

    const successId = successRequest.body.id;

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id: successId, status: 'successful' }, alice
    )).status, 403);

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id: successId, status: 'under_review' }, admin
    )).status, 200);

    const reviewed = await api(
      'admin/deposit-requests', 'PATCH',
      { id: successId,
        status: 'successful',
        transactionReference: 'TEST-DEP-' + String(suffix)
      }, admin
    );

    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.status, 'successful');
    assert.equal(reviewed.body.postingEnabled, false);

    assert.equal((await api(
      'admin/deposit-requests', 'PATCH',
      { id: successId, status: 'pending' }, admin
    )).status, 409);


    const editedRef = 'TEST-EDIT-' + String(suffix);

    assert.equal((await api(
      'admin/deposit-reference', 'PATCH',
      {id:successId,transactionReference:editedRef},
      alice
    )).status,403);

    const edited = await api(
      'admin/deposit-reference', 'PATCH',
      {id:successId,transactionReference:editedRef},
      admin
    );

    assert.equal(edited.status,200);
    assert.equal(edited.body.transactionReference,editedRef);
    assert.equal(edited.body.status,'successful');
    assert.equal(edited.body.postingEnabled,false);

    console.log('Admin deposit reference edit: PASS');

    console.log('Successful synthetic deposit: PASS');


    const beneficiary = await api(
      'beneficiaries', 'POST',
      {
        name: 'Synthetic Test Beneficiary',
        provider: 'Bank',
        account: 'TEST-000001',
        bank: 'Synthetic Test Bank'
      }, alice
    );

    assert.equal(beneficiary.status, 201);

    const sendPayload = {
      amountAed: 50,
      beneficiaryId: beneficiary.body.id,
      idempotencyKey: `synthetic:send-${suffix}`
    };

    assert.equal((await api(
      'send-money-requests', 'POST',
      sendPayload, bob
    )).status, 404);

    const send = await api(
      'send-money-requests', 'POST',
      sendPayload, alice
    );

    assert.equal(send.status, 201);
    assert.equal(send.body.status, 'pending');
    assert.equal(send.body.postingEnabled, false);
    assert.equal(send.body.payoutEnabled, false);

    assert.equal((await api(
      'send-money-requests', 'POST',
      sendPayload, alice
    )).status, 409);

    const sendId = send.body.id;

    assert.equal((await api(
      'admin/send-money-requests', 'PATCH',
      { id: sendId, status: 'successful' }, alice
    )).status, 403);

    const sendReview = await api(
      'admin/send-money-requests', 'PATCH',
      { id: sendId,
        status: 'successful',
        transactionReference: 'TEST-SEND-' + String(suffix)
      }, admin
    );

    assert.equal(sendReview.status, 200);
    assert.equal(sendReview.body.status, 'successful');
    assert.equal(sendReview.body.postingEnabled, false);
    assert.equal(sendReview.body.payoutEnabled, false);

    assert.equal((await api(
      'admin/send-money-requests', 'PATCH',
      { id: sendId, status: 'pending' }, admin
    )).status, 409);

    const rejectedSend = await api(
      'send-money-requests', 'POST',
      {
        ...sendPayload,
        idempotencyKey: `synthetic:reject-${suffix}`
      }, alice
    );

    assert.equal(rejectedSend.status, 201);

    assert.equal((await api(
      'admin/send-money-requests', 'PATCH',
      { id: rejectedSend.body.id, status: 'rejected' },
      admin
    )).status, 200);


    const sendEditedRef = 'TEST-SEND-EDIT-' + String(suffix);

    assert.equal((await api(
      'admin/send-money-reference','PATCH',
      {id:sendId,transactionReference:sendEditedRef},
      alice
    )).status,403);

    assert.equal((await api(
      'admin/send-money-reference','PATCH',
      {id:sendId,transactionReference:editedRef},
      admin
    )).status,409);

    const sendEdited = await api(
      'admin/send-money-reference','PATCH',
      {id:sendId,transactionReference:sendEditedRef},
      admin
    );

    assert.equal(sendEdited.status,200);
    assert.equal(sendEdited.body.transactionReference,sendEditedRef);
    assert.equal(sendEdited.body.status,'successful');
    assert.equal(sendEdited.body.postingEnabled,false);
    assert.equal(sendEdited.body.payoutEnabled,false);

    console.log('Admin Send Money reference edit: PASS');
    console.log('Cross-table duplicate protection: PASS');

    console.log('Synthetic Send Money lifecycle: PASS');

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
