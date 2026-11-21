import React, {useState} from 'react';

type ReviewInput = {status:string;expected_event_id:string;note:string;evidence_reference?:string};

export function SendMoneyReview({status, holdStatus, payoutReference, recipientEventId, recipientStatus,
 reconciliationEventId, reconciliationStatus, resolutionEventId, resolutionStatus, resolutionProposer,
 resolutionApprover, busy, onReview, onReference, onHistory, onRecipient, onRecipientReview,
 onReconciliation, onResolve}: {
 status:string; holdStatus:string; payoutReference:string|null; busy:boolean;
 recipientEventId:string; recipientStatus:string|null; reconciliationEventId:string; reconciliationStatus:string|null;
 resolutionEventId:string; resolutionStatus:string|null; resolutionProposer:string|null; resolutionApprover:string|null;
 onReview:(input:{status:string;expected_status:string;note:string})=>void;
 onReference:(reference:string)=>void; onHistory:()=>void;
 onRecipient:()=>void; onRecipientReview:(input:ReviewInput)=>void; onReconciliation:(input:ReviewInput)=>void;
 onResolve:(input:{action:'propose_failed'|'approve_failed';expected_event_id:string;note:string;evidence_reference:string})=>void;
}) {
 const [note,setNote]=useState(''),[reference,setReference]=useState('');
 const [recipientResult,setRecipientResult]=useState('under_review'),[recipientNote,setRecipientNote]=useState(''),[recipientEvidence,setRecipientEvidence]=useState('');
 const [reconciliationResult,setReconciliationResult]=useState('unverified'),[reconciliationNote,setReconciliationNote]=useState(''),[reconciliationEvidence,setReconciliationEvidence]=useState('');
 const [resolutionNote,setResolutionNote]=useState(''),[resolutionEvidence,setResolutionEvidence]=useState('');
 const open=['pending','under_review'].includes(status);
 const needsReconciliation=!!payoutReference || reconciliationEventId!=='0';
 return <div>
  <p>Reservation: {holdStatus}. An administrator can reject or cancel only when no payout reference or reconciliation report exists.</p>
  <p>Recipient reviews and payout reports are admin assertions, not independent confirmation. Payouts and success remain unavailable.</p>
  <label>Review note<input maxLength={500} disabled={busy||!open} value={note} onChange={e=>setNote(e.target.value)}/></label>
  {status==='pending'&&<button type="button" disabled={busy} onClick={()=>onReview({status:'under_review',expected_status:status,note})}>Start review</button>}
  <button type="button" disabled={busy||!open||!note.trim()||needsReconciliation} onClick={()=>onReview({status:'rejected',expected_status:status,note})}>Reject and release</button>
  <button type="button" disabled={busy||!open||!note.trim()||needsReconciliation} onClick={()=>onReview({status:'cancelled',expected_status:status,note})}>Cancel and release</button>
  {payoutReference ? <p>Unverified payout reference: {payoutReference}. Independent confirmation is required before release.</p> : <>
   <label>Unverified payout reference<input maxLength={120} disabled={busy||!open} value={reference} onChange={e=>setReference(e.target.value)}/></label>
   <p>Recording a reference prevents release; there is currently no API to reconcile and release it.</p>
   <button type="button" disabled={busy||!open||!reference.trim()} onClick={()=>onReference(reference)}>Record reference</button>
  </>}
  <h4>Recipient review</h4>
  <p>Latest admin review: {recipientStatus ?? 'not reviewed'}. This is not independent recipient verification.</p>
  <button type="button" disabled={busy} onClick={onRecipient}>View recipient details</button>
  <label>Recipient review result<select disabled={busy} value={recipientResult} onChange={e=>setRecipientResult(e.target.value)}>
   <option value="under_review">Under review</option><option value="admin_reviewed">Reviewed by admin</option><option value="rejected">Rejected by admin</option>
  </select></label>
  <label>Recipient review note<input maxLength={500} disabled={busy} value={recipientNote} onChange={e=>setRecipientNote(e.target.value)}/></label>
  <label>Recipient evidence reference<input maxLength={120} disabled={busy} value={recipientEvidence} onChange={e=>setRecipientEvidence(e.target.value)}/></label>
  <button type="button" disabled={busy||!recipientNote.trim()||(recipientResult==='admin_reviewed'&&!recipientEvidence.trim())}
   onClick={()=>onRecipientReview({status:recipientResult,expected_event_id:recipientEventId,note:recipientNote,...(recipientEvidence.trim()?{evidence_reference:recipientEvidence}:{})})}>Record recipient review</button>
  <h4>Payout reconciliation</h4>
  <p>Latest report: {reconciliationStatus ?? 'none'}. Reports cannot confirm failure or release a reservation. {holdStatus==='released'&&'The reservation was already released.'}</p>
  <label>Reconciliation report<select disabled={busy} value={reconciliationResult} onChange={e=>setReconciliationResult(e.target.value)}>
   <option value="unverified">Unverified</option><option value="under_review">Under review</option><option value="disputed">Disputed</option><option value="reported_failed">Reported failed</option>
  </select></label>
  <label>Reconciliation note<input maxLength={500} disabled={busy} value={reconciliationNote} onChange={e=>setReconciliationNote(e.target.value)}/></label>
  <label>Reconciliation evidence reference<input maxLength={120} disabled={busy} value={reconciliationEvidence} onChange={e=>setReconciliationEvidence(e.target.value)}/></label>
  <button type="button" disabled={busy||!reconciliationNote.trim()}
   onClick={()=>onReconciliation({status:reconciliationResult,expected_event_id:reconciliationEventId,note:reconciliationNote,...(reconciliationEvidence.trim()?{evidence_reference:reconciliationEvidence}:{})})}>Record reconciliation report</button>
  {payoutReference&&holdStatus==='held'&&<>
   <h4>Two-administrator failed-payout resolution</h4>
   <p>Requires a reported-failed review, evidence independently checked by two different active admins, and a recorded payout reference. Approval releases the reservation only; it does not confirm provider status or mark success.</p>
   {resolutionStatus&&<p>Resolution: {resolutionStatus}; proposed by {resolutionProposer??'—'}; approved by {resolutionApprover??'—'}</p>}
   <label>Independent evidence reference<input maxLength={120} disabled={busy} value={resolutionEvidence} onChange={e=>setResolutionEvidence(e.target.value)}/></label>
   <label>Resolution note<input maxLength={500} disabled={busy} value={resolutionNote} onChange={e=>setResolutionNote(e.target.value)}/></label>
   {resolutionEventId==='0'&&<button type="button" disabled={busy||reconciliationStatus!=='reported_failed'||!resolutionEvidence.trim()||!resolutionNote.trim()}
    onClick={()=>onResolve({action:'propose_failed',expected_event_id:'0',note:resolutionNote,evidence_reference:resolutionEvidence})}>Propose failed-payout release</button>}
   {resolutionEventId!=='0'&&resolutionStatus==='pending_approval'&&<button type="button" disabled={busy||!resolutionEvidence.trim()||!resolutionNote.trim()}
    onClick={()=>onResolve({action:'approve_failed',expected_event_id:resolutionEventId,note:resolutionNote,evidence_reference:resolutionEvidence})}>Approve with independent evidence (second admin)</button>}
  </>}
  <button type="button" disabled={busy} onClick={onHistory}>Review audit history</button>
  <button type="button" disabled>Payout and success unavailable</button>
 </div>;
}
