import {test} from 'node:test';
import assert from 'node:assert/strict';
import {amount,note,submission,review} from './add-money.ts';
const key='00000000-0000-4000-8000-000000000001';
test('AED decimal strings are validated and normalized without rounding excess precision',()=>{
 for(const [input,expected] of [['0.01','0.01'],['1','1.00'],['1.2','1.20'],['1000000','1000000.00']])assert.equal(amount(input),expected);
 for(const value of [null,1,'0','-1','01','1e3','1.001','NaN','1000000.01',' 1'])assert.throws(()=>amount(value));
});
test('structured requests reject unauthorized fields and invalid references',()=>{
 const b={amount_aed:'12',payment_method_id:'adcb',idempotency_key:key};
 assert.deepEqual(submission(b),{amount:'12.00',method:'adcb',key,note:null});
 for(const field of ['status','customer_id','receipt','currency','wallet_credit'])assert.throws(()=>submission({...b,[field]:'x'}));
 assert.throws(()=>submission({...b,idempotency_key:'invalid'}));assert.throws(()=>submission({...b,payment_method_id:'../x'}));
 assert.equal(note('   '),null);assert.equal(note(' বাংলা '),'বাংলা');assert.throws(()=>note('x'.repeat(501)));assert.throws(()=>note(2));
});
test('review requires known statuses and an expected state, never paid or approved',()=>{
 assert.equal(review({status:'under_review',expected_status:'pending'}).status,'under_review');
 for(const status of ['paid','approved','credited',true,undefined,['pending']])assert.throws(()=>review({status,expected_status:'pending'}));
 assert.throws(()=>review({status:'rejected'}));assert.throws(()=>review({status:'rejected',expected_status:'pending',balance:100}));
});
