import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import * as security from '../src/security.ts';

const requestId='00000000-0000-4000-8000-000000000001';
const actorId='00000000-0000-4000-8000-000000000002';
const original=await import('../src/wallet.ts');

test('production credit guard rejects before opening a database connection', async()=>{
 await assert.rejects(()=>original.creditVerifiedRequest({connect(){throw Error('must not connect');}},requestId,actorId), /Service not yet available/);
});

mock.module('../src/security.ts',{namedExports:{...security,financialPosting(){}}});
const {creditVerifiedRequest}=await import('../src/wallet.ts?prepared-service-test');

function fakeDatabase({existing=false,authorized=true,failEntries=false}={}) {
 const queries=[];
 const client={
  async query(sql,args=[]) {
   const compact=sql.replace(/\s+/g,' ').trim();
   queries.push({sql:compact,args});
   if(compact.startsWith('SELECT id FROM customers'))return {rows:[{id:actorId}],rowCount:1};
   if(compact.startsWith('SELECT r.customer_id'))return {rows:[{customer_id:'customer',status:'pending',receipt_id:'receipt',payment_method_id:'adcb',verification_status:'verified',amount:'12.34',payment_reference:'reference'}],rowCount:1};
   if(compact.startsWith('SELECT journal_id'))return {rows:existing?[{journal_id:'journal'}]:[],rowCount:existing?1:0};
   if(compact.startsWith('SELECT a.request_id'))return {rows:authorized?[{}]:[],rowCount:authorized?1:0};
   if(compact.startsWith('SELECT id,kind FROM wallets'))return {rows:[{id:'customer-wallet',kind:'customer'},{id:'clearing-wallet',kind:'clearing'}],rowCount:2};
   if(compact.startsWith('INSERT INTO ledger_journals'))return {rows:[{id:'journal'}],rowCount:1};
   if(compact.startsWith('INSERT INTO ledger_entries') && failEntries)throw Error('posting failed');
   return {rows:[],rowCount:0};
  },
  release(){queries.push({sql:'RELEASE',args:[]});}
 };
 return {pool:{connect:async()=>client},queries};
}

test('prepared credit writes equal and opposite entries atomically with a deterministic key',async()=>{
 const {pool,queries}=fakeDatabase();
 assert.deepEqual(await creditVerifiedRequest(pool,requestId,actorId),{journalId:'journal',created:true});
 assert.equal(queries[0].sql,'BEGIN');
 assert.deepEqual(queries.find(q=>q.sql.startsWith('INSERT INTO ledger_journals')).args,['add-money:'+requestId]);
 assert.deepEqual(queries.find(q=>q.sql.startsWith('INSERT INTO ledger_entries')).args,['journal','customer-wallet','1234','clearing-wallet','-1234']);
 assert(queries.some(q=>q.sql.startsWith('INSERT INTO wallet_credit_records')));
 assert.equal(queries.at(-2).sql,'COMMIT');
});

test('retries do not post twice and missing authorization or write errors roll back',async()=>{
 const retry=fakeDatabase({existing:true});
 assert.deepEqual(await creditVerifiedRequest(retry.pool,requestId,actorId),{journalId:'journal',created:false});
 assert(!retry.queries.some(q=>q.sql.startsWith('INSERT INTO ledger_entries')));
 for(const options of [{authorized:false},{failEntries:true}]) {
  const {pool,queries}=fakeDatabase(options);
  await assert.rejects(()=>creditVerifiedRequest(pool,requestId,actorId));
  assert.equal(queries.at(-2).sql,'ROLLBACK');
  assert(!queries.some(q=>q.sql==='COMMIT'));
 }
});
