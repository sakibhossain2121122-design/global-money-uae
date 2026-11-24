import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Disposable test database required');
const pool=new pg.Pool({connectionString:url});
let child:ReturnType<typeof spawn>|undefined;
async function request(path:string,method='GET',body?:unknown,token?:string){const r=await fetch('http://127.0.0.1:3109/v1/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'9');
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:url,PORT:'3109'},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:3109/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const tokens:Record<string,string>={};
 for(const name of ['alice','bob','admin','reviewer','support']){const credentials={email:name+'@example.com',password:'A secure password 123!',name};await request('auth/register','POST',credentials);if(['admin','reviewer','support'].includes(name))await pool.query('UPDATE customers SET role=$1 WHERE email=$2',[name,credentials.email]);tokens[name]=(await request('auth/login','POST',credentials)).body.token;}
 const {alice,bob,admin,reviewer,support}=tokens;
 await test('admin controls, ownership and financial security',async t=>{
  let account='',bank='',send='',receipt='';
  await t.test('role boundaries enforced server side',async()=>{for(const token of [alice,reviewer,support])for(const path of ['payment-accounts','payout-banks','wallet-holds','audit-logs'])assert.equal((await request('admin/'+path,'GET',undefined,token)).status,403);assert.equal((await request('admin/receipts','GET',undefined,reviewer)).status,200);assert.equal((await request('admin/support','GET',undefined,support)).status,200);});
  await t.test('payment accounts edit, display gating and irreversible archive',async()=>{
   account=(await request('admin/payment-accounts','POST',{payment_method_id:'adcb',account_holder:'Test fixture only',account_number:'TEST1234'},admin)).body.id;assert(account);
   assert.deepEqual((await request('payment-accounts','GET',undefined,alice)).body,[]);
   assert.equal((await request('admin/payment-accounts','PATCH',{id:account,enabled:true,account_holder:'Edited fixture'},admin)).status,200);
   assert.equal((await request('payment-accounts','GET',undefined,alice)).body[0].account_holder,'Edited fixture');
   assert.equal((await request('admin/payment-accounts','PATCH',{id:account,enabled:'true'},admin)).status,400);
   assert.equal((await request('admin/payment-accounts','PATCH',{id:account,archive:true},admin)).status,200);
   assert.deepEqual((await request('payment-accounts','GET',undefined,alice)).body,[]);
   assert.equal((await request('admin/payment-accounts','PATCH',{id:account,enabled:true},admin)).status,404);
  });
  await t.test('Bangladesh bank validation, edit and disable',async()=>{assert.equal((await request('admin/payout-banks','POST',{name:'Fixture',country:'US'},admin)).status,400);bank=(await request('admin/payout-banks','POST',{name:'Fixture bank'},admin)).body.id;assert(bank);assert.equal((await request('admin/payout-banks','PATCH',{id:bank,name:'Edited bank',enabled:true},admin)).status,200);assert.equal((await request('payout-banks','GET',undefined,alice)).body[0].country,'BD');await request('admin/payout-banks','PATCH',{id:bank,enabled:false},admin);assert.equal((await request('payout-banks','GET',undefined,alice)).body.length,0);});
  await t.test('send requests are owned, idempotent and review-only; holds release',async()=>{
   const ben=(await request('beneficiaries','POST',{name:'Fixture',provider:'bKash',account:'01712345678'},alice)).body.id;
   const b={amount_aed:'10.00',beneficiary_id:ben,idempotency_key:randomUUID()};
   assert.equal((await request('send-money-requests','POST',b,bob)).status,404);
   const results=await Promise.all([request('send-money-requests','POST',b,alice),request('send-money-requests','POST',b,alice)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);send=results[0].body.id;
   assert.equal((await request('send-money-requests','GET',undefined,bob)).body.length,0);
   assert.equal((await request('admin/send-money-requests/'+send,'PATCH',{status:'paid',expected_status:'pending'},admin)).status,400);
   assert.equal((await request('admin/send-money-requests/'+send,'PATCH',{status:'rejected',expected_status:'pending'},reviewer)).status,200);
   assert.equal((await pool.query('SELECT status FROM wallet_holds WHERE request_id=$1',[send])).rows[0].status,'released');
   assert.equal((await request('admin/send-money-requests/'+send,'PATCH',{status:'under_review',expected_status:'pending'},reviewer)).status,409);
  });
  await t.test('proposed holds can be released once without journal writes',async()=>{
   const ben=(await pool.query("SELECT id FROM beneficiaries LIMIT 1")).rows[0].id;
   const created=(await request('send-money-requests','POST',{amount_aed:'3',beneficiary_id:ben,idempotency_key:randomUUID()},alice)).body.id;
   const hold=(await pool.query('SELECT id FROM wallet_holds WHERE request_id=$1',[created])).rows[0].id;
   assert.equal((await request('admin/wallet-holds/'+hold+'/release','POST',{},reviewer)).status,403);
   assert.equal((await request('admin/wallet-holds/'+hold+'/release','POST',{},admin)).status,200);
   assert.equal((await request('admin/wallet-holds/'+hold+'/release','POST',{},admin)).status,409);
  });
  await t.test('receipt ownership, bounded decoding, review and access audit',async()=>{
   const id=(await request('add-money-requests','POST',{amount_aed:'12',payment_method_id:'adcb',idempotency_key:randomUUID()},alice)).body.id;
   const image=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();const b={media_type:'image/png',content_base64:image.toString('base64')};
   assert.equal((await request('add-money-requests/'+id+'/receipts','POST',b,bob)).status,404);
   assert.equal((await request('add-money-requests/'+id+'/receipts','POST',{...b,content_base64:'PHN2Zz48L3N2Zz4='},alice)).status,400);
   const r=await request('add-money-requests/'+id+'/receipts','POST',b,alice);assert.equal(r.status,201);receipt=r.body.id;
   assert.equal((await request('admin/receipts/'+receipt,'GET',undefined,alice)).status,403);
   assert.equal((await request('admin/receipts/'+receipt,'GET',undefined,reviewer)).body.media_type,'image/png');
   assert.equal((await request('admin/receipts/'+receipt,'PATCH',{status:'approved'},reviewer)).status,400);
   assert.equal((await request('admin/receipts/'+receipt,'PATCH',{status:'reviewed',note:'Unverified fixture'},reviewer)).status,200);
   assert.equal((await request('add-money-requests/'+id+'/receipts','POST',{...b,content_base64:Buffer.from('89504e470d0a1a0a','hex').toString('base64')},alice)).status,400);
  });
  await t.test('KYC and all financial posting remain disabled, audits immutable',async()=>{assert.equal((await request('kyc','GET',undefined,alice)).body.documentsAccepted,false);for(const path of ['payments','transfers','wallet/credit','wallet/debit','kyc/documents'])assert.equal((await request(path,'POST',{},alice)).status,503);for(const table of ['ledger_entries','ledger_journals','transactions'])assert.equal((await pool.query('SELECT count(*) FROM '+table)).rows[0].count,'0');await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('blocked')"),/Service not yet available/);await assert.rejects(()=>pool.query('DELETE FROM audit_logs'),/Service not yet available/);assert((await pool.query("SELECT 1 FROM audit_logs WHERE action='admin.receipt.view' AND target=$1",[receipt])).rowCount);});
  await t.test('sample review is disabled unless explicitly enabled',async()=>{
   assert.deepEqual((await request('staging-identity-samples','GET',undefined,alice)).body,{enabled:false,submission:null});
   assert.equal((await request('staging-identity-samples','POST',{},alice)).status,503);
   assert.equal((await request('admin/staging-identity-samples','GET',undefined,admin)).status,503);
  });
  await t.test('role management cannot self-escalate and revokes target sessions',async()=>{
   const id=(await pool.query("SELECT id FROM customers WHERE email='support@example.com'")).rows[0].id;
   assert.equal((await request('admin/user-role','PATCH',{id,role:'admin'},support)).status,403);
   assert.equal((await request('admin/user-role','PATCH',{id,role:'reviewer'},admin)).status,200);
   assert.equal((await request('admin/support','GET',undefined,support)).status,401);
   const own=(await pool.query("SELECT id FROM customers WHERE email='admin@example.com'")).rows[0].id;
   assert.equal((await request('admin/user-role','PATCH',{id:own,role:'customer'},admin)).status,400);
  });
  await t.test('role revocation applies to existing sessions',async()=>{await pool.query("UPDATE customers SET role='customer' WHERE email='reviewer@example.com'");assert.equal((await request('admin/receipts','GET',undefined,reviewer)).status,403);});
 });
} finally {if(child){child.kill();if(child.exitCode===null)await once(child,'exit');}await pool.end();}
