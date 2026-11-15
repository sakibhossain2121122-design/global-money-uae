import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAccount,
  validateAddMoneyMethod,
  validateBankName,
  validateEnabledToggle
} from './admin-control.ts';
import {ApiError} from './security.ts';

test('UAE payment account data is normalized and bounded',()=>{
  assert.deepEqual(validateAccount({
    payment_method_id:'adcb',
    account_holder:'  Example LLC ',
    account_number:'  1234 5678 ',
    instructions:'  Pay to company account  '
  }),{
    payment_method_id:'adcb',
    account_holder:'Example LLC',
    account_number:'1234 5678',
    iban:null,
    instructions:'Pay to company account'
  });
  assert.throws(()=>validateAccount({
    payment_method_id:'unknown-method',
    account_holder:'Example LLC',
    iban:'AE123456789012345'
  }),ApiError);
  assert.throws(()=>validateAccount({
    payment_method_id:'adcb',
    account_holder:'Example LLC',
    account_number:'1234',
    instructions:'x'.repeat(501)
  }),ApiError);
  assert.throws(()=>validateAccount({
    payment_method_id:'adcb',
    account_holder:'Example LLC',
    account_number:null,
    iban:null
  }),ApiError);
});

test('Add Money request availability accepts only its boolean control',()=>{
  assert.deepEqual(validateAddMoneyMethod({
    id:'adcb',
    add_money_request_enabled:false
  }),{id:'adcb',add_money_request_enabled:false});
  for(const input of [
    {id:'adcb',add_money_request_enabled:'false'},
    {id:'../adcb',add_money_request_enabled:true},
    {id:'adcb',add_money_request_enabled:true,enabled:true}
  ])assert.throws(()=>validateAddMoneyMethod(input),ApiError);
});

test('account and payout-bank status updates reject unsupported fields',()=>{
  assert.deepEqual(validateEnabledToggle({
    id:'00000000-0000-0000-0000-000000000001',
    enabled:true
  }),{id:'00000000-0000-0000-0000-000000000001',enabled:true});
  assert.throws(()=>validateEnabledToggle({id:'invalid',enabled:'true'}),ApiError);
  assert.throws(()=>validateEnabledToggle({id:'invalid',enabled:true,archived:false}),ApiError);
  assert.equal(validateBankName('  Example Bank  '),'Example Bank');
  for(const name of ['', 'x'.repeat(121), 5]) {
    assert.throws(()=>validateBankName(name),ApiError);
  }
});
