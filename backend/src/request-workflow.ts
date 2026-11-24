import type {PoolClient} from 'pg';
import {ApiError,uuid} from './security.ts';
import {review} from './add-money.ts';
export async function reviewRequest(c:PoolClient,path:string,actor:string,body:Record<string,unknown>,audit:(action:string,target?:string|null)=>Promise<void>) {
 const match=path.match(/^\/v1\/admin\/(add-money|send-money)-requests\/([0-9a-f-]{36})$/);
 if(!match)return null;
 const kind=match[1]==='add-money'?'add_money':'send_money',id=uuid(match[2]),b=review(body);
 const owner=(await c.query('SELECT customer_id FROM service_requests WHERE id=$1 AND request_type=$2',[id,kind])).rows[0];
 if(!owner)throw new ApiError(404,'Request not found');
 await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[owner.customer_id]);
 const row=(await c.query('SELECT * FROM service_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(row.status!==b.expected)throw new ApiError(409,'Request changed; refresh before reviewing');
 if(['approved','processing'].includes(b.status)) {
  if(actor===row.customer_id)throw new ApiError(403,'Cannot approve your own request');
  if(['rejected','cancelled'].includes(row.status))throw new ApiError(409,'Terminal request cannot be approved');
  if(b.status==='processing'&&row.status!=='approved'&&row.status!=='processing')throw new ApiError(409,'Approve the review before processing');
  if(kind==='add_money'&&!(await c.query("SELECT id FROM receipts WHERE request_id=$1 AND status='reviewed'",[id])).rowCount)throw new ApiError(409,'Review a receipt before approval');
  if(kind==='send_money'&&!(await c.query("SELECT id FROM wallet_holds WHERE request_id=$1 AND status='reserved'",[id])).rowCount)throw new ApiError(409,'Funded wallet reservation required for approval');
 }
 if(['approved','processing'].includes(row.status)&&['pending','under_review'].includes(b.status))throw new ApiError(409,'Approved requests cannot be reopened');
 if(row.status!==b.status) {
  await c.query('UPDATE service_requests SET status=$2,admin_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1',[id,b.status,b.note,actor]);
  await c.query('INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status,note) VALUES($1,$2,$3,$4,$5)',[id,actor,row.status,b.status,b.note]);
  if(kind==='send_money'&&['cancelled','rejected'].includes(b.status))await c.query("SELECT reserve_request($1,$2,'release')",[id,actor]);
  await audit('admin.'+kind+'_request.'+b.status,id);
 }
 return {id,status:b.status,postingEnabled:false,settlementVerified:false};
}
