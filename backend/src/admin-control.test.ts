import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAccount,
  validateAddMoneyMethod,
  validateBankName,
  validateEnabledToggle,
  validateMethodCatalog
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

test('method catalog metadata rejects credential-bearing or unsafe URLs',()=>{
  const input={id:'adcb',name:' Example ',logo_url:'https://assets.example/logo.png',display_order:5,catalog_visible:true};
  assert.deepEqual(validateMethodCatalog(input),{...input,name:'Example'});
  assert.equal(validateMethodCatalog({...input,logo_url:''}).logo_url,null);
  for(const logo_url of ['http://example.test/logo','https://user:pass@example.test/logo',
    'https://example.test/logo?token=secret','https://example.test/logo#secret',
    'https://example.test:8443/logo','javascript:alert(1)'])
    assert.throws(()=>validateMethodCatalog({...input,logo_url}),ApiError);
  for(const extra of [{enabled:true},{display_order:-1},{display_order:1.5},{name:''},{catalog_visible:'true'}])
    assert.throws(()=>validateMethodCatalog({...input,...extra}),ApiError);
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
