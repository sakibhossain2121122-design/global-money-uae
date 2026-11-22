
import { ApiError } from './security.ts';

export type AccountInput = {
  payment_method_id: string;
  account_holder: string;
  account_number?: string | null;
  iban?: string | null;
  instructions?: string | null;
};

export function validateAccount(input: AccountInput): AccountInput {
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

  const instructions = input.instructions?.trim() || null;
  if (instructions && instructions.length > 500) {
    throw new ApiError(400, 'Invalid instructions');
  }

  return {
    payment_method_id: input.payment_method_id,
    account_holder: holder,
    account_number: account,
    iban,
    instructions
  };
}

export function validateAddMoneyMethod(
  input: Record<string, unknown>
): { id: string; add_money_request_enabled: boolean } {
  if (
    Object.keys(input).some(key =>
      !['id', 'add_money_request_enabled'].includes(key)
    ) ||
    typeof input.id !== 'string' ||
    !/^[a-z0-9_]{2,40}$/.test(input.id) ||
    typeof input.add_money_request_enabled !== 'boolean'
  ) {
    throw new ApiError(400, 'Invalid Add Money method update');
  }

  return {
    id: input.id,
    add_money_request_enabled: input.add_money_request_enabled
  };
}

export function validateMethodCatalog(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(key => !['id', 'name', 'logo_url', 'display_order', 'catalog_visible'].includes(key)) ||
    typeof input.id !== 'string' || !/^[a-z0-9_]{2,40}$/.test(input.id) ||
    typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120 ||
    !Number.isInteger(input.display_order) || Number(input.display_order) < 0 || Number(input.display_order) > 10000 ||
    typeof input.catalog_visible !== 'boolean' ||
    (input.logo_url !== null && typeof input.logo_url !== 'string')
  ) throw new ApiError(400, 'Invalid method metadata');

  const logo = typeof input.logo_url === 'string' ? input.logo_url.trim() : '';
  if (logo) {
    let url: URL;
    try { url = new URL(logo); } catch { throw new ApiError(400, 'Invalid logo URL'); }
    if (logo.length > 2048 || url.protocol !== 'https:' || !url.hostname ||
        url.username || url.password || url.search || url.hash ||
        (url.port && url.port !== '443')) throw new ApiError(400, 'Invalid logo URL');
  }
  return {id:input.id, name:input.name.trim(), logo_url:logo || null,
    display_order:input.display_order as number, catalog_visible:input.catalog_visible};
}

export function validateEnabledToggle(
  input: Record<string, unknown>
): { id: unknown; enabled: boolean } {
  if (
    Object.keys(input).some(key => !['id', 'enabled'].includes(key)) ||
    typeof input.enabled !== 'boolean'
  ) {
    throw new ApiError(400, 'Invalid update data');
  }

  return { id: input.id, enabled: input.enabled };
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
