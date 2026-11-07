/** Real HTTP routing with a strictly read-only fake pool. Never opens PostgreSQL. */
import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const session = 'a'.repeat(43);
const hash = createHash('sha256').update(session).digest('hex');
const queries = [];
const client = {
 async query(sql, args = []) {
  queries.push(sql);
  assert.match(sql, /^(SELECT|BEGIN|COMMIT|ROLLBACK)\b/);
  if (sql.includes('FROM sessions s')) {
   assert(sql.includes("s.expires_at>now() AND c.status='active'"));
   return {rows:args[0] === hash ? [{id:'00000000-0000-0000-0000-000000000001',role:'customer',name:'Test'}] : []};
  }
  if (sql.includes('FROM payment_methods')) return {rows:[{id:'test',name:'Test bank',country:'AE',currency:'AED',logo_url:null,enabled:true}]};
  return {rows:[]};
 },
 release() {}
};
class ReadOnlyPool {
 on() {}
 async connect() {return client;}
 async end() {}
}
mock.module('pg',{defaultExport:{Pool:ReadOnlyPool}});
process.env.DATABASE_URL='unused-test-double-no-database-connection';
process.env.PORT='3117';
await import('../src/server.ts');
const url='http://127.0.0.1:3117/v1/';
async function request(path, method='GET', token) {
 return fetch(url+path,{method,headers:token?{Authorization:'Bearer '+token}:{}});
}
try {
 await test('payment methods require an active customer session and never enable payments',async()=>{
  assert.equal((await request('payment-methods')).status,401);
  assert.equal((await request('payment-methods','GET','invalid')).status,401);
  assert.equal((await request('payment-methods','GET','b'.repeat(43))).status,401);
  const response=await request('payment-methods','GET',session);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),[{id:'test',name:'Test bank',country:'AE',currency:'AED',logo_url:null,enabled:false}]);
  assert.equal((await request('payment-methods','POST',session)).status,404);
 });
 await test('money routes stay blocked and only read-only SQL executes',async()=>{
  for(const path of ['add-money','botim-money','wallet/credit','wallet/debit','payments','transfers','remittances'])
   assert.equal((await request(path,'POST',session)).status,503,path);
  assert.equal((await request('deposits','POST',session)).status,404);
  assert(queries.every(sql=>/^(SELECT|BEGIN|COMMIT|ROLLBACK)\b/.test(sql)));
 });
} finally {process.emit('SIGTERM');}
