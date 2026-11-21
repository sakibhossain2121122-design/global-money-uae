import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import pg from 'pg';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {requestJson} from './http-client.ts';

const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith('_test'))throw new Error('Disposable TEST_DATABASE_URL ending in _test required');
const pool=new pg.Pool({connectionString:url});
const endpoint='http://127.0.0.1:3109/v1/';
let child:ReturnType<typeof spawn>|undefined;
async function request(path:string,method='GET',body?:unknown,bearer?:string) {
 return requestJson(endpoint+path,method,body,bearer);
}
async function upload(id:string, bytes:Buffer, type:string, bearer:string) {
 return fetch(endpoint+`add-money-requests/${id}/receipt`,{
  method:'PUT',headers:{Authorization:'Bearer '+bearer,'Content-Type':type},body:new Uint8Array(bytes)
 });
}
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:url,PORT:'3109'},stdio:['ignore','ignore','pipe']});
 child.stderr?.on('data',()=>{});
 let ready=false;
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3109/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'API did not start');
 const password='A secure password 123!';
 for(const name of ['alice','bob','admin'])await request('auth/register','POST',{email:name+'@example.com',password,name});
 await pool.query("UPDATE customers SET role='admin' WHERE email='admin@example.com'");
 const login=async(name:string)=>(await request('auth/login','POST',{email:name+'@example.com',password})).body.token as string;
 const alice=await login('alice'), bob=await login('bob'), admin=await login('admin');
 const aliceId=(await request('me','GET',undefined,alice)).body.id as string;
 const bobCustomerId=(await request('me','GET',undefined,bob)).body.id as string;
 const adminId=(await request('me','GET',undefined,admin)).body.id as string;
 const image={create:{width:1,height:1,channels:3 as const,background:'#ffffff'}};
 const png=await sharp(image).png().toBuffer(), jpeg=await sharp(image).jpeg().toBuffer();
 const doc=await PDFDocument.create();doc.addPage().drawText('Receipt reference TEST-123',{x:40,y:700});const pdf=Buffer.from(await doc.save());
 const draft={amount_aed:'12.34',payment_method_id:'adcb',note:'Review',idempotency_key:randomUUID()};
 const id=(await request('add-money-requests','POST',draft,alice)).body.id as string;
 const bobId=(await request('add-money-requests','POST',{...draft,idempotency_key:randomUUID()},bob)).body.id as string;

 await test('wallet reads are authenticated, scoped and distinguish missing from existing wallets',async()=>{
  assert.equal((await request('wallet')).status,401);
  assert.equal((await request('admin/users/'+aliceId+'/wallet','GET',undefined,alice)).status,403);
  assert.equal((await request('admin/users/'+aliceId+'/wallet','GET',undefined,admin)).body.balance,null);
  assert.equal((await pool.query("SELECT count(*) FROM audit_logs WHERE action='admin.wallet.view' AND target=$1",[aliceId])).rows[0].count,'1');
  await pool.query("INSERT INTO wallets(customer_id,currency,kind) VALUES($1,'AED','customer')",[aliceId]);
  assert.equal((await request('wallet','GET',undefined,alice)).body.balance,'0.00');
  assert.equal((await request('wallet','GET',undefined,bob)).body.balance,null);
  assert.equal((await request('admin/users/'+randomUUID()+'/wallet','GET',undefined,admin)).status,404);
 });
 await test('receipts are validated, private, owner-scoped and deduplicated',async()=>{
  assert.equal((await upload(id,png,'image/png',bob)).status,404);
  assert.equal((await upload(id,Buffer.from('bad'),'image/png',alice)).status,400);
  assert.equal((await upload(id,png,'application/pdf',alice)).status,400);
  assert.equal((await upload(id,png,'image/gif',alice)).status,415);
  assert.equal((await upload(id,Buffer.alloc(5*1024*1024+1),'image/png',alice)).status,413);
  const chunkedStatus=await new Promise<number>((resolve,reject)=>{
   const req=httpRequest(endpoint+`add-money-requests/${id}/receipt`,{
    method:'PUT',headers:{Authorization:'Bearer '+alice,'Content-Type':'image/png','Transfer-Encoding':'chunked'}
   },res=>{res.resume();res.on('end',()=>resolve(res.statusCode ?? 0));});
   req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('Upload timed out')));
   req.end(Buffer.alloc(5*1024*1024+1));
  });
  assert.equal(chunkedStatus,413);
  const first=await upload(id,png,'image/png',alice);assert.equal(first.status,201);
  assert.equal((await upload(id,png,'image/png',alice)).status,200);
  assert.equal((await upload(id,jpeg,'image/jpeg',alice)).status,409);
  assert.equal((await upload(bobId,png,'image/png',bob)).status,409);
  assert.equal((await upload(bobId,pdf,'application/pdf',bob)).status,201);
  assert.equal((await request('admin/add-money-requests/'+id+'/receipt','GET',undefined,alice)).status,403);
  const response=await fetch(endpoint+`admin/add-money-requests/${id}/receipt`,{headers:{Authorization:'Bearer '+admin}});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/octet-stream');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  const listing=(await request('admin/add-money-requests','GET',undefined,admin)).body;
  assert(!('content' in listing[0]));
 });
 await test('receipt review requires current state and unique payment reference; it never posts',async()=>{
  const path='admin/add-money-requests/'+id+'/receipt';
  const verified={status:'verified',expected_status:'pending',verified_amount_aed:'12.34',payment_reference:'REFERENCE-1',note:'Reviewed externally'};
  assert.equal((await request(path,'PATCH',verified,alice)).status,403);
  assert.equal((await request(path,'PATCH',verified,admin)).status,200);
  assert.equal((await request(path,'PATCH',verified,admin)).status,409);
  assert.equal((await request('admin/add-money-requests/'+bobId+'/receipt','PATCH',{...verified,payment_reference:' reference-1 '},admin)).status,409);
  const events=(await request('admin/add-money-requests/'+id+'/receipt-events','GET',undefined,admin)).body;
  assert.deepEqual(events.map((e:{verification_status:string})=>e.verification_status),['pending','verified']);
  assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'0');
  assert.equal((await request('wallet/credit','POST',{},admin)).status,503);
 });
 await test('prepared service requires authorization and is atomic and idempotent in the disposable database',async()=>{
  // Only this disposable test database lifts the triggers; the application guard is mocked in this process only.
  const security=await import('../src/security.ts');
  mock.module('../src/security.ts',{namedExports:{...security,financialPosting(){}}});
  const {creditVerifiedRequest}=await import('../src/wallet.ts');
  await assert.rejects(()=>creditVerifiedRequest(pool,id,adminId),/Financial authorization required/);
  await pool.query(`INSERT INTO wallet_credit_authorizations(request_id,receipt_id,receipt_event_id,approved_by,evidence_reference)
   SELECT r.request_id,r.id,e.id,$2,'test-only-evidence' FROM add_money_receipts r JOIN add_money_receipt_events e ON e.receipt_id=r.id
   WHERE r.request_id=$1 AND e.verification_status='verified'`,[id,adminId]);
  await pool.query("INSERT INTO wallets(currency,kind) VALUES('AED','clearing')");
  await pool.query('ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled; ALTER TABLE ledger_journals DISABLE TRIGGER journals_disabled');
  try {
   const results=await Promise.all([creditVerifiedRequest(pool,id,adminId),creditVerifiedRequest(pool,id,adminId)]);
   assert.deepEqual(results.map(r=>r.created).sort(),[false,true]);
   assert.equal(results[0].journalId,results[1].journalId);
   assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
   assert.equal((await pool.query('SELECT count(*) FROM ledger_entries')).rows[0].count,'2');
   assert.equal((await pool.query('SELECT sum(amount_minor) FROM ledger_entries')).rows[0].sum,'0');
   assert.equal((await request('wallet','GET',undefined,alice)).body.balance,'12.34');
   assert.equal((await request('admin/users/'+aliceId+'/wallet','GET',undefined,admin)).body.balance,'12.34');
   assert.equal((await request('admin/add-money-requests/'+id+'/receipt','PATCH',{status:'rejected',expected_status:'verified'},admin)).status,200);
   assert.equal((await request('admin/add-money-requests/'+bobId+'/receipt','PATCH',{status:'verified',expected_status:'pending',verified_amount_aed:'12.34',payment_reference:'reference-1'},admin)).status,200);
   await pool.query(`INSERT INTO wallet_credit_authorizations(request_id,receipt_id,receipt_event_id,approved_by,evidence_reference)
    SELECT r.request_id,r.id,e.id,$2,'test-only-evidence' FROM add_money_receipts r JOIN add_money_receipt_events e ON e.receipt_id=r.id
    WHERE r.request_id=$1 AND e.verification_status='verified'`,[bobId,adminId]);
   await pool.query("INSERT INTO wallets(customer_id,currency,kind) VALUES($1,'AED','customer')",[bobCustomerId]);
   await assert.rejects(()=>creditVerifiedRequest(pool,bobId,adminId),/wallet_credit_record_reference/);
   assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
   assert.equal((await pool.query('SELECT count(*) FROM ledger_entries')).rows[0].count,'2');
   assert.equal((await request('wallet','GET',undefined,bob)).body.balance,'0.00');
  } finally {
   await pool.query('ALTER TABLE ledger_entries ENABLE TRIGGER posting_disabled; ALTER TABLE ledger_journals ENABLE TRIGGER journals_disabled');
  }
  await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('still-disabled')"),/Service not yet available/);
 });
} finally {
 if(child){child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}
 await pool.end();
}
