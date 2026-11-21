import React, {useState} from 'react';

type Wallet = {balance: string | null; currency: string; postingEnabled: boolean};

export function WalletView({name, wallet}: {name: string; wallet: Wallet}) {
 return <section aria-label="Customer wallet">
  <h3>{name} wallet</h3>
  <p>Balance: {wallet.balance === null ? 'Unavailable' : `${wallet.currency} ${wallet.balance}`}</p>
  <p>Wallet credit is disabled.</p>
 </section>;
}

export type ReceiptReviewInput = {
 status: string;
 expected_status: string;
 verified_amount_aed?: string;
 payment_reference?: string;
 note: string;
};

export function ReceiptReview({status, busy, onReview, onView, onHistory}: {
 status: string; busy: boolean;
 onReview: (input: ReceiptReviewInput) => void; onView: () => void; onHistory: () => void;
}) {
 const [nextStatus,setNextStatus]=useState('under_review');
 const [amount,setAmount]=useState('');
 const [reference,setReference]=useState('');
 const [note,setNote]=useState('');
 return <div>
  <p>Receipt status: {status}. A review does not authorize credit.</p>
  <button type="button" disabled={busy} onClick={onView}>View receipt</button>
  <button type="button" disabled={busy} onClick={onHistory}>Receipt audit history</button>
  <label>Verification result<select value={nextStatus} disabled={busy} onChange={e=>setNextStatus(e.target.value)}>
   <option value="under_review">Under review</option><option value="rejected">Rejected</option><option value="verified">Verified by admin</option>
  </select></label>
  {nextStatus==='verified'&&<>
   <label>Verified amount (AED)<input value={amount} inputMode="decimal" disabled={busy} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Payment reference<input value={reference} maxLength={120} disabled={busy} onChange={e=>setReference(e.target.value)}/></label>
  </>}
  <label>Receipt review note<input value={note} maxLength={500} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
  <button type="button" disabled={busy || (nextStatus==='verified' && (!amount.trim() || !reference.trim()))}
   onClick={()=>onReview({status:nextStatus,expected_status:status,note,
    ...(nextStatus==='verified'?{verified_amount_aed:amount,payment_reference:reference}:{})})}>Record review</button>
  <button type="button" disabled>Credit unavailable</button>
 </div>;
}
