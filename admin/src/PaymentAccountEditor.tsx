import React from 'react';
export type PaymentAccount = {payment_method_id:string;account_holder:string;account_number:string|null;iban:string|null;instructions:string|null;qr_payload:string|null};
export function PaymentAccountEditor({account,busy,onSave}:{account:PaymentAccount;busy:boolean;onSave:(value:PaymentAccount)=>void}) {
 return <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);onSave({payment_method_id:account.payment_method_id,
  account_holder:String(data.get('account_holder')),account_number:String(data.get('account_number'))||null,
  iban:String(data.get('iban')).toUpperCase()||null,instructions:String(data.get('instructions'))||null,qr_payload:String(data.get('qr_payload'))||null});}}>
  <h3>Edit account details</h3>
  <label>Account holder<input name="account_holder" required maxLength={150} defaultValue={account.account_holder}/></label>
  <label>Account number<input name="account_number" autoComplete="off" maxLength={50} defaultValue={account.account_number??''}/></label>
  <label>IBAN<input name="iban" autoComplete="off" maxLength={34} defaultValue={account.iban??''}/></label>
  <label>Instructions<textarea name="instructions" maxLength={500} defaultValue={account.instructions??''}/></label>
  <label>QR content (reference only; no payment execution)<textarea name="qr_payload" maxLength={512} defaultValue={account.qr_payload??''}/></label>
  <button disabled={busy}>Save account details</button>
 </form>;
}
