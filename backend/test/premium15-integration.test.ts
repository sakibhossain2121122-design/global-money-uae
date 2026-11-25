import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=process.env.TEST_DATABASE_URL, runtime=process.env.TEST_RUNTIME_DATABASE_URL;
if(!url||!runtime||!new URL(url).pathname.endsWith('_test')||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Disposable local TEST_DATABASE_URL and TEST_RUNTIME_DATABASE_URL required');
const pool=new pg.Pool({connectionString:url});
await pool.query(await readFile(new URL('../sql/gm-app-permissions.sql',import.meta.url),'utf8'));
await pool.query(await readFile(new URL('../sql/gm-app-permissions.sql',import.meta.url),'utf8'));
const port=3115;
const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,DATABASE_URL:runtime,PORT:String(port),SYNTHETIC_REQUESTS_ENABLED:'true'},stdio:'ignore'});
async function api(path:string,method='GET',data?:unknown,token?:string){const r=await fetch('http://127.0.0.1:'+port+'/v1/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert(ready);
 const password='Reconstruction-Test-Only-123!';
 for(const name of ['alice15','bob15','admin15'])assert.equal((await api('auth/register','POST',{email:name+'@example.invalid',name,password,role:'admin'})).status,202);
 await pool.query("UPDATE customers SET role='admin' WHERE email='admin15@example.invalid'");
 const login=async(name:string)=>(await api('auth/login','POST',{email:name+'@example.invalid',password})).body.token as string;
 const alice=await login('alice15'),bob=await login('bob15'),admin=await login('admin15');
 await test('runtime identity, empty overview and server RBAC',async()=>{
  const app=new pg.Pool({connectionString:runtime});try{assert.equal((await app.query('SELECT current_user')).rows[0].current_user,'gm_app')}finally{await app.end()}
  const o=await api('overview','GET',undefined,alice);assert.equal(o.status,200);assert.equal(o.body.balance,null);assert.equal(o.body.rate,null);assert.equal(o.body.postingEnabled,false);
  for(const route of ['payment-methods','payment-accounts','payout-banks','pricing','audit']){assert.equal((await api('admin/'+route)).status,401);assert.equal((await api('admin/'+route,'GET',undefined,alice)).status,403)}
 });
 await test('admin method controls affect only synthetic requests',async()=>{
  const payload={amountAed:'10.25',paymentMethodId:'adcb',receiptFixtureKey:'synthetic:test15',idempotencyKey:'synthetic:deposit15'};
  assert.equal((await api('deposit-requests','POST',payload,alice)).status,400);
  assert.equal((await api('admin/payment-methods','PATCH',{id:'adcb',name:'ADCB',display_order:3,staging_enabled:true},alice)).status,403);
  assert.equal((await api('admin/payment-methods','PATCH',{id:'adcb',name:'ADCB',display_order:3,staging_enabled:true,enabled:true},admin)).status,400);
  assert.equal((await api('admin/payment-methods','PATCH',{id:'adcb',name:'ADCB',display_order:3,staging_enabled:true},admin)).status,200);
  const created=await api('deposit-requests','POST',payload,alice);assert.equal(created.status,201);
  const id=created.body.id;
  assert.equal((await api('admin/deposit-requests','PATCH',{id,status:'successful',transactionReference:'LIVE-123'},admin)).status,400);
  assert.equal((await api('admin/deposit-requests','PATCH',{id,status:'successful',expectedStatus:'under_review',transactionReference:'TEST-V15-001'},admin)).status,409);
  assert.equal((await api('admin/deposit-requests','PATCH',{id,status:'successful',expectedStatus:'pending',transactionReference:'TEST-V15-001'},admin)).status,200);
  assert.equal((await api('admin/deposit-reference','PATCH',{id,transactionReference:'TEST-V15-002'},admin)).status,200);
  const history=(await api('deposit-requests','GET',undefined,alice)).body;assert.equal(history[0].transaction_reference,'TEST-V15-002');
  assert.equal((await api('deposit-requests','GET',undefined,bob)).body.length,0);
  assert((await api('payment-methods','GET',undefined,alice)).body.every((m:{enabled:boolean})=>m.enabled===false));
 });
 await test('payment accounts, banks, pricing and support are validated and audited',async()=>{
  const account={payment_method_id:'adcb',label:'Test staging account',test_reference:'TEST-ACCOUNT-15',enabled:true};
  assert.equal((await api('admin/payment-accounts','POST',{...account,test_reference:'real account'},admin)).status,400);
  assert.equal((await api('admin/payment-accounts','POST',account,admin)).status,201);
  assert.equal((await api('admin/payout-banks','POST',{name:'Synthetic Test Bank',code:'TEST_BD',enabled:true},admin)).status,201);
  assert.equal((await api('payout-banks','GET',undefined,alice)).body[0].code,'TEST_BD');
  const config={rate:'30.123456',service:'send_money',fixed_aed:'2.00',percent:'1.25',enabled:true};
  assert.equal((await api('admin/pricing','PUT',{...config,percent:'NaN'},admin)).status,400);
  assert.equal((await api('admin/pricing','PUT',config,admin)).status,200);
  assert.equal((await api('overview','GET',undefined,alice)).body.rate.value,'30.123456');
  const ticket=(await api('support','POST',{subject:'Synthetic test',message:'Please help with staging.'},alice)).body.id;
  assert.equal((await api('support/'+ticket+'/replies','POST',{message:'Unauthorized'},bob)).status,404);
  assert.equal((await api('admin/support/'+ticket+'/replies','POST',{message:'Staging support reply'},admin)).status,201);
  assert.equal((await api('support/'+ticket+'/replies','GET',undefined,alice)).body[0].role,'admin');
  assert((await api('admin/audit','GET',undefined,admin)).body.some((r:{action:string})=>r.action==='admin.staging_pricing.update'));
 });
 await test('audit immutability, real financial denial and no balances/transactions',async()=>{
  const app=new pg.Pool({connectionString:runtime});try{for(const sql of ['DELETE FROM audit_logs',"UPDATE audit_logs SET action='tamper'",'TRUNCATE audit_logs','TRUNCATE transaction_reference_history',"UPDATE customers SET role='admin'",'DELETE FROM ledger_entries'])await assert.rejects(()=>app.query(sql));}finally{await app.end()}
  await assert.rejects(()=>pool.query('TRUNCATE audit_logs'),/immutable/);
  for(const path of ['payments','transfers','wallet/credit','wallet/debit','remittances','kyc/documents'])assert.equal((await api(path,'POST',{},alice)).status,503);
  for(const table of ['wallets','ledger_journals','ledger_entries','transactions'])assert.equal((await pool.query('SELECT count(*) FROM '+table)).rows[0].count,'0');
 });
}finally{const exit=once(child,'exit');child.kill('SIGTERM');await exit;await pool.end();}
