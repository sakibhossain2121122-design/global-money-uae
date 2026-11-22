import {randomBytes, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';

export async function createTestRuntime(pool: Pool, databaseUrl: string) {
 const docs=await readFile(new URL('../../docs/deployment.md',import.meta.url),'utf8');
 const blocks=[...docs.matchAll(/```sql\n([\s\S]*?)```/g)].map(match=>match[1]);
 const initial=blocks.find(block=>block.includes('CREATE ROLE gm_app LOGIN'));
 const grants=blocks.find(block=>block.includes('REVOKE ALL ON service_requests'));
 if(!initial || !grants)throw new Error('Documented runtime role grants not found');
 const name='gm_test_'+randomUUID().replaceAll('-','');
 const password=randomBytes(24).toString('hex');
 await pool.query(initial.replace(/\bgm_app\b/g,name));
 try {
  await pool.query(`GRANT ${name} TO CURRENT_USER`);
  await pool.query(grants.replace(/\bgm_app\b/g,name));
  await pool.query(`ALTER ROLE ${name} PASSWORD '${password}'`);
 } catch(error) {
  await pool.query(`DROP OWNED BY ${name}; DROP ROLE ${name}`);
  throw error;
 }
 const connection=new URL(databaseUrl);
 connection.username=name;
 connection.password=password;
 return {
  name,
  url:connection.toString(),
  async cleanup() {await pool.query(`DROP OWNED BY ${name}; DROP ROLE ${name}`);}
 };
}
