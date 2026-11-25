import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSyntheticDeposit, validateReviewTransition, DisabledLiveRateProvider, DisabledPayoutAdapter, canPostFinancialEntries } from './premium-domain.ts';

test('synthetic deposit metadata requires an allowed server payment method', () => {
  assert.equal(validateSyntheticDeposit({amountAed:'25.50',customerReference:'TEST-01',paymentMethod:'BOTIM Money',receiptFixtureKey:'synthetic:receipt_01'}).fixtureOnly, true);
  assert.throws(() => validateSyntheticDeposit({amountAed:10,customerReference:'R1',paymentMethod:'Unknown'}), /Unsupported payment method/);
  assert.throws(() => validateSyntheticDeposit({amountAed:10,customerReference:'R1',paymentMethod:'ADCB',receiptFixtureKey:'real-file.jpg'}), /Only synthetic/);
  assert.throws(() => validateSyntheticDeposit({amountAed:0,customerReference:'R1',paymentMethod:'ADCB'}), /Invalid amount/);
});
test('review status transitions cannot approve or reopen a request', () => {
  assert.equal(validateReviewTransition('pending','under_review'),'under_review');
  assert.throws(() => validateReviewTransition('pending','pending'), /Invalid request/);
  assert.throws(() => validateReviewTransition('rejected','under_review'), /Invalid request/);
});
test('external financial integrations remain disabled', async () => {
  await assert.rejects(new DisabledLiveRateProvider().fetchAedBdt(), /not configured/);
  assert.throws(() => new DisabledPayoutAdapter().submit(), /Payouts are disabled/);
  assert.equal(canPostFinancialEntries([{currency:'AED',amount:100n},{currency:'AED',amount:-100n}]),false);
});
