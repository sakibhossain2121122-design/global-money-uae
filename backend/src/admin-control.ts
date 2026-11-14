
import { ApiError } from './security.ts';

export type AccountInput = {
  payment_method_id: string;
  account_holder: string;
  account_number?: string | null;
  iban?: string | null;
  instructions?: string | null;
};

export function validateAccount(
  input: AccountInput
): AccountInput {
  if (!/^[a-z0-9_]{2,40}$/.test(
    input.payment_method_id ?? ''
  )) {
    throw new ApiError(
      400, 'Invalid payment method'
    );
  }

  const holder = input.account_holder?.trim();

  if (!holder || holder.length > 150) {
    throw new ApiError(
      400, 'Invalid account holder'
    );
  }

  const account = input.account_number?.trim() || null;
  const iban = input.iban?.trim() || null;

  if (!account && !iban) {
    throw new ApiError(
      400, 'Account number or IBAN required'
    );
  }

  if (
    (account && !/^[A-Za-z0-9 -]{4,50}$/.test(account)) ||
    (iban && !/^[A-Z0-9]{15,34}$/.test(iban))
  ) {
    throw new ApiError(
      400, 'Invalid account details'
    );
  }

  return {
    payment_method_id: input.payment_method_id,
    account_holder: holder,
    account_number: account,
    iban,
    instructions: input.instructions?.trim().slice(0, 500) || null
  };
}

export function validateBankName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Invalid bank name');
  }

  const name = value.trim();

  if (!name || name.length > 120) {
    throw new ApiError(400, 'Invalid bank name');
  }

  return name;
}
