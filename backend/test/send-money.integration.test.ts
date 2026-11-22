import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {requestJson} from './http-client.ts';
import {createTestRuntime} from './runtime-role.ts';

const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Disposable TEST_DATABASE_URL ending in _test required');
const pool=new pg.Pool({connectionString:url});
const endpoint='http://127.0.0.1:3111/v1/';
let child:ReturnType<typeof spawn>|undefined;
let runtime:Awaited<ReturnType<typeof createTestRuntime>>|undefined;
let runtimePool:pg.Pool|undefined;
const request=(path:string,method='GET',body?:unknown,bearer?:string)=>requestJson(endpoint+path,method,body,bearer);
async function restartApi() {
 if(child){child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime!.url,PORT:'3111'},stdio:['ignore','ignore','pipe']});
 child.stderr?.on('data',()=>{});
 let ready=false;
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3111/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'API did not restart');
}
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 const migrations=['001_foundation.sql','002_payment_methods.sql','003_admin_controls.sql','004_add_money_requests.sql',
  '005_admin_control_system.sql','006_admin_request_configuration.sql','007_receipt_review.sql','008_send_money_requests.sql'];
 for(const file of migrations)await pool.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await pool.query('CREATE TABLE schema_migrations(version text PRIMARY KEY)');
 for(const file of migrations)await pool.query('INSERT INTO schema_migrations(version) VALUES($1)',[file.slice(0,3)]);
 const legacyCustomer=(await pool.query("INSERT INTO customers(email,password_hash,name) VALUES('legacy-send@example.com','unused','Legacy') RETURNING id")).rows[0].id;
 const legacyWallet=(await pool.query("INSERT INTO wallets(customer_id,currency,kind) VALUES($1,'AED','customer') RETURNING id",[legacyCustomer])).rows[0].id;
 const legacyRequest=(await pool.query("INSERT INTO service_requests(customer_id,request_type,amount_aed) VALUES($1,'send_money',1.00) RETURNING id",[legacyCustomer])).rows[0].id;
 await pool.query(`INSERT INTO send_money_requests(request_id,customer_id,wallet_id,beneficiary_id,beneficiary_name,
  beneficiary_provider,beneficiary_account,amount_minor,idempotency_key,payout_reference)
  VALUES($1,$2,$3,$4,'Legacy recipient','bKash','01712345678',100,$5,'LEGACY-REF')`,
  [legacyRequest,legacyCustomer,legacyWallet,randomUUID(),randomUUID()]);
 await pool.query("INSERT INTO service_request_events(request_id,actor_id,new_status) VALUES($1,$2,'pending')",[legacyRequest,legacyCustomer]);
 await pool.query("INSERT INTO send_money_reference_events(request_id,actor_id,payout_reference) VALUES($1,$2,'LEGACY-REF')",[legacyRequest,legacyCustomer]);
 for(let i=0;i<2;i++)execFileSync(process.execPath,['src/migrate.ts'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
 await test('migrations 009 and 010 preserve existing 008 requests and history',async()=>{
  assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'12');
  assert.equal((await pool.query('SELECT payout_reference FROM send_money_requests WHERE request_id=$1',[legacyRequest])).rows[0].payout_reference,'LEGACY-REF');
  assert.equal((await pool.query('SELECT count(*) FROM send_money_reference_events WHERE request_id=$1',[legacyRequest])).rows[0].count,'1');
  await assert.rejects(()=>pool.query('DELETE FROM send_money_reference_events WHERE request_id=$1',[legacyRequest]),/append-only/);
 });
 runtime=await createTestRuntime(pool,url);
 runtimePool=new pg.Pool({connectionString:runtime.url});
 child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime.url,PORT:'3111'},stdio:['ignore','ignore','pipe']});
 child.stderr?.on('data',()=>{});
 let ready=false;
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:3111/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'API did not start');
 const password='Test-'+randomUUID()+'-Aa1!';
 for(const name of ['alice','bob','admin'])await request('auth/register','POST',{email:name+'@example.com',password,name});
 await pool.query("UPDATE customers SET role='admin' WHERE email='admin@example.com'");
 const login=async(name:string)=>(await request('auth/login','POST',{email:name+'@example.com',password})).body.token as string;
 const alice=await login('alice'),bob=await login('bob'),admin=await login('admin');
 const aliceId=(await request('me','GET',undefined,alice)).body.id as string;
 const beneficiary=async(account:string)=>(await request('beneficiaries','POST',{provider:'bKash',name:'Recipient',account},alice)).body.id as string;
 const first=await beneficiary('01712345678'),second=await beneficiary('01812345678');
 const path='send-money-requests';
 const draft={amount_aed:'70.00',beneficiary_id:first,idempotency_key:randomUUID()};
 await test('runtime login cannot mutate wallets, beneficiaries, ledger or audit history',async()=>{
  const role=(await runtimePool!.query('SELECT current_user AS name, rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.equal(role.name,runtime!.name);assert.equal(role.rolsuper,false);assert.equal(role.rolcreaterole,false);
  const publicAccess=await pool.query(`SELECT count(*) FROM pg_proc p, LATERAL aclexplode(p.proacl) a
   WHERE p.oid IN ('public.lock_send_money_beneficiary(uuid,uuid)'::regprocedure,'public.lock_send_money_wallet(uuid)'::regprocedure)
   AND a.grantee=0 AND a.privilege_type='EXECUTE'`);
  assert.equal(publicAccess.rows[0].count,'0');
  for(const sql of [
   "UPDATE wallets SET kind='clearing' WHERE false",
   "UPDATE beneficiaries SET name='changed' WHERE false",
   "INSERT INTO ledger_journals(idempotency_key) VALUES('forbidden')",
   "UPDATE audit_logs SET action='changed' WHERE false",
   "DELETE FROM admin_control_events WHERE false",
   "TRUNCATE add_money_receipt_events",
   "CREATE TABLE forbidden_runtime_ddl(id integer)"
  ]) await assert.rejects(()=>runtimePool!.query(sql),{code:'42501'});
 });
 await test('requests require an owned recipient and an existing wallet',async()=>{
  assert.equal((await request(path,'POST',draft)).status,401);
  assert.equal((await request(path,'POST',draft,bob)).status,404);
  assert.equal((await request(path,'POST',draft,alice)).status,409);
  assert.equal((await request(path,'POST',{...draft,status:'success'},alice)).status,400);
  assert.equal((await request(path,'POST',{...draft,recipient_verified:true},alice)).status,400);
  assert.equal((await request(path,'POST',{...draft,amount_aed:70},alice)).status,400);
  assert.equal((await request('admin/'+path,'GET',undefined,alice)).status,403);
  const invalidBank=(await request('beneficiaries','POST',{provider:'Bank',name:'Recipient',account:'---123',bank:'Example'},alice)).body.id;
  assert.equal((await request(path,'POST',{...draft,beneficiary_id:invalidBank,idempotency_key:randomUUID()},alice)).status,400);
  const invalidMobile=(await pool.query("INSERT INTO beneficiaries(customer_id,name,provider,account) VALUES($1,'Legacy','Nagad','not-a-number') RETURNING id",[aliceId])).rows[0].id;
  assert.equal((await request(path,'POST',{...draft,beneficiary_id:invalidMobile,idempotency_key:randomUUID()},alice)).status,400);
 });
 // Seed a balanced journal only in the disposable test database.
 await pool.query('ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled; ALTER TABLE ledger_journals DISABLE TRIGGER journals_disabled');
 try {
  const c=await pool.connect();
  try {
   await c.query('BEGIN');
   const customer=(await c.query("INSERT INTO wallets(customer_id,currency,kind) VALUES($1,'AED','customer') RETURNING id",[aliceId])).rows[0].id;
   const clearing=(await c.query("INSERT INTO wallets(currency,kind) VALUES('AED','clearing') RETURNING id")).rows[0].id;
   const journal=(await c.query("INSERT INTO ledger_journals(idempotency_key) VALUES('test-funding') RETURNING id")).rows[0].id;
   await c.query('INSERT INTO ledger_entries(journal_id,wallet_id,amount_minor) VALUES($1,$2,10000),($1,$3,-10000)',[journal,customer,clearing]);
   await c.query('COMMIT');
  } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
 } finally {await pool.query('ALTER TABLE ledger_entries ENABLE TRIGGER posting_disabled; ALTER TABLE ledger_journals ENABLE TRIGGER journals_disabled');}
 let heldId='',heldDraft=draft;
 await test('concurrent requests cannot over-reserve and retries are idempotent',async()=>{
  const alternative={...draft,beneficiary_id:second,idempotency_key:randomUUID()};
  const responses=await Promise.all([request(path,'POST',draft,alice),request(path,'POST',alternative,alice)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const index=responses.findIndex(r=>r.status===201);
  heldId=responses[index].body.id;heldDraft=index===0?draft:alternative;
  assert.equal((await request(path,'POST',heldDraft,alice)).body.id,heldId);
  assert.equal((await request(path,'POST',{...heldDraft,amount_aed:'5.00'},alice)).status,409);
  const wallet=(await request('wallet','GET',undefined,alice)).body;
  assert.equal(wallet.balance,'100.00');assert.equal(wallet.heldBalance,'70.00');assert.equal(wallet.availableBalance,'30.00');
  const runtimeClient=await runtimePool!.connect();
  try {
   const walletId=(await runtimeClient.query("SELECT id FROM wallets WHERE customer_id=$1 AND kind='customer'",[aliceId])).rows[0].id;
   await runtimeClient.query('CREATE TEMP TABLE ledger_entries(wallet_id uuid, amount_minor bigint)');
   await runtimeClient.query('INSERT INTO pg_temp.ledger_entries VALUES($1,100000000)',[walletId]);
   const overRequest=(await runtimeClient.query(`INSERT INTO service_requests(customer_id,request_type,amount_aed)
     VALUES($1,'send_money',31.00) RETURNING id`,[aliceId])).rows[0].id;
   await assert.rejects(()=>runtimeClient.query(`INSERT INTO send_money_requests
     (request_id,customer_id,wallet_id,beneficiary_id,beneficiary_name,beneficiary_provider,beneficiary_account,amount_minor,idempotency_key)
     VALUES($1,$2,$3,$4,'Recipient','bKash','01712345678',3100,$5)`,
     [overRequest,aliceId,walletId,first,randomUUID()]),/Insufficient available wallet balance/);
   await runtimeClient.query('DROP TABLE pg_temp.ledger_entries');
  } finally {runtimeClient.release();}
  const list=(await request(path,'GET',undefined,bob)).body;assert.equal(list.length,0);
 });
 await test('only an administrator can review and release a hold',async()=>{
  const reviewPath='admin/'+path+'/'+heldId;
  const change={status:'under_review',expected_status:'pending',note:'Review'};
  assert.equal((await request(reviewPath,'PATCH',change,alice)).status,403);
  const concurrent=await Promise.all([request(reviewPath,'PATCH',change,admin),request(reviewPath,'PATCH',change,admin)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request(reviewPath,'PATCH',{status:'rejected',expected_status:'under_review'},admin)).status,400);
  assert.equal((await request(reviewPath,'PATCH',{status:'rejected',expected_status:'under_review',note:'Not proceeding'},admin)).status,200);
  assert.equal((await request(path,'POST',heldDraft,alice)).body.holdStatus,'released');
  const wallet=(await request('wallet','GET',undefined,alice)).body;
  assert.equal(wallet.availableBalance,'100.00');assert.equal(wallet.heldBalance,'0.00');
  const events=(await request(reviewPath+'/events','GET',undefined,admin)).body.reviews;
  assert.deepEqual(events.map((e:{new_status:string})=>e.new_status),['pending','under_review','rejected']);
 });
 await test('duplicate requests and unverified payout references cannot mark success or release',async()=>{
  const a={amount_aed:'20.00',beneficiary_id:first,idempotency_key:randomUUID()};
  const b={...a,amount_aed:'10.00',idempotency_key:randomUUID()};
  const retries=await Promise.all([request(path,'POST',a,alice),request(path,'POST',a,alice)]);
  assert.deepEqual(retries.map(r=>r.status).sort(),[200,201]);
  assert.equal(retries[0].body.id,retries[1].body.id);
  const aId=retries[0].body.id as string;
  const bId=(await request(path,'POST',b,alice)).body.id as string;
  assert.equal((await request(path,'POST',{...a,idempotency_key:randomUUID()},alice)).status,409);
  const sameAccount=await beneficiary('+8801712345678');
  assert.equal((await request(path,'POST',{...a,beneficiary_id:sameAccount,idempotency_key:randomUUID()},alice)).status,409);
  await assert.rejects(()=>pool.query('UPDATE send_money_requests SET amount_minor=2001 WHERE request_id=$1',[aId]),/immutable/);
  await assert.rejects(()=>pool.query('UPDATE service_requests SET amount_aed=20.01 WHERE id=$1',[aId]),/immutable/);
  const ref='admin/'+path+'/'+aId+'/payout-reference';
  assert.equal((await request(ref,'PUT',{payout_reference:'TEST-REF'},alice)).status,403);
  assert.equal((await request(ref,'PUT',{payout_reference:'TEST-REF'},admin)).body.providerConfirmed,false);
  assert.equal((await request(ref,'PUT',{payout_reference:'TEST-REF'},admin)).status,200);
  assert.equal((await request('admin/'+path+'/'+bId+'/payout-reference','PUT',{payout_reference:' test-ref '},admin)).status,409);
  assert.equal((await request('admin/'+path+'/'+aId,'PATCH',{status:'cancelled',expected_status:'pending',note:'Cancel'},admin)).status,409);
  assert.equal((await request('admin/'+path+'/'+bId,'PATCH',{status:'cancelled',expected_status:'pending',note:'Cancel'},admin)).status,200);
  for(const action of ['recipient-verification','payout-success'])
   assert.equal((await request('admin/'+path+'/'+aId+'/'+action,'POST',{},admin)).status,503);
  const history=(await request('admin/'+path+'/'+aId+'/events','GET',undefined,admin)).body;
  assert.equal(history.references.length,1);
  const wallet=(await request('wallet','GET',undefined,alice)).body;
  assert.equal(wallet.balance,'100.00');assert.equal(wallet.heldBalance,'20.00');assert.equal(wallet.availableBalance,'80.00');
  assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
  assert.equal((await pool.query('SELECT sum(amount_minor) FROM ledger_entries')).rows[0].sum,'0');
  await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('still-disabled')"),/Service not yet available/);
 });
 await test('reference recording and cancellation cannot both release the same reservation',async()=>{
  const draft={amount_aed:'5.00',beneficiary_id:second,idempotency_key:randomUUID()};
  const id=(await request(path,'POST',draft,alice)).body.id as string;
  const base='admin/'+path+'/'+id;
  const [reference,cancel]=await Promise.all([
   request(base+'/payout-reference','PUT',{payout_reference:'RACE-REF'},admin),
   request(base,'PATCH',{status:'cancelled',expected_status:'pending',note:'Cancel'},admin)
  ]);
  assert.deepEqual([reference.status,cancel.status].sort(),[200,409]);
  const row=(await pool.query('SELECT hold_status,payout_reference FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
  if(reference.status===200) {assert.equal(row.hold_status,'held');assert.equal(row.payout_reference,'RACE-REF');}
  else {assert.equal(row.hold_status,'released');assert.equal(row.payout_reference,null);}
 });
 await test('recipient review is authorized, evidence-backed and immutable',async()=>{
  const payload={amount_aed:'11.00',beneficiary_id:first,idempotency_key:randomUUID()};
  const id=(await request(path,'POST',payload,alice)).body.id as string;
  const base='admin/'+path+'/'+id, recipient=base+'/recipient', review=base+'/recipient-review';
  assert.equal((await request(recipient,'GET',undefined,alice)).status,403);
  const details=await request(recipient,'GET',undefined,admin);
  assert.equal(details.status,200);assert.equal(details.body.account,'01712345678');
  assert.equal((await pool.query("SELECT count(*) FROM audit_logs WHERE action='admin.send_money_recipient.view' AND target=$1",[id])).rows[0].count,'1');
  const reviewed={status:'admin_reviewed',expected_event_id:'0',note:'Checked records',evidence_reference:'CASE-1'};
  assert.equal((await request(review,'POST',reviewed,alice)).status,403);
  assert.equal((await request(review,'POST',{...reviewed,evidence_reference:''},admin)).status,400);
  assert.equal((await request(review,'POST',{...reviewed,status:'verified'},admin)).status,400);
  const concurrent=await Promise.all([request(review,'POST',reviewed,admin),request(review,'POST',reviewed,admin)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
  const winner=concurrent.find(r=>r.status===201)!;
  assert.equal(winner.body.recipientIndependentlyVerified,false);assert.equal(winner.body.providerConfirmed,false);
  assert.equal((await request(review,'POST',{...reviewed,expected_event_id:winner.body.eventId,status:'rejected',note:'Needs investigation'},admin)).status,201);
  const events=(await request(base+'/events','GET',undefined,admin)).body.recipientReviews;
  assert.deepEqual(events.map((e:{status:string})=>e.status),['admin_reviewed','rejected']);
  await assert.rejects(()=>pool.query('UPDATE send_money_review_events SET note=$1 WHERE request_id=$2',['changed',id]),/append-only/);
  await assert.rejects(()=>pool.query('DELETE FROM send_money_review_events WHERE request_id=$1',[id]),/append-only/);
  await assert.rejects(()=>pool.query('TRUNCATE send_money_reconciliation_approvals'),/append-only/);
  await assert.rejects(()=>pool.query('DELETE FROM service_request_events WHERE request_id=$1',[id]),/append-only/);
  await assert.rejects(()=>pool.query("UPDATE send_money_requests SET beneficiary_account='01999999999' WHERE request_id=$1",[id]),/immutable/);
  await assert.rejects(()=>pool.query('DELETE FROM send_money_requests WHERE request_id=$1',[id]),/cannot be deleted/);
  await assert.rejects(()=>pool.query('UPDATE audit_logs SET action=$1 WHERE target=$2',['changed',id]),/append-only/);
  await assert.rejects(()=>pool.query('DELETE FROM admin_control_events'),/append-only/);
 });
 await test('unverified, disputed and reported-failed reconciliation cannot release or mark success',async()=>{
  const payload={amount_aed:'7.00',beneficiary_id:second,idempotency_key:randomUUID()};
  const id=(await request(path,'POST',payload,alice)).body.id as string;
  const base='admin/'+path+'/'+id, reconciliation=base+'/reconciliation';
  const report={status:'unverified',expected_event_id:'0',note:'Investigate'};
  assert.equal((await request(reconciliation,'POST',report,alice)).status,403);
  assert.equal((await request(reconciliation,'POST',{...report,status:'success'},admin)).status,400);
  assert.equal((await request(reconciliation,'POST',{...report,note:''},admin)).status,400);
  const concurrent=await Promise.all([request(reconciliation,'POST',report,admin),request(reconciliation,'POST',report,admin)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
  let version=concurrent.find(r=>r.status===201)!.body.eventId as string;
  for(const status of ['under_review','disputed','reported_failed']) {
   const next=await request(reconciliation,'POST',{status,expected_event_id:version,note:'Admin report',evidence_reference:'CASE-2'},admin);
   assert.equal(next.status,201);assert.equal(next.body.providerConfirmed,false);version=next.body.eventId;
  }
  assert.equal((await request(base,'PATCH',{status:'cancelled',expected_status:'pending',note:'Cancel'},admin)).status,409);
  await assert.rejects(()=>pool.query("UPDATE send_money_requests SET hold_status='released',released_at=now() WHERE request_id=$1",[id]),/Reservation release requires/);
  assert.equal((await request(base+'/payout-success','POST',{},admin)).status,503);
  const events=(await request(base+'/events','GET',undefined,admin)).body.reconciliations;
  assert.deepEqual(events.map((e:{status:string})=>e.status),['unverified','under_review','disputed','reported_failed']);
  const listing=(await request('admin/'+path,'GET',undefined,admin)).body as {id:string;reconciliation_status:string;reconciliation_event_id:string}[];
  assert.equal(listing.find(r=>r.id===id)?.reconciliation_status,'reported_failed');
  assert.equal(listing.find(r=>r.id===id)?.reconciliation_event_id,version);
  await assert.rejects(()=>pool.query('DELETE FROM send_money_reference_events'),/append-only/);
  assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
  assert.equal((await pool.query('SELECT sum(amount_minor) FROM ledger_entries')).rows[0].sum,'0');
 });
 await test('concurrent reconciliation and cancellation never release an already-reported payout',async()=>{
  const payload={amount_aed:'3.00',beneficiary_id:first,idempotency_key:randomUUID()};
  const id=(await request(path,'POST',payload,alice)).body.id as string;
  const base='admin/'+path+'/'+id;
  const [report,cancel]=await Promise.all([
   request(base+'/reconciliation','POST',{status:'disputed',expected_event_id:'0',note:'Potential payout'},admin),
   request(base,'PATCH',{status:'cancelled',expected_status:'pending',note:'Cancel'},admin)
  ]);
  assert.equal(report.status,201);assert([200,409].includes(cancel.status));
  const row=(await pool.query('SELECT hold_status FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
  assert.equal(row.hold_status,cancel.status===200?'released':'held');
  assert.equal(report.body.holdStatus,row.hold_status);
 });
 await test('failed-payout release requires reported failure, independent evidence and a second active admin',async()=>{
  await pool.query("UPDATE customers SET role='admin' WHERE email='bob@example.com'");
  const availableBefore=(await request('wallet','GET',undefined,alice)).body.availableBalance;
  const payload={amount_aed:'6.00',beneficiary_id:first,idempotency_key:randomUUID()};
  const id=(await request(path,'POST',payload,alice)).body.id as string;
  const base='admin/'+path+'/'+id, resolution=base+'/reconciliation-resolution';
  await request(base+'/payout-reference','PUT',{payout_reference:'PROVIDER-REF'},admin);
  const propose={action:'propose_failed',expected_event_id:'0',note:'Provider report says failed',evidence_reference:'PROVIDER-CASE-100'};
  assert.equal((await request(resolution,'POST',propose,alice)).status,403);
  assert.equal((await request(resolution,'POST',propose,admin)).status,409);
  await request(base+'/reconciliation','POST',{status:'reported_failed',expected_event_id:'0',note:'Reported failure',evidence_reference:'PROVIDER-CASE-100'},admin);
  assert.equal((await request(resolution,'POST',propose,admin)).status,201);
  const proposal=(await request(base+'/events','GET',undefined,admin)).body.resolutions[0];
  assert.equal(proposal.status,'pending_approval');
  const sameAdmin={action:'approve_failed',expected_event_id:proposal.id,note:'Second look',evidence_reference:'PROVIDER-CASE-200'};
  assert.equal((await request(resolution,'POST',sameAdmin,admin)).status,403);
  const sameEvidence={...sameAdmin,evidence_reference:'PROVIDER-CASE-100'};
  assert.equal((await request(resolution,'POST',sameEvidence,bob)).status,409);
  assert.equal((await request(resolution,'POST',{...sameAdmin,evidence_reference:'PROVIDER-REF'},bob)).status,409);
  const approved=await request(resolution,'POST',sameAdmin,bob);
  assert.equal(approved.status,200);
  assert.equal(approved.body.resolutionStatus,'admin_attested_failed_two_person');
  assert.equal(approved.body.providerConfirmed,false);assert.equal(approved.body.holdStatus,'released');
  assert.equal((await request(resolution,'POST',sameAdmin,bob)).status,409);
  assert.equal((await request(base,'PATCH',{status:'cancelled',expected_status:'rejected',note:'Again'},admin)).status,409);
  await assert.rejects(()=>pool.query("UPDATE service_requests SET status='pending' WHERE id=$1",[id]),/cannot be reopened/);
  const history=(await request(base+'/events','GET',undefined,bob)).body;
  assert.equal(history.resolutionApprovals.length,1);
  assert.notEqual(history.resolutions[0].actor_id,history.resolutionApprovals[0].approver_id);
  assert.notEqual(history.resolutions[0].evidence_reference,history.resolutionApprovals[0].evidence_reference);
  assert.equal((await request('wallet','GET',undefined,alice)).body.availableBalance,availableBefore);
  assert.equal((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count,'1');
  assert.equal((await pool.query('SELECT sum(amount_minor) FROM ledger_entries')).rows[0].sum,'0');
  await assert.rejects(()=>pool.query("UPDATE send_money_requests SET hold_status='held',released_at=NULL WHERE request_id=$1",[id]),/cannot be reinstated/);
 });
 await test('valid Bangladesh payout methods accept review requests without executing payouts',async()=>{
  await restartApi();
  for(const recipient of [
   {provider:'Nagad',name:'Recipient',account:'01912345678'},
   {provider:'Bank',name:'Recipient',account:'AB-123 456',bank:'Example Bangladesh Bank'}
  ]) {
   const beneficiaryId=(await request('beneficiaries','POST',recipient,alice)).body.id as string;
   const created=await request(path,'POST',{amount_aed:'1.00',beneficiary_id:beneficiaryId,idempotency_key:randomUUID()},alice);
   assert.equal(created.status,201);assert.equal(created.body.payoutEnabled,false);
   const cancelled=await request('admin/'+path+'/'+created.body.id,'PATCH',{status:'cancelled',expected_status:'pending',note:'Review only'},admin);
   assert.equal(cancelled.status,200);assert.equal(cancelled.body.holdStatus,'released');
  }
 });
 await test('revoked admin permissions apply to recipient and reconciliation reviews',async()=>{
  await pool.query("UPDATE customers SET role='customer' WHERE email='admin@example.com'");
  const id=(await pool.query('SELECT request_id FROM send_money_requests LIMIT 1')).rows[0].request_id as string;
  for(const action of ['recipient-review','reconciliation']) {
   const response=await request('admin/'+path+'/'+id+'/'+action,'POST',{status:'under_review',expected_event_id:'0',note:'Review'},admin);
   assert.equal(response.status,403);
  }
 });
} finally {
 if(child){child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');}
 if(runtimePool)await runtimePool.end();
 if(runtime)await runtime.cleanup();
 await pool.end();
}
