import {management} from './management.ts';
import {reviewRequest} from './request-workflow.ts';
import type {PoolClient} from 'pg';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {ApiError,uuid,text} from './security.ts';
import {fields,amount,note,review} from './add-money.ts';
import {validateAccount,validateBankName} from './admin-control.ts';
import {verification} from './kyc.ts';
type Body=Record<string,unknown>;
export async function control(c:PoolClient,path:string,method:string,actor:string,body:()=>Promise<Body>,audit:(action:string,target?:string|null)=>Promise<void>):Promise<{data:unknown,status?:number}|null> {
 const out=(data:unknown,status=200)=>({data,status});
 const managed=await management(c,path,method,actor,body,audit);if(managed)return managed;
 if(method==='PATCH'&&/^\/v1\/admin\/(add-money|send-money)-requests\/[0-9a-f-]{36}$/.test(path))return out(await reviewRequest(c,path,actor,await body(),audit));
 if(method==='PATCH'&&path==='/v1/admin/user-role') {
  const b=await body();fields(b,['id','role']);const id=uuid(b.id);
  if(id===actor)throw new ApiError(400,'Cannot change your own role');
  if(!['customer','admin','reviewer','support'].includes(String(b.role)))throw new ApiError(400,'Invalid role');
  if(b.role!=='customer') {
   const account=(await c.query('SELECT email FROM customers WHERE id=$1',[id])).rows[0];
   if(!account)throw new ApiError(404,'User not found');
   if(!account.email)throw new ApiError(400,'An email address is required for staff access');
  }
  if(!(await c.query('UPDATE customers SET role=$2 WHERE id=$1 RETURNING id',[id,b.role])).rowCount)throw new ApiError(404,'User not found');
  await c.query('DELETE FROM sessions WHERE customer_id=$1',[id]);await audit('admin.user.role.'+b.role,id);return out({id});
 }
 if(method==='GET'&&path==='/v1/admin/kyc')return out({...verification,complianceApprovalRequired:true});
 if(method==='GET'&&path==='/v1/kyc')return out({...verification,status:'unavailable'});
 if(method==='GET'&&path==='/v1/payment-accounts')return out((await c.query(`SELECT a.id,a.payment_method_id,a.account_holder,a.account_number,a.iban,a.instructions FROM company_payment_accounts a JOIN payment_methods m ON m.id=a.payment_method_id WHERE a.enabled AND a.archived_at IS NULL AND m.currency='AED' ORDER BY a.created_at,a.id`)).rows);
 if(method==='GET'&&path==='/v1/payout-banks')return out((await c.query("SELECT id,name,country FROM payout_banks WHERE enabled AND archived_at IS NULL AND country='BD' ORDER BY name,id")).rows);
 if(path==='/v1/admin/payment-accounts'&&method==='PATCH') {
  const b=await body();fields(b,['id','enabled','archive','payment_method_id','account_holder','account_number','iban','instructions']);const id=uuid(b.id);
  const old=(await c.query('SELECT * FROM company_payment_accounts WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id])).rows[0];if(!old)throw new ApiError(404,'Account not found');
  if(b.enabled!==undefined&&typeof b.enabled!=='boolean'||b.archive!==undefined&&b.archive!==true)throw new ApiError(400,'Invalid status');
  const merged={...old,...b};for(const k of ['payment_method_id','account_holder','account_number','iban','instructions'])if(merged[k]!=null&&typeof merged[k]!=='string')throw new ApiError(400,'Invalid account data');
  const a=validateAccount(merged);
  if(!(await c.query("SELECT id FROM payment_methods WHERE id=$1 AND currency='AED'",[a.payment_method_id])).rowCount)throw new ApiError(400,'Unknown AED payment method');
  await c.query(`UPDATE company_payment_accounts SET payment_method_id=$2,account_holder=$3,account_number=$4,iban=$5,instructions=$6,enabled=$7,archived_at=CASE WHEN $8 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,[id,a.payment_method_id,a.account_holder,a.account_number,a.iban,a.instructions,b.archive?false:b.enabled??old.enabled,b.archive===true]);
  await audit('admin.payment_account.update',id);return out({id,postingEnabled:false});
 }
 if(path==='/v1/admin/payout-banks'&&['POST','PATCH'].includes(method)) {
  const b=await body();fields(b,method==='POST'?['name']:['id','name','enabled']);
  if(b.enabled!==undefined&&typeof b.enabled!=='boolean')throw new ApiError(400,'Invalid status');
  let id:string;
  if(method==='POST')id=(await c.query('INSERT INTO payout_banks(name) VALUES($1) RETURNING id',[validateBankName(b.name)])).rows[0].id;
  else {id=uuid(b.id);const old=(await c.query('SELECT name,enabled FROM payout_banks WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id])).rows[0];if(!old)throw new ApiError(404,'Bank not found');await c.query('UPDATE payout_banks SET name=$2,enabled=$3,updated_at=now() WHERE id=$1',[id,validateBankName(b.name??old.name),b.enabled??old.enabled]);}
  await audit('admin.payout_bank.'+method.toLowerCase(),id);return out({id},method==='POST'?201:200);
 }
 if(path==='/v1/send-money-requests'&&method==='POST') {
  const b=await body();fields(b,['amount_aed','beneficiary_id','note','idempotency_key','expected_fee_aed']);const a=amount(b.amount_aed),ben=uuid(b.beneficiary_id),key=uuid(b.idempotency_key),n=note(b.note);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+key]);
  const old=(await c.query('SELECT * FROM service_requests WHERE customer_id=$1 AND idempotency_key=$2',[actor,key])).rows[0];
  if(old){if(old.request_type!=='send_money'||old.amount_aed!==a||old.beneficiary_id!==ben||old.customer_note!==n||(b.expected_fee_aed!==undefined&&b.expected_fee_aed!==old.fee_aed))throw new ApiError(409,'Submission key reused');return out({id:old.id,status:old.status,postingEnabled:false});}
  await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[actor]);
  const recipient=(await c.query('SELECT name,provider,account,bank FROM beneficiaries WHERE id=$1 AND customer_id=$2 FOR SHARE',[ben,actor])).rows[0];
  if(!recipient)throw new ApiError(404,'Beneficiary not found');
  const country=(await c.query("SELECT enabled FROM service_countries WHERE code='BD'")).rows[0];
  if(country&&!country.enabled)throw new ApiError(409,'Bangladesh requests disabled');
  const fee=(await c.query('SELECT flat_aed FROM fee_rules WHERE provider=$1 AND enabled',[recipient.provider])).rows[0]?.flat_aed??'0.00';
  if((fee!=='0.00'||b.expected_fee_aed!==undefined)&&b.expected_fee_aed!==fee)throw new ApiError(409,'Fee changed; refresh and confirm the configured fee');
  const row=(await c.query("INSERT INTO service_requests(customer_id,request_type,amount_aed,beneficiary_id,customer_note,idempotency_key) VALUES($1,'send_money',$2,$3,$4,$5) RETURNING id,status",[actor,a,ben,n,key])).rows[0];
  await c.query('UPDATE service_requests SET recipient_snapshot=$2,fee_aed=$3 WHERE id=$1',[row.id,JSON.stringify(recipient),fee]);
  await c.query("INSERT INTO service_request_events(request_id,actor_id,new_status) VALUES($1,$2,'pending')",[row.id,actor]);
  await c.query('INSERT INTO wallet_holds(customer_id,request_id,amount_minor) VALUES($1,$2,$3)',[actor,row.id,Math.round(Number(a)*100)]);
  if((await c.query("SELECT id FROM wallets WHERE customer_id=$1 AND kind='customer' AND currency='AED'",[actor])).rowCount)await c.query("SELECT reserve_request($1,$2,'hold')",[row.id,actor]);
  await audit('wallet.hold.propose',row.id);
  await audit('send_money_request.submitted',row.id);return out({...row,postingEnabled:false},201);
 }
 const sendAdmin=path.startsWith('/v1/admin/send-money-requests');
 if(method==='GET'&&(path==='/v1/send-money-requests'||path==='/v1/admin/send-money-requests'))return out((await c.query(`SELECT id,amount_aed,fee_aed,beneficiary_id,recipient_snapshot,status,customer_note,created_at FROM service_requests WHERE request_type='send_money' ${sendAdmin?'':'AND customer_id=$1'} ORDER BY created_at DESC LIMIT 100`,sendAdmin?[]:[actor])).rows);
 if(method==='POST'&&/^\/v1\/add-money-requests\/[0-9a-f-]{36}\/receipts$/.test(path)) {
  const id=uuid(path.split('/')[3]),b=await body();fields(b,['media_type','content_base64']);
  const req=(await c.query("SELECT id FROM service_requests WHERE id=$1 AND customer_id=$2 AND request_type='add_money' AND status IN ('pending','under_review') FOR UPDATE",[id,actor])).rows[0];if(!req)throw new ApiError(404,'Request not found');
  if(!['image/png','image/jpeg'].includes(String(b.media_type))||typeof b.content_base64!=='string'|| !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.content_base64))throw new ApiError(400,'Invalid receipt');
  let bytes:Buffer=Buffer.from(b.content_base64,'base64');if(bytes.length<8||bytes.length>1000000)throw new ApiError(413,'Receipt size invalid');
  const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
  if(b.media_type==='image/png'?!png:!jpeg)throw new ApiError(400,'Receipt signature mismatch');
  try {bytes=await sharp(bytes,{limitInputPixels:16000000,failOn:'warning',animated:false}).rotate().png().toBuffer();} catch {throw new ApiError(400,'Invalid receipt image');}
  if(bytes.length>1000000)throw new ApiError(413,'Receipt too large');
  if(Number((await c.query('SELECT count(*) FROM receipts WHERE request_id=$1',[id])).rows[0].count)>=3)throw new ApiError(409,'Receipt limit reached');
  const row=(await c.query('INSERT INTO receipts(request_id,customer_id,media_type,content,sha256) VALUES($1,$2,$3,$4,$5) RETURNING id,status',[id,actor,'image/png',bytes,createHash('sha256').update(bytes).digest('hex')])).rows[0];await audit('receipt.upload',row.id);return out(row,201);
 }
 if(method==='GET'&&path==='/v1/admin/receipts')return out((await c.query('SELECT id,request_id,media_type,sha256,status,review_note,created_at FROM receipts ORDER BY created_at DESC LIMIT 100')).rows);
 if(method==='GET'&&/^\/v1\/admin\/receipts\/[0-9a-f-]{36}$/.test(path)) {const id=uuid(path.split('/').pop());const row=(await c.query('SELECT media_type,content FROM receipts WHERE id=$1',[id])).rows[0];if(!row)throw new ApiError(404,'Receipt not found');await audit('admin.receipt.view',id);return out({media_type:row.media_type,content_base64:row.content.toString('base64')});}
 if(method==='PATCH'&&/^\/v1\/admin\/receipts\/[0-9a-f-]{36}$/.test(path)) {const id=uuid(path.split('/').pop()),b=await body();fields(b,['status','note']);if(!['reviewed','rejected'].includes(String(b.status)))throw new ApiError(400,'Invalid status');if(!(await c.query('UPDATE receipts SET status=$2,review_note=$3,reviewed_by=$4 WHERE id=$1 RETURNING id',[id,b.status,note(b.note),actor])).rowCount)throw new ApiError(404,'Receipt not found');await audit('admin.receipt.'+b.status,id);return out({id,postingEnabled:false});}
 if(method==='POST'&&/^\/v1\/admin\/wallet-holds\/[0-9a-f-]{36}\/release$/.test(path)) {
  fields(await body(),[]);const id=uuid(path.split('/')[4]);
  const updated=await c.query("UPDATE wallet_holds SET status='released',released_at=now() WHERE id=$1 AND status='proposed' RETURNING id",[id]);
  if(!updated.rowCount)throw new ApiError(409,'Hold absent or already released');
  await audit('admin.wallet_hold.release',id);return out({id,postingEnabled:false});
 }
 if(method==='GET'&&path==='/v1/admin/wallet-holds')return out((await c.query('SELECT * FROM wallet_holds ORDER BY created_at DESC LIMIT 100')).rows);
 if(method==='GET'&&path==='/v1/admin/audit-logs')return out((await c.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100')).rows);
 return null;
}
