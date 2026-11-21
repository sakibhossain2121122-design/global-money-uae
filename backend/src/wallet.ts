import type { Pool, PoolClient } from 'pg';
import { ApiError, financialPosting, uuid } from './security.ts';

export async function walletBalance(c: PoolClient, customerId: string) {
  const row = (await c.query(`
    SELECT w.currency,
      (COALESCE((SELECT sum(e.amount_minor) FROM ledger_entries e WHERE e.wallet_id=w.id),0)::numeric / 100)::numeric(24,2)::text AS balance,
      (COALESCE((SELECT sum(s.amount_minor) FROM send_money_requests s WHERE s.wallet_id=w.id AND s.hold_status='held'),0)::numeric / 100)::numeric(24,2)::text AS held_balance,
      ((COALESCE((SELECT sum(e.amount_minor) FROM ledger_entries e WHERE e.wallet_id=w.id),0) -
        COALESCE((SELECT sum(s.amount_minor) FROM send_money_requests s WHERE s.wallet_id=w.id AND s.hold_status='held'),0))::numeric / 100)::numeric(24,2)::text AS available_balance
    FROM wallets w
    WHERE w.customer_id=$1 AND w.currency='AED' AND w.kind='customer'
  `, [customerId])).rows[0];
  return { balance: row?.balance ?? null, heldBalance: row?.held_balance ?? null,
    availableBalance: row?.available_balance ?? null, currency: 'AED', postingEnabled: false };
}

// The unconditional application guard and the database denial triggers are both required.
export async function creditVerifiedRequest(pool: Pool, requestId: string, actorId: string): Promise<{journalId: string; created: boolean}> {
  financialPosting();
  return executeCredit(pool, requestId, actorId);
}

async function executeCredit(pool: Pool, requestId: string, actorId: string): Promise<{journalId: string; created: boolean}> {
  const id = uuid(requestId), actor = uuid(actorId);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const administrator = await c.query("SELECT id FROM customers WHERE id=$1 AND role='admin' AND status='active' FOR SHARE", [actor]);
    if (!administrator.rowCount) throw new ApiError(403, 'Administrator access required');
    const request = (await c.query(`
      SELECT r.customer_id, r.status, receipt.id AS receipt_id, receipt.payment_method_id, receipt.verification_status,
             receipt.verified_amount_aed::text AS amount, receipt.payment_reference
      FROM service_requests r JOIN add_money_receipts receipt ON receipt.request_id=r.id
      WHERE r.id=$1 AND r.request_type='add_money' FOR UPDATE OF r, receipt
    `, [id])).rows[0];
    if (!request) throw new ApiError(404, 'Verified request not found');
    const existing = (await c.query('SELECT journal_id FROM wallet_credit_records WHERE request_id=$1', [id])).rows[0];
    if (existing) {
      await c.query('COMMIT');
      return {journalId: existing.journal_id, created: false};
    }
    if (!['pending','under_review'].includes(request.status) ||
        request.verification_status !== 'verified' || !request.amount || !request.payment_reference) {
      throw new ApiError(409, 'Payment verification required');
    }
    const authorized = await c.query(`
      SELECT a.request_id FROM wallet_credit_authorizations a
      JOIN add_money_receipt_events e ON e.id=a.receipt_event_id AND e.receipt_id=a.receipt_id
      WHERE a.request_id=$1 AND a.receipt_id=$2 AND e.verification_status='verified'
        AND e.verified_amount_aed=$3 AND e.payment_reference=$4
        AND e.id=(SELECT max(id) FROM add_money_receipt_events WHERE receipt_id=a.receipt_id)
      FOR SHARE OF a
    `, [id, request.receipt_id, request.amount, request.payment_reference]);
    if (!authorized.rowCount) throw new ApiError(403, 'Financial authorization required');
    const wallets = await c.query(
      "SELECT id,kind FROM wallets WHERE currency='AED' AND ((customer_id=$1 AND kind='customer') OR (customer_id IS NULL AND kind='clearing')) ORDER BY id FOR UPDATE",
      [request.customer_id]
    );
    const customer = wallets.rows.filter(w => w.kind === 'customer');
    const clearing = wallets.rows.filter(w => w.kind === 'clearing');
    if (customer.length !== 1 || clearing.length !== 1) throw new ApiError(409, 'Wallet configuration unavailable');
    const match = /^([0-9]+)\.([0-9]{2})$/.exec(request.amount);
    if (!match) throw new ApiError(409, 'Invalid verified amount');
    const minor = BigInt(match[1]) * 100n + BigInt(match[2]);
    if (minor <= 0n) throw new ApiError(409, 'Invalid verified amount');
    const journal = (await c.query("INSERT INTO ledger_journals(idempotency_key) VALUES($1) RETURNING id", ['add-money:'+id])).rows[0];
    await c.query('INSERT INTO ledger_entries(journal_id,wallet_id,amount_minor) VALUES($1,$2,$3),($1,$4,$5)',
      [journal.id,customer[0].id,minor.toString(),clearing[0].id,(-minor).toString()]);
    await c.query('INSERT INTO wallet_credit_records(request_id,journal_id,amount_minor,payment_method_id,payment_reference,created_by) VALUES($1,$2,$3,$4,$5,$6)',
      [id,journal.id,minor.toString(),request.payment_method_id,request.payment_reference,actor]);
    await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'wallet.credit',$2)",[actor,id]);
    await c.query('COMMIT');
    return {journalId: journal.id, created: true};
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
