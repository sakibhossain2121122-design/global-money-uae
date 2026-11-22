import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {requestJson} from './http-client.ts';
import {createTestRuntime} from './runtime-role.ts';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Disposable TEST_DATABASE_URL ending in _test required');
const pool=new pg.Pool({connectionString:url});
const endpoint='http://127.0.0.1:3108/v1/';
let child:ReturnType<typeof spawn>|undefined;
let runtime:Awaited<ReturnType<typeof createTestRuntime>>|undefined;
async function request(path:string,method='GET',body?:unknown,bearer?:string){
 return requestJson(endpoint+path,method,body,bearer);
}
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'11');
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 // Exercise an upgrade from 003 with existing request/event history, not just an empty database.
 for(const file of ['001_foundation.sql','002_payment_methods.sql','003_admin_controls.sql'])await pool.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await pool.query("CREATE TABLE schema_migrations(version text PRIMARY KEY); INSERT INTO schema_migrations VALUES('001'),('002'),('003')");
 const legacyCustomer=(await pool.query("INSERT INTO customers(email,password_hash,name) VALUES('legacy@example.com','unused','Legacy') RETURNING id")).rows[0].id;
 const legacy=(await pool.query("INSERT INTO service_requests(customer_id,request_type,amount_aed) VALUES($1,'send_money',10) RETURNING id",[legacyCustomer])).rows[0].id;
 await pool.query("INSERT INTO service_request_events(request_id,actor_id,new_status) VALUES($1,$2,'pending')",[legacy,legacyCustomer]);
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'11');
 assert.equal((await pool.query('SELECT status FROM service_requests WHERE id=$1',[legacy])).rows[0].status,'pending');
 assert.equal((await pool.query('SELECT count(*) FROM service_request_events WHERE request_id=$1',[legacy])).rows[0].count,'1');
 runtime=await createTestRuntime(pool,url);
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime.url,PORT:'3108'},stdio:['ignore','ignore','pipe']});
 child.stderr?.on('data',()=>{});
 let ready=false;for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3108/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
 const password='A secure password 123!';
 for(const name of ['alice','bob','admin'])await request('auth/register','POST',{email:name+'@example.com',password,name});
 await pool.query("UPDATE customers SET role='admin' WHERE email='admin@example.com'");
 const login=async(name:string)=>(await request('auth/login','POST',{email:name+'@example.com',password})).body.token as string;
 const alice=await login('alice'),bob=await login('bob'),admin=await login('admin');
 const draft={amount_aed:'12.34',payment_method_id:'adcb',note:'Please review',idempotency_key:randomUUID()};
 let id='';
 await test('authenticated intake, ownership, idempotency and audited admin review',async t=>{
  await t.test('catalog changes are admin-only and never enable financial operations',async()=>{
   const edit={id:'bd_bkash',name:'bKash review',logo_url:'https://assets.example/logo.png',display_order:5,catalog_visible:false};
   assert.equal((await request('admin/method-catalog','GET')).status,401);
   assert.equal((await request('admin/method-catalog','PATCH',edit,alice)).status,403);
   assert.equal((await request('admin/method-catalog','PATCH',{...edit,logo_url:'https://assets.example/logo?token=secret'},admin)).status,400);
   assert.equal((await request('admin/method-catalog','PATCH',{...edit,enabled:true},admin)).status,400);
   assert.equal((await request('admin/method-catalog','PATCH',edit,admin)).status,200);
   const hidden=(await request('payment-methods','GET',undefined,alice)).body;
   assert(!hidden.some((method:{id:string})=>method.id==='bd_bkash'));
   assert(hidden.every((method:{enabled:boolean})=>method.enabled===false));
   assert.equal((await pool.query("SELECT enabled FROM payment_methods WHERE id='bd_bkash'")).rows[0].enabled,false);
   assert.equal((await pool.query("SELECT count(*) FROM admin_control_events WHERE action='admin.method_catalog.update' AND target_id='bd_bkash'")).rows[0].count,'1');
   assert.equal((await request('admin/method-catalog','PATCH',{...edit,catalog_visible:true},admin)).status,200);
   const visible=(await request('payment-methods','GET',undefined,alice)).body;
   const bkash=visible.find((method:{id:string})=>method.id==='bd_bkash');
   assert.equal(bkash.name,'bKash review');
   assert.equal(bkash.logo_url,null);
   const bd=visible.filter((method:{country:string})=>method.country==='BD');
   assert.deepEqual(bd.map((method:{id:string})=>method.id),['bd_nagad','bd_rocket','bd_upay','bd_bank','bd_bkash']);
   assert.equal((await request('admin/method-catalog','PATCH',{...edit,name:'bKash',display_order:1,catalog_visible:true,logo_url:null},admin)).status,200);
   const adcb={id:'adcb',name:'ADCB Bank',logo_url:null,display_order:3,catalog_visible:false};
   assert.equal((await request('admin/method-catalog','PATCH',adcb,admin)).status,200);
   assert(!(await request('add-money-request-methods','GET',undefined,alice)).body.some((method:{id:string})=>method.id==='adcb'));
   assert.equal((await request('add-money-requests','POST',draft,alice)).status,400);
   assert.equal((await request('admin/method-catalog','PATCH',{...adcb,catalog_visible:true},admin)).status,200);
  });
  await t.test('anonymous and customers cannot use admin APIs or forge actors',async()=>{
   assert.equal((await request('add-money-requests','POST',draft)).status,401);
   assert.equal((await request('add-money-requests')).status,401);
   for(const token of [undefined,alice]){
    const expected=token?403:401;
    assert.equal((await request('admin/add-money-requests','GET',undefined,token)).status,expected);
    assert.equal((await request('admin/add-money-requests/'+legacy,'PATCH',{status:'rejected',expected_status:'pending'},token)).status,expected);
    assert.equal((await request('admin/add-money-requests/'+legacy+'/events','GET',undefined,token)).status,expected);
   }
   assert.equal((await request('add-money-requests','POST',{...draft,customer_id:legacyCustomer},alice)).status,400);
  });
  await t.test('amounts, notes, references, currency and document payloads validated',async()=>{
   for(const amount_aed of ['0','-1','1.001','1e3','1000000.01',1])assert.equal((await request('add-money-requests','POST',{...draft,amount_aed},alice)).status,400);
   for(const extra of [{payment_method_id:'missing'},{note:'x'.repeat(501)},{currency:'USD'},{receipt:'not accepted'},{status:'paid'}])assert.equal((await request('add-money-requests','POST',{...draft,...extra},alice)).status,400);
   const r=await fetch(endpoint+'add-money-requests',{method:'POST',headers:{Authorization:'Bearer '+alice,'Content-Type':'multipart/form-data'},body:'not-a-document'});assert.equal(r.status,415);
  });
  await t.test('simultaneous retries produce one request and one creation event',async()=>{
   const results=await Promise.all([request('add-money-requests','POST',draft,alice),request('add-money-requests','POST',draft,alice)]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].body.id,results[1].body.id);id=results[0].body.id;
   assert.equal(results[0].body.postingEnabled,false);
   assert.equal((await pool.query('SELECT count(*) FROM service_request_events WHERE request_id=$1',[id])).rows[0].count,'1');
   assert.equal((await request('add-money-requests','POST',{...draft,amount_aed:'13'},alice)).status,409);
   assert.equal((await request('add-money-requests','POST',{...draft,idempotency_key:randomUUID()},alice)).status,409);
  });
  await t.test('history and details only expose owned requests, customer edits prohibited',async()=>{
   assert.equal((await request('add-money-requests','GET',undefined,bob)).body.length,0);
   const history=(await request('add-money-requests','GET',undefined,alice)).body;assert.equal(history.length,1);assert.equal(history[0].id,id);assert.equal(history[0].amount_aed,'12.34');
   assert.equal((await request('add-money-requests/'+id,'GET',undefined,bob)).status,404);
   assert.equal((await request('add-money-requests/'+id,'GET',undefined,alice)).status,200);
   assert.equal((await request('add-money-requests/'+id,'PATCH',{status:'cancelled'},alice)).status,404);
   assert.equal((await request('add-money-requests/'+id,'DELETE',undefined,alice)).status,404);
  });
  await t.test('request keys are scoped to the authenticated customer',async()=>{
   const own=await request('add-money-requests','POST',draft,bob);assert.equal(own.status,201);assert.notEqual(own.body.id,id);
  });
  await t.test('admin statuses are constrained and stale reviews cannot overwrite',async()=>{
   assert.equal((await request('admin/add-money-requests','GET',undefined,admin)).body.length,2);
   for(const status of ['paid','approved','credited'])assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status,expected_status:'pending'},admin)).status,400);
   const r=await request('admin/add-money-requests/'+id,'PATCH',{status:'under_review',expected_status:'pending',note:'Reviewing request only'},admin);assert.equal(r.status,200);assert.equal(r.body.postingEnabled,false);
   assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status:'rejected',expected_status:'pending'},admin)).status,409);
   const detail=(await request('add-money-requests/'+id,'GET',undefined,alice)).body;assert.equal(detail.status,'under_review');assert(!('admin_note' in detail));
  });
  await t.test('review changes and audit events commit together, no-op does not duplicate',async()=>{
   for(const [expected_status,status] of [['under_review','rejected'],['rejected','pending'],['pending','cancelled']])assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status,expected_status,note:'Review note'},admin)).status,200);
   assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status:'cancelled',expected_status:'cancelled'},admin)).status,200);
   const events=(await request('admin/add-money-requests/'+id+'/events','GET',undefined,admin)).body;
   assert.deepEqual(events.map((e:{new_status:string})=>e.new_status),['pending','under_review','rejected','pending','cancelled']);
   assert(events.every((e:{actor_id:string})=>e.actor_id));
   assert.equal((await request('admin/add-money-requests/'+randomUUID()+'/events','GET',undefined,admin)).status,404);
   const audits=(await pool.query('SELECT action FROM audit_logs WHERE target=$1',[id])).rows.map(r=>r.action);assert(audits.includes('add_money_request.submitted'));assert(audits.includes('admin.add_money_request.cancelled'));
  });
  await t.test('concurrent reviewers have one winner and one event',async()=>{
   const newDraft={...draft,note:'Concurrent review',idempotency_key:randomUUID()};
   const created=(await request('add-money-requests','POST',newDraft,alice)).body.id;
   const results=await Promise.all(['under_review','rejected'].map(status=>request('admin/add-money-requests/'+created,'PATCH',{status,expected_status:'pending'},admin)));
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   assert.equal((await pool.query('SELECT count(*) FROM service_request_events WHERE request_id=$1',[created])).rows[0].count,'2');
  });
  await t.test('legacy requests remain visible only to appropriate users',async()=>{
   assert.equal((await request('add-money-requests/'+legacy,'GET',undefined,alice)).status,404);
   assert.equal((await request('admin/add-money-requests/'+legacy,'PATCH',{status:'rejected',expected_status:'pending'},admin)).status,404);
  });
  if(process.env.TEST_LOOPBACK_ONLY==='1' && child) {
   child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');
   child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime!.url,PORT:'3108'},stdio:['ignore','ignore','pipe']});
   child.stderr?.on('data',()=>{});
   let ready=false;for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3108/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
  }
  await t.test('admin Add Money, UAE account and Bangladesh bank controls are authorized and audited',async()=>{
   for(const path of ['payment-methods','payment-accounts','payout-banks']){
    assert.equal((await request('admin/'+path)).status,401);
    assert.equal((await request('admin/'+path,'GET',undefined,alice)).status,403);
   }
   const protectedChanges=[
    ['payment-methods','PATCH',{id:'adcb',add_money_request_enabled:false}],
    ['payment-accounts','POST',{payment_method_id:'adcb',account_holder:'Example',account_number:'12345678'}],
    ['payment-accounts','PATCH',{id:randomUUID(),enabled:true}],
    ['payment-accounts/'+randomUUID(),'DELETE',undefined],
    ['payout-banks','POST',{name:'Example Bank'}],
    ['payout-banks','PATCH',{id:randomUUID(),enabled:true}],
    ['payout-banks/'+randomUUID(),'DELETE',undefined]
   ] as const;
   for(const [path,method,body] of protectedChanges){
    assert.equal((await request('admin/'+path,method,body)).status,401);
    assert.equal((await request('admin/'+path,method,body,alice)).status,403);
   }
   const methods=(await request('admin/payment-methods','GET',undefined,admin)).body;
   assert(methods.length>0);
   assert(methods.every((method:{add_money_request_enabled:boolean})=>method.add_money_request_enabled));
   assert.equal((await request('admin/payment-methods','PATCH',{id:'adcb',add_money_request_enabled:'false'},admin)).status,400);
   assert.equal((await request('admin/payment-methods','PATCH',{id:'adcb',add_money_request_enabled:false,enabled:true},admin)).status,400);
   assert.equal((await request('admin/payment-methods','PATCH',{id:'adcb',add_money_request_enabled:false},alice)).status,403);
   assert.equal((await request('admin/payment-methods','PATCH',{id:'adcb',add_money_request_enabled:false},admin)).status,200);
   assert(!(await request('add-money-request-methods','GET',undefined,alice)).body.some((method:{id:string})=>method.id==='adcb'));
   assert.equal((await request('add-money-requests','POST',{...draft,idempotency_key:randomUUID()},alice)).status,400);
   assert.equal((await request('payment-methods','GET',undefined,alice)).body.every((method:{enabled:boolean})=>!method.enabled),true);
   assert.equal((await pool.query(
    "SELECT enabled FROM payment_methods WHERE id='adcb'"
   )).rows[0].enabled,false);
   assert.equal((await request('admin/payment-methods','PATCH',{id:'adcb',add_money_request_enabled:true},admin)).status,200);

   const accountData={payment_method_id:'adcb',account_holder:'Example UAE LLC',account_number:'1234567890'};
   for(const input of [{...accountData,enabled:true},{...accountData,account_number:123456}])
    assert.equal((await request('admin/payment-accounts','POST',input,admin)).status,400);
   assert.equal((await request('admin/payment-accounts','POST',accountData,alice)).status,403);
   const createdAccount=await request('admin/payment-accounts','POST',accountData,admin);
   assert.equal(createdAccount.status,201);
   assert.equal(createdAccount.body.enabled,false);
   const accountId=createdAccount.body.id as string;
   assert.equal((await request('admin/payment-accounts','PATCH',{id:accountId,enabled:true},admin)).status,200);
   assert.equal((await request('admin/payment-accounts/'+accountId,'DELETE',undefined,admin)).body.archived,true);
   assert.equal((await request('admin/payment-accounts','PATCH',{id:accountId,enabled:true},admin)).status,404);
   const accountAudits=(await pool.query(
    'SELECT action FROM admin_control_events WHERE target_id=$1',[accountId]
   )).rows.map(row=>row.action);
   assert.deepEqual(accountAudits,[
    'admin.payment_account.create',
    'admin.payment_account.status',
    'admin.payment_account.archive'
   ]);
   const accountLog=(await pool.query(
    'SELECT action FROM audit_logs WHERE target=$1 ORDER BY id',[accountId]
   )).rows.map(row=>row.action);
   assert.deepEqual(accountLog,accountAudits);

   assert.equal((await request('admin/payout-banks','POST',{name:'  '},admin)).status,400);
   assert.equal((await request('admin/payout-banks','POST',{name:'Example Bank',country:'US'},admin)).status,400);
   assert.equal((await request('admin/payout-banks','POST',{name:'Example Bank'},alice)).status,403);
   const createdBank=await request('admin/payout-banks','POST',{name:'Example Bank'},admin);
   assert.equal(createdBank.status,201);
   assert.equal(createdBank.body.country,'BD');
   assert.equal(createdBank.body.enabled,false);
   const bankId=createdBank.body.id as string;
   const duplicateBank=await request('admin/payout-banks','POST',{name:' example bank '},admin);
   assert.equal(duplicateBank.status,409);
   assert.equal(duplicateBank.body.error,'Payout bank already exists');
   assert.equal((await request('admin/payout-banks','PATCH',{id:bankId,enabled:true},admin)).status,200);
   assert.equal((await request('admin/payout-banks/'+bankId,'DELETE',undefined,admin)).body.archived,true);
   assert.equal((await request('admin/payout-banks','PATCH',{id:bankId,enabled:true},admin)).status,404);
   const bankAudits=(await pool.query(
    'SELECT action FROM admin_control_events WHERE target_id=$1',[bankId]
   )).rows.map(row=>row.action);
   assert.deepEqual(bankAudits,[
    'admin.payout_bank.create',
    'admin.payout_bank.status',
    'admin.payout_bank.archive'
   ]);
   const bankLog=(await pool.query(
    'SELECT action FROM audit_logs WHERE target=$1 ORDER BY id',[bankId]
   )).rows.map(row=>row.action);
   assert.deepEqual(bankLog,bankAudits);
   assert.equal((await request('admin/payout-banks','POST',{name:' example bank '},admin)).status,201);
   assert((await pool.query(
    "SELECT action FROM audit_logs WHERE target=$1",
    ['adcb']
   )).rows.some(row=>row.action==='admin.add_money_method.request_availability'));
  });
  await t.test('financial posting is still impossible and there are no balance effects',async()=>{
   for(const path of ['add-money','payments','wallet/credit','wallet/debit','remittances'])assert.equal((await request(path,'POST',{},alice)).status,503);
   for(const table of ['ledger_journals','ledger_entries','transactions'])assert.equal((await pool.query('SELECT count(*) FROM '+table)).rows[0].count,'0');
   await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('never-post')"),/Service not yet available/);
   assert.equal((await request('wallet','GET',undefined,alice)).body.postingEnabled,false);
   assert((await request('payment-methods','GET',undefined,alice)).body.every((r:{enabled:boolean})=>!r.enabled));
  });
  await t.test('revoked administrator privileges are enforced on every change',async()=>{
   await pool.query("UPDATE customers SET role='customer' WHERE email='admin@example.com'");
   assert.equal((await request('admin/add-money-requests/'+id,'PATCH',{status:'pending',expected_status:'cancelled'},admin)).status,403);
  });
 });
 await test('HTTP rate limit returns 429 to a client exceeding the shared request budget',async()=>{
  const clientAddress='127.0.255.254';
  const loopbackOnly=process.env.TEST_LOOPBACK_ONLY==='1';
  const isolated=loopbackOnly?spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime!.url,PORT:'3110'},stdio:['ignore','ignore','pipe']}):undefined;
  isolated?.stderr?.on('data',()=>{});
  const health=`http://127.0.0.1:${loopbackOnly?'3110':'3108'}/health`;
  try {
   if(isolated) {
    let ready=false;for(let n=0;n<50;n++){try{if((await fetch(health)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
   }
   for(let i=0;i<(loopbackOnly?99:100);i++){
    assert.equal((await requestJson(health,'GET',undefined,undefined,clientAddress)).status,200);
   }
   const limited=await requestJson(health,'GET',undefined,undefined,clientAddress);
   assert.equal(limited.status,429);
   assert.deepEqual(limited.body,{error:'Too many requests'});
  } finally {if(isolated){isolated.kill('SIGTERM');if(isolated.exitCode===null)await once(isolated,'exit');}}
 });
}finally{if(child){child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}if(runtime)await runtime.cleanup();await pool.end();}
