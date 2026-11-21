import type {PoolClient} from 'pg';
import {amount, fields, note, review} from './add-money.ts';
import {ApiError, beneficiary as validateBeneficiary, text, uuid} from './security.ts';

function minorUnits(value: string): bigint {
 const [whole, fraction] = value.split('.');
 return BigInt(whole) * 100n + BigInt(fraction);
}

function validateRecipient(recipient: Record<string, unknown>) {
 const result=validateBeneficiary(recipient);
 if(result.provider==='Bank' && result.account.replace(/[ -]/g,'').length<6)
  throw new ApiError(400,'Invalid Bangladesh bank account');
 return result;
}

export async function requireActiveAdmin(c: PoolClient, actor: string) {
 const admin=await c.query("SELECT id FROM customers WHERE id=$1 AND role='admin' AND status='active' FOR SHARE",[actor]);
 if(!admin.rowCount)throw new ApiError(403,'Administrator access required');
}

export async function createSendMoney(c: PoolClient, actor: string, input: Record<string, unknown>) {
 fields(input, ['amount_aed','beneficiary_id','idempotency_key','note']);
 const value=amount(input.amount_aed), beneficiary=uuid(input.beneficiary_id);
 const key=uuid(input.idempotency_key), customerNote=note(input.note), minor=minorUnits(value);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':send-money:'+key]);
 const previous=(await c.query(`SELECT r.id,r.status,r.amount_aed,r.customer_note,s.beneficiary_id,s.hold_status
   FROM send_money_requests s JOIN service_requests r ON r.id=s.request_id
   WHERE s.customer_id=$1 AND s.idempotency_key=$2`,[actor,key])).rows[0];
 if(previous) {
  if(previous.amount_aed!==value || previous.beneficiary_id!==beneficiary || previous.customer_note!==customerNote)
   throw new ApiError(409,'Submission key already used for different details');
  return {created:false, result:{id:previous.id,status:previous.status,holdStatus:previous.hold_status,payoutEnabled:false}};
 }
 const recipient=(await c.query('SELECT id,name,provider,account,bank FROM beneficiaries WHERE id=$1 AND customer_id=$2 FOR SHARE',[beneficiary,actor])).rows[0];
 if(!recipient)throw new ApiError(404,'Beneficiary not found');
 const validRecipient=validateRecipient(recipient);
 const wallet=(await c.query("SELECT id FROM wallets WHERE customer_id=$1 AND currency='AED' AND kind='customer' FOR UPDATE",[actor])).rows[0];
 if(!wallet)throw new ApiError(409,'Wallet balance unavailable');
 const totals=(await c.query(`SELECT
   COALESCE((SELECT sum(amount_minor) FROM ledger_entries WHERE wallet_id=$1),0)::text AS balance,
   COALESCE((SELECT sum(amount_minor) FROM send_money_requests WHERE wallet_id=$1 AND hold_status='held'),0)::text AS held`,[wallet.id])).rows[0];
 if(BigInt(totals.balance)-BigInt(totals.held)<minor)throw new ApiError(409,'Insufficient available balance');
 const request=(await c.query(`INSERT INTO service_requests(customer_id,request_type,amount_aed,customer_note)
   VALUES($1,'send_money',$2,$3) RETURNING id,status`,[actor,value,customerNote])).rows[0];
 await c.query(`INSERT INTO send_money_requests
   (request_id,customer_id,wallet_id,beneficiary_id,beneficiary_name,beneficiary_provider,beneficiary_account,beneficiary_bank,amount_minor,idempotency_key)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
   [request.id,actor,wallet.id,beneficiary,validRecipient.name,validRecipient.provider,validRecipient.account,validRecipient.bank,minor.toString(),key]);
 await c.query("INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status,note) VALUES($1,$2,NULL,'pending',NULL)",[request.id,actor]);
 await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'send_money_request.submitted',$2)",[actor,request.id]);
 return {created:true,result:{...request,holdStatus:'held',payoutEnabled:false}};
}

export async function reviewSendMoney(c: PoolClient, actor: string, requestId: string, input: Record<string, unknown>) {
 await requireActiveAdmin(c,actor);
 const id=uuid(requestId), data=review(input);
 if(!['under_review','rejected','cancelled'].includes(data.status))throw new ApiError(400,'Invalid send money review status');
 if(['rejected','cancelled'].includes(data.status) && !data.note)throw new ApiError(400,'A review note is required');
 const details=(await c.query('SELECT wallet_id FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
 if(!details)throw new ApiError(404,'Request not found');
 // Every reservation writer locks the wallet before reading or changing holds.
 await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[details.wallet_id]);
 const row=(await c.query(`SELECT r.status,s.hold_status,s.payout_reference FROM service_requests r
   JOIN send_money_requests s ON s.request_id=r.id WHERE r.id=$1 AND r.request_type='send_money'
   FOR UPDATE OF r,s`,[id])).rows[0];
 if(!row)throw new ApiError(404,'Request not found');
 if(row.status!==data.expected)throw new ApiError(409,'Request changed; refresh before reviewing');
 if(!['pending','under_review'].includes(row.status))throw new ApiError(409,'Request is already closed');
 if(['rejected','cancelled'].includes(data.status)) {
  const reconciliation=await c.query("SELECT 1 FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation' LIMIT 1",[id]);
  if(row.payout_reference!==null || reconciliation.rowCount)
   throw new ApiError(409,'Payout reconciliation requires independent confirmation before releasing the reservation');
 }
 if(row.status!==data.status) {
  await c.query('UPDATE service_requests SET status=$1,admin_note=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$4',[data.status,data.note,actor,id]);
  await c.query('INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status,note) VALUES($1,$2,$3,$4,$5)',[id,actor,row.status,data.status,data.note]);
  if(['rejected','cancelled'].includes(data.status)) {
   const released=await c.query("UPDATE send_money_requests SET hold_status='released',released_at=now() WHERE request_id=$1 AND hold_status='held'",[id]);
   if(released.rowCount!==1)throw new ApiError(409,'Reservation is not active');
  }
  await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,$2,$3)",[actor,'admin.send_money_request.'+data.status,id]);
 }
 return {id,status:data.status,holdStatus:['rejected','cancelled'].includes(data.status)?'released':row.hold_status,payoutEnabled:false};
}

export async function recordSendMoneyReview(c: PoolClient, actor: string, requestId: string,
 kind: 'recipient' | 'reconciliation', input: Record<string, unknown>) {
 await requireActiveAdmin(c,actor);
 fields(input,['status','expected_event_id','note','evidence_reference']);
 const id=uuid(requestId), status=text(input.status,1,30), expected=text(input.expected_event_id,1,19);
 const reviewNote=text(input.note,1,500);
 const evidence=input.evidence_reference===undefined || input.evidence_reference===null
  ? null : text(input.evidence_reference,1,120);
 if(!/^(0|[1-9][0-9]{0,18})$/.test(expected))throw new ApiError(400,'Invalid review version');
 const statuses=kind==='recipient'?['under_review','admin_reviewed','rejected']:['unverified','under_review','disputed','reported_failed'];
 if(!statuses.includes(status))throw new ApiError(400,'Invalid review status');
 if(kind==='recipient' && status==='admin_reviewed' && !evidence)throw new ApiError(400,'Evidence reference required');
 const wallet=(await c.query('SELECT wallet_id FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
 if(!wallet)throw new ApiError(404,'Request not found');
 await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet.wallet_id]);
 const row=(await c.query(`SELECT r.status AS request_status,s.hold_status,s.beneficiary_name,
   s.beneficiary_provider,s.beneficiary_account,s.beneficiary_bank FROM service_requests r
   JOIN send_money_requests s ON s.request_id=r.id WHERE r.id=$1 AND r.request_type='send_money'
   FOR UPDATE OF r,s`,[id])).rows[0];
 if(!row)throw new ApiError(404,'Request not found');
 if(kind==='recipient' && status==='admin_reviewed')validateRecipient({
  name:row.beneficiary_name,provider:row.beneficiary_provider,account:row.beneficiary_account,bank:row.beneficiary_bank
 });
 const latest=(await c.query('SELECT id::text FROM send_money_review_events WHERE request_id=$1 AND kind=$2 ORDER BY id DESC LIMIT 1',[id,kind])).rows[0];
 if((latest?.id ?? '0')!==expected)throw new ApiError(409,'Review changed; refresh before recording');
 const event=(await c.query(`INSERT INTO send_money_review_events(request_id,actor_id,kind,status,note,evidence_reference)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`,[id,actor,kind,status,reviewNote,evidence])).rows[0];
 await c.query('INSERT INTO audit_logs(actor_id,action,target) VALUES($1,$2,$3)',[actor,'admin.send_money_'+kind+'.'+status,id]);
 return {id,eventId:event.id,status,holdStatus:row.hold_status,recipientIndependentlyVerified:false,providerConfirmed:false,payoutEnabled:false};
}

export async function resolveFailedPayout(c: PoolClient, actor: string, requestId: string, input: Record<string, unknown>) {
 await requireActiveAdmin(c,actor);
 fields(input,['action','expected_event_id','note','evidence_reference']);
 const id=uuid(requestId), action=text(input.action,1,20), expected=text(input.expected_event_id,1,19);
 const resolutionNote=text(input.note,1,500), evidence=text(input.evidence_reference,1,120);
 if(!/^(0|[1-9][0-9]{0,18})$/.test(expected))throw new ApiError(400,'Invalid resolution version');
 if(!['propose_failed','approve_failed'].includes(action))throw new ApiError(400,'Invalid resolution action');
 const wallet=(await c.query('SELECT wallet_id FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
 if(!wallet)throw new ApiError(404,'Request not found');
 await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet.wallet_id]);
 const row=(await c.query(`SELECT r.status,s.hold_status,s.payout_reference FROM service_requests r
   JOIN send_money_requests s ON s.request_id=r.id WHERE r.id=$1 AND r.request_type='send_money'
   FOR UPDATE OF r,s`,[id])).rows[0];
 if(!row)throw new ApiError(404,'Request not found');
 if(row.hold_status!=='held' || !row.payout_reference || !['pending','under_review'].includes(row.status))
  throw new ApiError(409,'A held, referenced, open payout request is required');
 const latest=(await c.query("SELECT id::text,actor_id,evidence_reference FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation_resolution' ORDER BY id DESC LIMIT 1",[id])).rows[0];
 if((latest?.id ?? '0')!==expected)throw new ApiError(409,'Resolution changed; refresh before continuing');
 if(action==='propose_failed') {
  const reconciliation=(await c.query("SELECT status FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation' ORDER BY id DESC LIMIT 1",[id])).rows[0];
  if(reconciliation?.status!=='reported_failed')throw new ApiError(409,'A reported-failed review is required before proposing a release');
  const proposal=(await c.query(`INSERT INTO send_money_review_events(request_id,actor_id,kind,status,note,evidence_reference)
    VALUES($1,$2,'reconciliation_resolution','pending_approval',$3,$4) RETURNING id::text`,
    [id,actor,resolutionNote,evidence])).rows[0];
  await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'admin.send_money_reconciliation.proposed_failed',$2)",[actor,id]);
  return {id,eventId:proposal.id,resolutionStatus:'pending_approval',holdStatus:'held',providerConfirmed:false,payoutEnabled:false};
 }
 if(!latest || latest.actor_id===actor)throw new ApiError(403,'A different administrator must approve the resolution');
 if(evidence.trim().toLowerCase()===latest.evidence_reference.trim().toLowerCase()
   || evidence.trim().toLowerCase()===row.payout_reference.trim().toLowerCase())
  throw new ApiError(409,'Independent approval evidence is required');
 const reconciliation=(await c.query("SELECT status FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation' ORDER BY id DESC LIMIT 1",[id])).rows[0];
 if(reconciliation?.status!=='reported_failed')throw new ApiError(409,'A reported-failed review is required before approval');
 const approved=await c.query(`INSERT INTO send_money_reconciliation_approvals
   (resolution_event_id,approver_id,note,evidence_reference) VALUES($1,$2,$3,$4)`,
   [latest.id,actor,resolutionNote,evidence]);
 if(approved.rowCount!==1)throw new ApiError(409,'Resolution was already approved');
 await c.query(`UPDATE service_requests SET status='rejected',admin_note=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now()
   WHERE id=$3`,[resolutionNote,actor,id]);
 await c.query(`INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status,note)
   VALUES($1,$2,$3,'rejected',$4)`,[id,actor,row.status,resolutionNote]);
 const released=await c.query(`UPDATE send_money_requests SET hold_status='released',released_at=now()
   WHERE request_id=$1 AND hold_status='held'`,[id]);
 if(released.rowCount!==1)throw new ApiError(409,'Reservation is not active');
 await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'admin.send_money_reconciliation.approved_failed_release',$2)",[actor,id]);
 return {id,eventId:latest.id,resolutionStatus:'admin_attested_failed_two_person',holdStatus:'released',providerConfirmed:false,payoutEnabled:false};
}

export async function recordPayoutReference(c: PoolClient, actor: string, requestId: string, input: Record<string, unknown>) {
 await requireActiveAdmin(c,actor);
 fields(input,['payout_reference']);
 const id=uuid(requestId), reference=text(input.payout_reference,1,120);
 const wallet=(await c.query('SELECT wallet_id FROM send_money_requests WHERE request_id=$1',[id])).rows[0];
 if(!wallet)throw new ApiError(404,'Request not found');
 await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet.wallet_id]);
 const row=(await c.query(`SELECT r.status,s.payout_reference FROM service_requests r
   JOIN send_money_requests s ON s.request_id=r.id WHERE r.id=$1 AND r.request_type='send_money'
   FOR UPDATE OF r,s`,[id])).rows[0];
 if(!row)throw new ApiError(404,'Request not found');
 if(!['pending','under_review'].includes(row.status))throw new ApiError(409,'Request is already closed');
 if(row.payout_reference!==null) {
  if(row.payout_reference!==reference)throw new ApiError(409,'A payout reference is already recorded');
  return {id,payoutReference:reference,providerConfirmed:false,payoutEnabled:false};
 }
 await c.query('UPDATE send_money_requests SET payout_reference=$1 WHERE request_id=$2',[reference,id]);
 await c.query('INSERT INTO send_money_reference_events(request_id,actor_id,payout_reference) VALUES($1,$2,$3)',[id,actor,reference]);
 await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'admin.send_money_reference.recorded',$2)",[actor,id]);
 return {id,payoutReference:reference,providerConfirmed:false,payoutEnabled:false};
}
