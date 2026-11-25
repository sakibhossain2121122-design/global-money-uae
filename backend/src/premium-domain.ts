import { ApiError, balanced, text } from './security.ts';

export const STAGING_API = 'https://global-money-uae-staging-api.onrender.com';
export const PAYMENT_METHODS = Object.freeze([
  'BOTIM Money', 'e& money', 'ADCB', 'Emirates NBD', 'ADIB', 'Additional UAE bank'
] as const);
export const BENEFICIARY_PROVIDERS = Object.freeze(['bKash', 'Nagad', 'Rocket', 'Upay', 'Bank'] as const);

export type ReviewStatus = 'pending' | 'under_review' | 'rejected' | 'cancelled';
export type DepositRequestInput = {
  amountAed: unknown; customerReference: unknown; paymentMethod: unknown;
  receiptFixtureKey?: unknown;
};

/** Validates request metadata only. Real payment evidence and uploads are deliberately rejected. */
export function validateSyntheticDeposit(input: DepositRequestInput) {
  const amount = typeof input.amountAed === 'number' ? input.amountAed : Number(input.amountAed);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) throw new ApiError(400, 'Invalid amount');
  const method = text(input.paymentMethod, 1, 80);
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) throw new ApiError(400, 'Unsupported payment method');
  const reference = text(input.customerReference, 1, 120);
  const fixture = input.receiptFixtureKey == null ? null : text(input.receiptFixtureKey, 1, 80);
  if (fixture && !/^synthetic:[a-z0-9_-]+$/i.test(fixture)) throw new ApiError(400, 'Only synthetic receipt fixtures are accepted');
  return { amountAed: amount.toFixed(2), paymentMethod: method, customerReference: reference, receiptFixtureKey: fixture, fixtureOnly: true as const };
}

/** External integrations are explicit disabled adapters until authorization and credentials are configured. */
export interface LiveRateProvider { readonly name: string; fetchAedBdt(): Promise<{ value: number; observedAt: string }> }
export class DisabledLiveRateProvider implements LiveRateProvider {
  readonly name = 'disabled';
  async fetchAedBdt(): Promise<never> { throw new ApiError(503, 'Authorized live-rate provider is not configured'); }
}
export interface PayoutAdapter { readonly enabled: false; submit(): never }
export class DisabledPayoutAdapter implements PayoutAdapter {
  readonly enabled = false as const;
  submit(): never { throw new ApiError(503, 'Payouts are disabled'); }
}
export const canPostFinancialEntries = (entries: {currency:string; amount:bigint}[]) =>
  balanced(entries) && false; // Double-entry shape can be checked; posting remains disabled.

export function validateReviewTransition(from: ReviewStatus, to: ReviewStatus): ReviewStatus {
  const transitions: Record<ReviewStatus, readonly ReviewStatus[]> = {
    pending: ['under_review', 'rejected', 'cancelled'],
    under_review: ['rejected', 'cancelled'], rejected: [], cancelled: []
  };
  if (!transitions[from].includes(to)) throw new ApiError(409, 'Invalid request status transition');
  return to;
}
