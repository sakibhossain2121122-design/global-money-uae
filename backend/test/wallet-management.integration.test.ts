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
async function request(path:string,method='GET',body?:unknown,token?:string){const r=await fetch('http://127.0.0.1:3110/v1/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try {
 await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gm_app') THEN CREATE ROLE gm_app NOLOGIN; END IF; END $$");
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'7');
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:url,PORT:'3110'},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:3110/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const tokens:Record<string,string>={};
 for(const name of ['alice','bob','admin','reviewer','support']){const credentials={email:name+'@example.com',password:'A secure password 123!',name};await request('auth/register','POST',credentials);if(['admin','reviewer','support'].includes(name))await pool.query('UPDATE customers SET role=$1 WHERE email=$2',[name,credentials.email]);tokens[name]=(await request('auth/login','POST',credentials)).body.token;}
 const {alice,bob,admin,reviewer,support}=tokens;
 const aliceId=(await pool.query("SELECT id FROM customers WHERE email='alice@example.com'")).rows[0].id;
 let ben='',requestId='';
 await test('funded wallet reservation and review security',async t=>{
  await t.test('configuration is admin-only and rejects malformed values',async()=>{
   for(const path of ['fees','countries','payment-methods','reservation-journals'])assert.equal((await request('admin/'+path,'GET',undefined,alice)).status,403);
   assert.equal((await request('admin/fees','POST',{provider:'bKash',flat_aed:'2',enabled:true},admin)).status,200);
   assert.equal((await request('admin/countries','POST',{code:'BD',name:'Bangladesh',enabled:true},admin)).status,200);
   assert.equal((await request('admin/fees','POST',{provider:'bKash',flat_aed:'-1',enabled:true},admin)).status,400);
   assert.equal((await request('admin/payment-methods','POST',{id:'fixture',name:'Fixture method',country:'AE',currency:'AED',display_order:12,enabled:true,request_enabled:false},admin)).status,200);
   assert(!(await request('add-money-request-methods','GET',undefined,alice)).body.some((x:{id:string})=>x.id==='fixture'));
   assert.equal((await request('add-money-requests','POST',{payment_method_id:'fixture',amount_aed:'1',idempotency_key:randomUUID()},alice)).status,400);
  });
  await t.test('unprovisioned wallets remain unknown, never fabricated balances',async()=>{
   const w=(await request('wallet','GET',undefined,alice)).body;assert.equal(w.balance,null);assert.equal(w.available,null);
   assert.equal((await request('request-history','GET',undefined,bob)).body.length,0);
  });
  await t.test('disposable owner-only funding fixture preserves balanced ledger and restores denial triggers',async()=>{
   // Synthetic fixture in this isolated _test database only. No funding API exists.
   const c=await pool.connect();try{await c.query('BEGIN');
    await c.query('ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled');await c.query('ALTER TABLE ledger_journals DISABLE TRIGGER journals_disabled');
    const w=(await c.query("INSERT INTO wallets(customer_id,currency,kind) VALUES($1,'AED','customer') RETURNING id",[aliceId])).rows[0].id;
    const clearing=(await c.query("INSERT INTO wallets(currency,kind) VALUES('AED','clearing') RETURNING id")).rows[0].id;
    const journal=(await c.query("INSERT INTO ledger_journals(idempotency_key) VALUES('isolated-test-fixture-only') RETURNING id")).rows[0].id;
    await c.query('INSERT INTO ledger_entries(journal_id,wallet_id,amount_minor) VALUES($1,$2,10000),($1,$3,-10000)',[journal,w,clearing]);
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ALTER TABLE ledger_entries ENABLE TRIGGER posting_disabled');await c.query('ALTER TABLE ledger_journals ENABLE TRIGGER journals_disabled');await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   const w=(await request('wallet','GET',undefined,alice)).body;assert.equal(w.available,'100.00');assert.equal(w.held,'0.00');assert.equal(w.postingEnabled,false);
   await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('still-blocked')"),/Service not yet available/);
  });
  await t.test('owned recipients for every provider are validated; server snapshots recipient and fee',async()=>{
   for(const provider of ['bKash','Nagad','Rocket','Upay','Bank']) {
    const r=await request('beneficiaries','POST',{name:'Isolated fixture',provider,account:provider==='Bank'?'TEST123456':'01712345678',bank:provider==='Bank'?'Test bank':null},alice);assert.equal(r.status,201);if(provider==='bKash')ben=r.body.id;
   }
   assert.equal((await request('send-money-requests','POST',{amount_aed:'30',beneficiary_id:ben,idempotency_key:randomUUID()},alice)).status,409);
   const r=await request('send-money-requests','POST',{amount_aed:'30',expected_fee_aed:'2.00',beneficiary_id:ben,idempotency_key:randomUUID()},alice);assert.equal(r.status,201);requestId=r.body.id;
   const w=(await request('wallet','GET',undefined,alice)).body;assert.equal(w.available,'68.00');assert.equal(w.held,'32.00');
   const row=(await request('request-history','GET',undefined,alice)).body[0];assert.equal(row.fee_aed,'2.00');assert.equal(row.recipient_snapshot.provider,'bKash');assert.equal(row.settlement_verified,false);
   assert.equal((await request('request-history','GET',undefined,bob)).body.length,0);
  });
  await t.test('approval/processing require reservation, never create successful payouts, rejection releases exactly once',async()=>{
   assert.equal((await request('admin/send-money-requests/'+requestId,'PATCH',{status:'processing',expected_status:'pending'},reviewer)).status,409);
   for(const [expected_status,status] of [['pending','approved'],['approved','processing'],['processing','rejected']])assert.equal((await request('admin/send-money-requests/'+requestId,'PATCH',{expected_status,status},reviewer)).status,200);
   assert.equal((await request('admin/send-money-requests/'+requestId,'PATCH',{status:'rejected',expected_status:'rejected'},reviewer)).status,200);
   const w=(await request('wallet','GET',undefined,alice)).body;assert.equal(w.available,'100.00');assert.equal(w.held,'0.00');
   assert.equal((await pool.query('SELECT count(*) FROM reservation_journals WHERE request_id=$1',[requestId])).rows[0].count,'2');
   assert.equal((await request('admin/send-money-requests/'+requestId,'PATCH',{status:'successful',expected_status:'rejected'},admin)).status,400);
   await assert.rejects(()=>pool.query("UPDATE service_requests SET status='successful' WHERE id=$1",[requestId]),/Independently verified settlement/);
   await assert.rejects(()=>pool.query('DELETE FROM reservation_journals'),/Service not yet available/);
  });
  await t.test('concurrent submissions cannot overspend; rejected insufficient request rolls back fully',async()=>{
   const submit=()=>request('send-money-requests','POST',{amount_aed:'70',expected_fee_aed:'2.00',beneficiary_id:ben,idempotency_key:randomUUID()},alice);
   const r=await Promise.all([submit(),submit()]);assert.deepEqual(r.map(x=>x.status).sort(),[201,400]);
   assert.equal((await request('wallet','GET',undefined,alice)).body.available,'28.00');
   const journals=(await pool.query('SELECT available_delta_minor,held_delta_minor FROM reservation_journals')).rows;
   assert(journals.every(x=>BigInt(x.available_delta_minor)+BigInt(x.held_delta_minor)===0n));
   const id=r.find(x=>x.status===201)!.body.id;
   await request('admin/send-money-requests/'+id,'PATCH',{status:'cancelled',expected_status:'pending'},admin);
   assert.equal((await request('wallet','GET',undefined,alice)).body.available,'100.00');
  });
  await t.test('Add Money approval requires reviewed evidence and never credits a wallet',async()=>{
   const id=(await request('add-money-requests','POST',{amount_aed:'10',payment_method_id:'adcb',idempotency_key:randomUUID()},alice)).body.id;
   assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status:'approved',expected_status:'pending'},admin)).status,409);
   const image=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
   const receipt=(await request('add-money-requests/'+id+'/receipts','POST',{media_type:'image/png',content_base64:image.toString('base64')},alice)).body.id;
   await request('admin/receipts/'+receipt,'PATCH',{status:'reviewed'},reviewer);
   assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status:'approved',expected_status:'pending'},admin)).status,200);
   assert.equal((await request('wallet','GET',undefined,alice)).body.balance,'100.00');
   assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
  });
  await t.test('self-approval, inactive actors and PUBLIC reservation execution are denied',async()=>{
   const own=(await request('add-money-requests','POST',{amount_aed:'101',payment_method_id:'adcb',idempotency_key:randomUUID()},admin)).body.id;
   assert.equal((await request('admin/add-money-requests/'+own,'PATCH',{status:'approved',expected_status:'pending'},admin)).status,403);
   await pool.query("UPDATE customers SET status='suspended' WHERE id=$1",[aliceId]);
   await assert.rejects(()=>pool.query("SELECT reserve_request($1,$2,'hold')",[requestId,aliceId]),/Forbidden/);
   await pool.query("UPDATE customers SET status='active' WHERE id=$1",[aliceId]);
   await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reservation_probe') THEN CREATE ROLE reservation_probe NOLOGIN; END IF; END $$");
   await pool.query('GRANT USAGE ON SCHEMA public TO reservation_probe');
   const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE reservation_probe');await assert.rejects(()=>c.query("SELECT reserve_request($1,$2,'hold')",[requestId,aliceId]),/permission denied for function/);}finally{await c.query('ROLLBACK');c.release();}
  });
  await t.test('runtime role can execute validated reservations but cannot insert journals directly',async()=>{
   const c=await pool.connect();try{
    await c.query('BEGIN');await c.query('SET LOCAL ROLE gm_app');
    await c.query("SELECT reserve_request($1,$2,'hold')",[requestId,aliceId]);
    await c.query('SELECT * FROM reservation_journals LIMIT 1');
    await assert.rejects(()=>c.query('INSERT INTO reservation_journals DEFAULT VALUES'),/permission denied for table/);
   }finally{await c.query('ROLLBACK');c.release();}
  });
  await t.test('country disable and financial denial safeguards remain effective',async()=>{
   await request('admin/countries','POST',{code:'BD',name:'Bangladesh',enabled:false},admin);
   assert.equal((await request('send-money-requests','POST',{amount_aed:'1',beneficiary_id:ben,idempotency_key:randomUUID()},alice)).status,409);
   for(const path of ['payments','transfers','wallet/credit','wallet/debit','kyc/documents'])assert.equal((await request(path,'POST',{},alice)).status,503);
   assert.equal((await pool.query('SELECT count(*) FROM transactions')).rows[0].count,'0');
  });
 });
} finally {if(child){child.kill();if(child.exitCode===null)await once(child,'exit');}await pool.end();}
