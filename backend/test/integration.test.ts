import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test');
const pool=new pg.Pool({connectionString:url});
const port=3107;
const child=spawn(process.execPath,['src/server.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:url,PORT:String(port)},stdio:['ignore','ignore','pipe']});
child.stderr.on('data',()=>{}); // Server rejection events contain no request secrets.
const endpoint='http://127.0.0.1:'+port+'/v1/';
async function request(path:string,method='GET',body?:unknown,token?:string){
 const r=await fetch(endpoint+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
try {
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 await pool.query(await readFile(new URL('../migrations/001_foundation.sql',import.meta.url),'utf8'));
 let ready=false;
 for(let n=0;n<50;n++){try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'API did not start');
 await test('PostgreSQL account lifecycle, ownership, RBAC, audit and restrictions',async t=>{
  const pass='A secure password 123!';
  await t.test('registration validation',async()=>assert.equal((await request('auth/register','POST',{email:'bad',password:'short',name:'A'})).status,400));
  for(const name of ['alice','bob','admin'])assert.equal((await request('auth/register','POST',{email:name+'@example.com',password:pass,name,role:'admin'})).status,202);
  await pool.query("UPDATE customers SET role='admin' WHERE email='admin@example.com'");
  const alice=(await request('auth/login','POST',{email:'alice@example.com',password:pass})).body.token;
  const bob=(await request('auth/login','POST',{email:'bob@example.com',password:pass})).body.token;
  const admin=(await request('auth/login','POST',{email:'admin@example.com',password:pass})).body.token;
  await t.test('session hashes only stored',async()=>{const rows=(await pool.query('SELECT token_hash FROM sessions')).rows;assert.equal(rows.length,3);assert(rows.every(r=>r.token_hash!==alice&&r.token_hash.length===64));});
  await t.test('anonymous and customer cannot access admin',async()=>{assert.equal((await request('admin/users')).status,401);assert.equal((await request('admin/users','GET',undefined,alice)).status,403);assert.equal((await request('admin/users','GET',undefined,admin)).status,200);});
  await t.test('public registration cannot assign admin role',async()=>assert.equal((await request('me','GET',undefined,alice)).body.role,'customer'));
  await t.test('invalid and oversized JSON rejected',async()=>{
   const invalid=await fetch(endpoint+'me',{method:'PATCH',headers:{Authorization:'Bearer '+alice,'Content-Type':'application/json'},body:'{'});assert.equal(invalid.status,400);
   const large=await request('support','POST',{subject:'A',message:'x'.repeat(20000)},alice);assert.equal(large.status,413);
   assert.equal((await request('admin/users','PATCH',{id:'x'.repeat(36),status:'active'},admin)).status,400);
  });
  await t.test('Bengali input survives UTF-8 JSON transport',async()=>{
   assert.equal((await request('me','PATCH',{name:'সাকিব হোসাইন'},alice)).status,200);
   assert.equal((await request('me','GET',undefined,alice)).body.name,'সাকিব হোসাইন');
  });
  await t.test('profile update persists',async()=>{assert.equal((await request('me','PATCH',{name:'Alice Updated'},alice)).status,200);assert.equal((await request('me','GET',undefined,alice)).body.name,'Alice Updated');});
  await t.test('wallet and rates unavailable, history empty',async()=>{assert.equal((await request('wallet','GET',undefined,alice)).body.balance,null);assert.equal((await request('rates','GET',undefined,alice)).body.value,null);assert.deepEqual((await request('transactions','GET',undefined,alice)).body,[]);});
  await t.test('beneficiary ownership and deletion',async()=>{const created=await request('beneficiaries','POST',{provider:'bKash',name:'Recipient',account:'01712345678'},alice);assert.equal(created.status,201);assert.equal((await request('beneficiaries','GET',undefined,bob)).body.length,0);await request('beneficiaries/'+created.body.id,'DELETE',undefined,bob);assert.equal((await request('beneficiaries','GET',undefined,alice)).body.length,1);await request('beneficiaries/'+created.body.id,'DELETE',undefined,alice);assert.equal((await request('beneficiaries','GET',undefined,alice)).body.length,0);});
  await t.test('support ticket persists and admin resolves',async()=>{const ticket=await request('support','POST',{subject:'Question',message:'Please help with account access.'},alice);assert.equal(ticket.status,201);assert.equal((await request('support','GET',undefined,bob)).body.length,0);await request('admin/support','PATCH',{id:ticket.body.id,status:'closed'},admin);assert.equal((await request('support','GET',undefined,alice)).body[0].status,'closed');});
  await t.test('rate configuration internal only',async()=>{assert.equal((await request('admin/rates','PUT',{value:'30.12'},admin)).status,200);assert.equal((await request('rates','GET',undefined,alice)).body.value,null);});
  await t.test('all money operations and identity uploads blocked',async()=>{for(const path of ['add-money','botim-money','payments','transfers','remittances','wallet/credit','wallet/debit','kyc/documents']){const r=await request(path,'POST',{},alice);assert.equal(r.status,503,path);assert.equal(r.body.error,'Service not yet available.');}});
  await t.test('database independently blocks posting',async()=>{await assert.rejects(()=>pool.query("INSERT INTO ledger_journals(idempotency_key) VALUES('test')"),/Service not yet available/);await assert.rejects(()=>pool.query('DELETE FROM ledger_entries'),/Service not yet available/);});
  await t.test('deferred ledger balance constraints enforce currency and entry count',async()=>{
   const c=await pool.connect();
   try {
    await c.query('BEGIN');
    // Disposable test database only: production runtime role cannot disable triggers.
    await c.query('ALTER TABLE ledger_entries DISABLE TRIGGER posting_disabled');
    await c.query('ALTER TABLE ledger_journals DISABLE TRIGGER journals_disabled');
    const wallets=(await c.query("INSERT INTO wallets(currency,kind) VALUES('AED','clearing'),('AED','clearing'),('BDT','clearing') RETURNING id")).rows;
    const journal=(await c.query("INSERT INTO ledger_journals(idempotency_key) VALUES('balanced-test') RETURNING id")).rows[0].id;
    await c.query('INSERT INTO ledger_entries(journal_id,wallet_id,amount_minor) VALUES($1,$2,100),($1,$3,-100)',[journal,wallets[0].id,wallets[1].id]);
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    await c.query('SET CONSTRAINTS ALL DEFERRED');
    const bad=(await c.query("INSERT INTO ledger_journals(idempotency_key) VALUES('currency-test') RETURNING id")).rows[0].id;
    await c.query('INSERT INTO ledger_entries(journal_id,wallet_id,amount_minor) VALUES($1,$2,100),($1,$3,-100)',[bad,wallets[0].id,wallets[2].id]);
    await assert.rejects(()=>c.query('SET CONSTRAINTS ALL IMMEDIATE'),/Unbalanced journal/);
   } finally {await c.query('ROLLBACK');c.release();}
  });
  await t.test('audit records persisted',async()=>{const actions=(await pool.query('SELECT action FROM audit_logs')).rows.map(r=>r.action);assert(actions.includes('account.register'));assert(actions.includes('profile.update'));assert(actions.includes('admin.rate.configure'));});
  await t.test('suspension revokes sessions',async()=>{const id=(await request('me','GET',undefined,bob)).body.id;await request('admin/users','PATCH',{id,status:'suspended'},admin);assert.equal((await request('me','GET',undefined,bob)).status,401);});
  await t.test('expired session rejected',async()=>{await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE customer_id=(SELECT id FROM customers WHERE email='admin@example.com')");assert.equal((await request('me','GET',undefined,admin)).status,401);});
  await t.test('logout revokes token',async()=>{assert.equal((await request('auth/logout','POST',{},alice)).status,200);assert.equal((await request('me','GET',undefined,alice)).status,401);});
 });
} finally {child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');await pool.end();}
