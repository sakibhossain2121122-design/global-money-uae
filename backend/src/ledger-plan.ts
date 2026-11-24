import {ApiError} from './security.ts';
/** Pure future posting plan. No database writes; financial denial triggers remain authoritative.
 * A future approved executor must lock the customer's wallets, derive available funds from
 * committed ledger entries, check the hold state, and post both entries atomically.
 */
export function reservationPlan(input:{operation:'hold'|'release';availableWallet:string;heldWallet:string;amountMinor:bigint;availableMinor:bigint;heldMinor:bigint}) {
 const {operation,availableWallet,heldWallet,amountMinor,availableMinor,heldMinor}=input;
 if(!['hold','release'].includes(operation)||availableWallet===heldWallet||amountMinor<=0n||availableMinor<0n||heldMinor<0n)throw new ApiError(400,'Invalid reservation');
 if((operation==='hold'?availableMinor:heldMinor)<amountMinor)throw new ApiError(409,'Insufficient funds for reservation');
 const direction=operation==='hold'?1n:-1n;
 return [{walletId:availableWallet,amountMinor:-amountMinor*direction},{walletId:heldWallet,amountMinor:amountMinor*direction}];
}
