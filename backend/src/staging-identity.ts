import type {PoolClient} from 'pg';
import {fields} from './add-money.ts';
import {ApiError, uuid} from './security.ts';

const customerPath = '/v1/staging-identity-samples';
const adminPath = '/v1/admin/staging-identity-samples';
const passportContent = 'GLOBAL MONEY UAE STAGING SAMPLE: PASSPORT';
const emiratesIdContent = 'GLOBAL MONEY UAE STAGING SAMPLE: UAE ID';
const selfieContent = 'GLOBAL MONEY UAE STAGING SAMPLE: SELFIE';

export async function stagingIdentity(
  c: PoolClient,
  path: string,
  method: string,
  actor: string,
  role: string,
  body: () => Promise<Record<string, unknown>>,
  audit: (action: string, target: string) => Promise<void>
): Promise<{data: unknown; status?: number} | null> {
  if (path !== customerPath && path !== adminPath) return null;
  const enabled = process.env.STAGING_IDENTITY_SAMPLE_REVIEW === 'true';
  if (method === 'GET' && path === customerPath) {
    if (!enabled) return {data: {enabled, submission: null}};
    const result = await c.query(
      'SELECT id,identity_sample,selfie_sample,status FROM staging_identity_samples WHERE customer_id=$1', [actor]
    );
    return {data: {enabled, submission: result.rows[0] ?? null}};
  }
  if (!enabled) throw new ApiError(503, 'Staging sample review is disabled');
  if (path === customerPath && method === 'POST') {
    if (role !== 'customer') throw new ApiError(403, 'Customer access required');
    const data = await body();
    fields(data, ['identity_sample', 'identity_content', 'selfie_sample', 'selfie_content']);
    const validIdentity = (data.identity_sample === 'passport-sample.txt' && data.identity_content === passportContent)
      || (data.identity_sample === 'uae-id-sample.txt' && data.identity_content === emiratesIdContent);
    if (!validIdentity || data.selfie_sample !== 'selfie-sample.txt' || data.selfie_content !== selfieContent) {
      throw new ApiError(400, 'Only built-in test samples are accepted');
    }
    const result = await c.query(
      `INSERT INTO staging_identity_samples(customer_id,identity_sample,selfie_sample)
       VALUES($1,$2,$3) ON CONFLICT(customer_id) DO NOTHING
       RETURNING id,identity_sample,selfie_sample,status`,
      [actor, data.identity_sample, data.selfie_sample]
    );
    const submission = result.rows[0];
    if (!submission) throw new ApiError(409, 'A sample submission already exists');
    await audit('staging_identity.submit', submission.id);
    return {status: 201, data: {enabled, submission}};
  }
  if (path === adminPath && method === 'GET') {
    const result = await c.query(
      `SELECT s.id,s.customer_id,c.name,s.identity_sample,s.selfie_sample,s.status,s.submitted_at
       FROM staging_identity_samples s JOIN customers c ON c.id=s.customer_id
       ORDER BY s.submitted_at DESC,s.id LIMIT 100`
    );
    return {data: result.rows};
  }
  if (path === adminPath && method === 'PATCH') {
    const data = await body();
    fields(data, ['id', 'status']);
    const id = uuid(data.id);
    if (data.status !== 'approved' && data.status !== 'rejected') throw new ApiError(400, 'Invalid review decision');
    const result = await c.query(
      `UPDATE staging_identity_samples SET status=$2,reviewed_by=$3,reviewed_at=now()
       WHERE id=$1 AND status='pending' AND customer_id<>$3 RETURNING id,status`,
      [id, data.status, actor]
    );
    if (!result.rowCount) throw new ApiError(409, 'Sample submission is unavailable for review');
    await audit('admin.staging_identity.' + data.status, id);
    return {data: result.rows[0]};
  }
  return null;
}
