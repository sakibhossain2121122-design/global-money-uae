import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {requestJson} from './http-client.ts';
import {createTestRuntime} from './runtime-role.ts';
const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith('_test'))throw Error('Disposable TEST_DATABASE_URL ending in _test required');
const pool=new pg.Pool({connectionString:url});
let child:ReturnType<typeof spawn>|undefined;
let runtime:Awaited<ReturnType<typeof createTestRuntime>>|undefined;
const request=(path:string,method='GET',body?:unknown,bearer?:string)=>requestJson('http://127.0.0.1:3112/v1/'+path,method,body,bearer);
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 // Upgrade an existing 012 database with duplicate legacy mobile numbers. Never reassign ownership.
 const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/^0[0-9]{2}_.*\.sql$/.test(file) && file<'013').sort();
 await pool.query('CREATE TABLE schema_migrations(version text PRIMARY KEY)');
 for(const file of files){await pool.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));await pool.query('INSERT INTO schema_migrations VALUES($1)',[file.slice(0,3)]);}
 await pool.query("INSERT INTO customers(email,name,password_hash,mobile_uae) VALUES('legacy-one@example.com','One','unused','+971509999999'),('legacy-two@example.com','Two','unused','+971509999999')");
 await test('duplicate legacy mobiles abort migration atomically without deleting or reassigning customers',async()=>{
  assert.throws(()=>execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'}),/customers_mobile_uae_unique/);
  assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'12');
  assert.equal((await pool.query("SELECT count(*) FROM customers WHERE mobile_uae='+971509999999'")).rows[0].count,'2');
  assert.equal((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='identity_kind'")).rows[0].count,'0');
 });
 // Remove only these duplicate fixtures in the disposable DB before the successful upgrade/replay.
 await pool.query("DELETE FROM customers WHERE email IN ('legacy-one@example.com','legacy-two@example.com')");
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 runtime=await createTestRuntime(pool,url);
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime.url,PORT:'3112'},stdio:['ignore','ignore','pipe']});
 child.stderr?.on('data',()=>{});
 let ready=false;
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3112/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
 const password='A secure password 123!';
 const registration={email:'mobile@example.com',name:'Customer',mobile_uae:'+971501234567',identity_kind:'passport',password};
 await test('automatic registration requires no OTP, preserves unverified status and prevents duplicate mobile takeover',async()=>{
  assert.equal((await request('auth/register','POST',{...registration,identity_kind:'national_id'})).status,400);
  assert.equal((await request('auth/register','POST',registration)).status,202);
  const first=(await pool.query('SELECT id,status,registration_status,identity_kind FROM customers WHERE email=$1',[registration.email])).rows[0];
  assert.equal(first.status,'active');assert.equal(first.registration_status,'pending');assert.equal(first.identity_kind,'passport');
  assert.equal((await request('auth/register','POST',{...registration,email:'other@example.com',password:'Different password 123!'})).status,202);
  assert.equal((await pool.query('SELECT count(*) FROM customers WHERE mobile_uae=$1',[registration.mobile_uae])).rows[0].count,'1');
  assert.equal((await pool.query('SELECT id FROM customers WHERE email=$1',[registration.email])).rows[0].id,first.id);
 });
 const mobileLogin=await request('auth/login','POST',{mobile_uae:registration.mobile_uae,password});
 assert.equal(mobileLogin.status,200);const customer=mobileLogin.body.token;
 await request('auth/register','POST',{email:'admin@example.com',name:'Admin',password});
 await pool.query("UPDATE customers SET role='admin' WHERE email='admin@example.com'");
 const admin=(await request('auth/login','POST',{email:'admin@example.com',password})).body.token;
 await test('mobile password login, legacy email access, suspension and session revocation',async()=>{
  assert.equal((await request('auth/login','POST',{mobile_uae:registration.mobile_uae,password:'Wrong password 123!'})).status,401);
  assert.equal((await request('auth/login','POST',{mobile_uae:'+971509999999',password})).status,401);
  assert.equal((await request('auth/login','POST',{mobile_uae:registration.mobile_uae,email:registration.email,password})).status,400);
  const profile=(await request('me','GET',undefined,customer)).body;
  assert.equal(profile.mobile_uae,registration.mobile_uae);assert.equal(profile.identity_kind,'passport');
  assert.equal((await request('admin/users','PATCH',{id:profile.id,status:'suspended'},admin)).status,200);
  assert.equal((await request('me','GET',undefined,customer)).status,401);
  assert.equal((await request('auth/login','POST',{mobile_uae:registration.mobile_uae,password})).status,401);
  await request('admin/users','PATCH',{id:profile.id,status:'active'},admin);
 });
 const bearer=(await request('auth/login','POST',{mobile_uae:registration.mobile_uae,password})).body.token;
 const account={payment_method_id:'adcb',account_holder:'Example Company',account_number:'12345678',iban:null,instructions:'Reference information only',qr_payload:'ACCOUNT-REFERENCE-123'};
 await test('authenticated payment detail navigation and audited admin editing obey enable/archive/catalog controls',async()=>{
  const methods=(await request('payment-methods','GET',undefined,bearer)).body;
  for(const key of ['botim_money','e_money','adcb','emirates_nbd','adib'])assert(methods.some((m:{id:string})=>m.id===key));
  assert(methods.every((m:{enabled:boolean})=>m.enabled===false));
  assert.equal((await request('payment-methods/adcb')).status,401);
  assert.equal((await request('admin/payment-accounts','POST',account,bearer)).status,403);
  const created=await request('admin/payment-accounts','POST',account,admin);assert.equal(created.status,201);const id=created.body.id;
  assert.equal(created.body.enabled,false);
  const details=async()=>(await request('payment-methods/adcb','GET',undefined,bearer)).body;
  assert.deepEqual((await details()).accounts,[]);
  await request('admin/payment-accounts','PATCH',{id,enabled:true},admin);
  const visible=await details();assert.equal(visible.paymentsEnabled,false);assert.equal(visible.postingEnabled,false);
  assert.equal(visible.accounts[0].account_holder,account.account_holder);assert.equal(visible.accounts[0].qr_payload,account.qr_payload);
  assert.equal((await request('admin/payment-accounts/'+id,'PUT',account,bearer)).status,403);
  assert.equal((await request('admin/payment-accounts/'+id,'PUT',{...account,qr_payload:{}},admin)).status,400);
  assert.equal((await request('admin/payment-accounts/'+id,'PUT',{...account,enabled:true},admin)).status,400);
  assert.equal((await request('admin/payment-accounts/'+id,'PUT',{...account,account_holder:'Updated Company',qr_payload:null},admin)).status,200);
  const updated=(await details()).accounts[0];assert.equal(updated.account_holder,'Updated Company');assert.equal(updated.qr_payload,null);
  await request('admin/payment-accounts','PATCH',{id,enabled:false},admin);assert.deepEqual((await details()).accounts,[]);
  await request('admin/payment-accounts','PATCH',{id,enabled:true},admin);
  await request('admin/payment-accounts/'+id,'DELETE',undefined,admin);assert.deepEqual((await details()).accounts,[]);
  assert.equal((await request('admin/payment-accounts/'+id,'PUT',account,admin)).status,404);
  await pool.query("UPDATE payment_methods SET catalog_visible=false WHERE id='adcb'");
  assert.equal((await request('payment-methods/adcb','GET',undefined,bearer)).status,404);
  const actions=(await pool.query('SELECT action FROM audit_logs WHERE target=$1',[id])).rows.map(r=>r.action);
  for(const action of ['admin.payment_account.create','admin.payment_account.details','admin.payment_account.status','admin.payment_account.archive'])assert(actions.includes(action));
 });
 await test('payment configuration never executes payments, credits, payouts or KYC uploads',async()=>{
  for(const path of ['wallet/credit','wallet/debit','payments','transfers','kyc/documents'])assert.equal((await request(path,'POST',{},bearer)).status,503);
  assert.equal((await request('kyc','GET',undefined,bearer)).body.documentsAccepted,false);
  assert.equal((await pool.query('SELECT count(*) FROM ledger_entries')).rows[0].count,'0');
  await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('still-blocked')"),/Service not yet available/);
 });
} finally {
 if(child){child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}
 if(runtime)await runtime.cleanup();await pool.end();
}
