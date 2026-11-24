import type {PoolClient} from 'pg';

export async function stagingRemittanceRate(client: PoolClient): Promise<string | null> {
  if (process.env.STAGING_SHOW_CONFIGURED_RATE !== 'true') return null;
  const result = await client.query("SELECT value::numeric(16,6)::text AS value FROM rates WHERE pair='AED/BDT' AND value>0");
  return result.rows[0]?.value ?? null;
}
