import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pg from 'pg';
import {submission,review} from './add-money.ts';
import { validateAccount, validateAddMoneyMethod, validateBankName, validateEnabledToggle, validateMethodCatalog } from './admin-control.ts';
import { readReceipt, receiptReview } from './receipts.ts';
import { walletBalance } from './wallet.ts';
import { createSendMoney, reviewSendMoney, recordPayoutReference, recordSendMoneyReview, resolveFailedPayout, requireActiveAdmin } from './send-money.ts';
import { ApiError, text, uuid, email, password, hashPassword, verifyPassword, token, digest, beneficiary, financialPosting, Limiter } from './security.ts';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL, max:10, connectionTimeoutMillis:5000});
pool.on('error', () => console.error(JSON.stringify({event:'database.connection.failed'})));
const limiter = new Limiter(), authLimiter = new Limiter(10, 15*60000);
const dummyHash = await hashPassword(token());
async function body(req: IncomingMessage): Promise<Record<string,unknown>> {
 if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new ApiError(415,'JSON required');
 req.setEncoding('utf8');
 let value = ''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value)>16384) throw new ApiError(413,'Request too large'); }
 try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(); return parsed as Record<string,unknown>; }
 catch { throw new ApiError(400,'Invalid JSON'); }
}
function send(res: ServerResponse, status:number, data:unknown) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Strict-Transport-Security':'max-age=31536000'}); res.end(JSON.stringify(data)); }
const unavailable = /^\/v1\/(add-money|botim-money|payments|transfers|remittances|wallet\/credit|wallet\/debit|kyc\/documents)(\/|$)/;
const server = createServer(async (req,res) => {
 let actor: string | null = null;
 const c = await pool.connect().catch(() => null);
 if (!c) {send(res,503,{error:'Service unavailable'}); return;}
 try {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const method = req.method;
  if (!limiter.allow(req.socket.remoteAddress ?? 'unknown')) throw new ApiError(429,'Too many requests');
  if (method==='GET' && path==='/health') {send(res,200,{status:'ok'}); return;}
  if (unavailable.test(path)) financialPosting();
  await c.query('BEGIN');
  const audit = async(action:string,target:string|null=null) => {await c.query('INSERT INTO audit_logs(actor_id,action,target) VALUES($1,$2,$3)',[actor,action,target]);};
  const auditAdminControl = async(action:string,target:string) => {
    await audit(action,target);
    await c.query(
      'INSERT INTO admin_control_events(admin_id,action,target_id) VALUES($1,$2,$3)',
      [actor,action,target]
    );
  };
  let result: unknown; let status=200; let attachment: Buffer | null = null;
  if (method==='POST' && ['/v1/auth/register','/v1/auth/login'].includes(path)) {
   if (!authLimiter.allow(req.socket.remoteAddress ?? 'unknown')) throw new ApiError(429,'Too many attempts');
   const b=await body(req); const mail=email(b.email); const pass=password(b.password);
   if(path.endsWith('register')) {
    const hash=await hashPassword(pass);
    const inserted=await c.query('INSERT INTO customers(email,password_hash,name) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id',[mail,hash,text(b.name)]);
    if(inserted.rowCount) {actor=inserted.rows[0].id;await audit('account.register');}
    // Same response whether account exists; registration does not create a session.
    status=202;result={message:'If eligible, your account is ready. Please sign in.'};
   } else {
    const found=await c.query('SELECT * FROM customers WHERE email=$1',[mail]); const user=found.rows[0];
    const valid=await verifyPassword(pass,user?.password_hash ?? dummyHash);
    if (!valid || !user || user.status!=='active') throw new ApiError(401,'Invalid credentials');
    actor=user.id; const bearer=token();
    await c.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[digest(bearer),actor]);
    await audit('session.login'); result={token:bearer,expiresIn:28800};
   }
  } else {
   const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
   if (!bearer) throw new ApiError(401,'Sign in required');
   const found=await c.query("SELECT c.id,c.email,c.name,c.role FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at>now() AND c.status='active'",[digest(bearer)]);
   const user=found.rows[0];if(!user) throw new ApiError(401,'Session expired'); actor=user.id;
   if(path.startsWith('/v1/admin/') && user.role!=='admin') throw new ApiError(403,'Forbidden');
   if(method==='POST' && path==='/v1/auth/logout') {await c.query('DELETE FROM sessions WHERE token_hash=$1',[digest(bearer)]);await audit('session.logout');result={ok:true};}
   else if(method==='GET' && path==='/v1/me') result=user;
   else if(method==='PATCH' && path==='/v1/me') {const b=await body(req);await c.query('UPDATE customers SET name=$1 WHERE id=$2',[text(b.name),actor]);await audit('profile.update');result={ok:true};}
   else if(method==='GET' && path==='/v1/wallet') result=await walletBalance(c,user.id);
   else if(method==='GET' && path==='/v1/rates') result={pair:'AED/BDT',value:null,available:false};
   else if(method==='GET' && path==='/v1/kyc') result={status:'unavailable',documentsAccepted:false};
   else if(method==='GET' && path==='/v1/transactions') result=(await c.query('SELECT id,status,created_at FROM transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='GET' && path==='/v1/beneficiaries') result=(await c.query('SELECT id,name,provider,account,bank FROM beneficiaries WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='POST' && path==='/v1/beneficiaries') {const b=beneficiary(await body(req));result=(await c.query('INSERT INTO beneficiaries(customer_id,name,provider,account,bank) VALUES($1,$2,$3,$4,$5) RETURNING id',[actor,b.name,b.provider,b.account,b.bank])).rows[0];await audit('beneficiary.create',(result as {id:string}).id);status=201;}
   else if(method==='DELETE' && /^\/v1\/beneficiaries\/[0-9a-f-]{36}$/.test(path)) {await c.query('DELETE FROM beneficiaries WHERE id=$1 AND customer_id=$2',[uuid(path.split('/').pop()),actor]);await audit('beneficiary.delete');result={ok:true};}
   else if(method==='GET' && path==='/v1/support') result=(await c.query('SELECT id,subject,status,created_at FROM support_tickets WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='POST' && path==='/v1/support') {const b=await body(req);result=(await c.query('INSERT INTO support_tickets(customer_id,subject,message) VALUES($1,$2,$3) RETURNING id',[actor,text(b.subject),text(b.message,1,2000)])).rows[0];await audit('support.create');status=201;}
   else if(method==='GET' && path==='/v1/add-money-request-methods') {
    result=(await c.query("SELECT id,name,country,currency FROM payment_methods WHERE country='AE' AND currency='AED' AND add_money_request_enabled=true AND catalog_visible=true ORDER BY display_order,id")).rows;
   } else if(method==='POST' && path==='/v1/add-money-requests') {
    const b=submission(await body(req));
    // Serialize retries by customer and key. Collisions only add waiting, never authorize access.
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+b.key]);
    const existing=(await c.query("SELECT id,status,amount_aed,payment_method_id,customer_note FROM service_requests WHERE customer_id=$1 AND idempotency_key=$2 AND request_type='add_money'",[actor,b.key])).rows[0];
    if(existing) {
     if(existing.amount_aed!==b.amount||existing.payment_method_id!==b.method||existing.customer_note!==b.note)throw new ApiError(409,'Submission key already used for different details');
     result={id:existing.id,status:existing.status,postingEnabled:false};
    } else {
     const method=await c.query("SELECT id FROM payment_methods WHERE id=$1 AND country='AE' AND currency='AED' AND add_money_request_enabled=true AND catalog_visible=true FOR SHARE",[b.method]);
     if(!method.rowCount)throw new ApiError(400,'Unknown AED payment method');
     const inserted=await c.query(`INSERT INTO service_requests(customer_id,request_type,amount_aed,payment_method_id,customer_note,idempotency_key)
      VALUES($1,'add_money',$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id,status`,[actor,b.amount,b.method,b.note,b.key]);
     if(!inserted.rowCount)throw new ApiError(409,'An identical request is already pending review');
     const row=inserted.rows[0];
     await c.query("INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status) VALUES($1,$2,NULL,'pending')",[row.id,actor]);
     await audit('add_money_request.submitted',row.id);result={...row,postingEnabled:false};status=201;
    }
   } else if(method==='GET' && path==='/v1/add-money-requests') {
    result=(await c.query("SELECT id,amount_aed,payment_method_id,customer_note,status,created_at,updated_at FROM service_requests WHERE customer_id=$1 AND request_type='add_money' ORDER BY created_at DESC,id LIMIT 100",[actor])).rows;
   } else if(method==='GET' && /^\/v1\/add-money-requests\/[0-9a-f-]{36}$/.test(path)) {
    const id=uuid(path.split('/').pop());
    const row=(await c.query("SELECT id,amount_aed,payment_method_id,customer_note,status,created_at,updated_at FROM service_requests WHERE id=$1 AND customer_id=$2 AND request_type='add_money'",[id,actor])).rows[0];
    if(!row)throw new ApiError(404,'Request not found');result=row;
   } else if(method==='PUT' && /^\/v1\/add-money-requests\/[0-9a-f-]{36}\/receipt$/.test(path)) {
    const id=uuid(path.split('/')[3]);
    const request=(await c.query("SELECT id,status,payment_method_id FROM service_requests WHERE id=$1 AND customer_id=$2 AND request_type='add_money' FOR UPDATE",[id,actor])).rows[0];
    if(!request)throw new ApiError(404,'Request not found');
    if(!['pending','under_review'].includes(request.status))throw new ApiError(409,'Request is not open for receipt upload');
    if(!request.payment_method_id)throw new ApiError(409,'Request has no payment method');
    const receipt=await readReceipt(req);
    const existing=(await c.query('SELECT id,sha256,content_type,verification_status FROM add_money_receipts WHERE request_id=$1',[id])).rows[0];
    if(existing) {
     if(existing.sha256!==receipt.sha256 || existing.content_type!==receipt.contentType)throw new ApiError(409,'A receipt is already attached');
     result={id:existing.id,verificationStatus:existing.verification_status,postingEnabled:false};
    } else {
     const inserted=(await c.query(`INSERT INTO add_money_receipts(request_id,payment_method_id,content_type,content,sha256)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,[id,request.payment_method_id,receipt.contentType,receipt.content,receipt.sha256])).rows[0];
     await c.query("INSERT INTO add_money_receipt_events(receipt_id,actor_id,verification_status) VALUES($1,$2,'pending')",[inserted.id,actor]);
     await audit('add_money_receipt.uploaded',id);
     result={id:inserted.id,verificationStatus:'pending',postingEnabled:false};status=201;
    }
   } else if(method==='POST' && path==='/v1/send-money-requests') {
    const created=await createSendMoney(c,user.id,await body(req));
    result=created.result;status=created.created?201:200;
   } else if(method==='GET' && path==='/v1/send-money-requests') {
    result=(await c.query(`SELECT r.id,r.amount_aed,r.status,r.customer_note,r.created_at,
      s.beneficiary_name,s.beneficiary_provider,s.hold_status
      FROM service_requests r JOIN send_money_requests s ON s.request_id=r.id
      WHERE s.customer_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 100`,[actor])).rows;
   } else if(method==='GET' && path==='/v1/admin/send-money-requests') {
    await requireActiveAdmin(c,user.id);
    result=(await c.query(`SELECT r.id,r.customer_id,c.name AS customer_name,r.amount_aed,r.status,r.customer_note,
      r.admin_note,r.created_at,s.beneficiary_name,s.beneficiary_provider,right(s.beneficiary_account,4) AS beneficiary_account_last4,
      s.hold_status,s.payout_reference,
      COALESCE(recipient_review.id::text,'0') AS recipient_event_id,recipient_review.status AS recipient_review_status,
      COALESCE(reconciliation.id::text,'0') AS reconciliation_event_id,reconciliation.status AS reconciliation_status,
      COALESCE(resolution.id::text,'0') AS resolution_event_id,
      CASE WHEN approval.resolution_event_id IS NOT NULL THEN 'admin_attested_failed_two_person' ELSE resolution.status END AS resolution_status,
      resolution.actor_id AS resolution_proposed_by,approval.approver_id AS resolution_approved_by
      FROM service_requests r
      JOIN send_money_requests s ON s.request_id=r.id JOIN customers c ON c.id=r.customer_id
      LEFT JOIN LATERAL (SELECT id,status FROM send_money_review_events WHERE request_id=r.id AND kind='recipient' ORDER BY id DESC LIMIT 1) recipient_review ON true
      LEFT JOIN LATERAL (SELECT id,status FROM send_money_review_events WHERE request_id=r.id AND kind='reconciliation' ORDER BY id DESC LIMIT 1) reconciliation ON true
      LEFT JOIN LATERAL (SELECT id,status,actor_id FROM send_money_review_events WHERE request_id=r.id AND kind='reconciliation_resolution' ORDER BY id DESC LIMIT 1) resolution ON true
      LEFT JOIN send_money_reconciliation_approvals approval ON approval.resolution_event_id=resolution.id
      ORDER BY r.created_at DESC,r.id LIMIT 100`)).rows;
   } else if(method==='PATCH' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}$/.test(path)) {
    result=await reviewSendMoney(c,user.id,path.split('/').pop()!,await body(req));
   } else if(method==='PUT' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/payout-reference$/.test(path)) {
    result=await recordPayoutReference(c,user.id,path.split('/')[4],await body(req));
   } else if(method==='GET' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/recipient$/.test(path)) {
    await requireActiveAdmin(c,user.id);
    const id=uuid(path.split('/')[4]);
    result=(await c.query(`SELECT beneficiary_name AS name,beneficiary_provider AS provider,
      beneficiary_account AS account,beneficiary_bank AS bank FROM send_money_requests WHERE request_id=$1`,[id])).rows[0];
    if(!result)throw new ApiError(404,'Request not found');
    await audit('admin.send_money_recipient.view',id);
   } else if(method==='POST' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/(recipient-review|reconciliation)$/.test(path)) {
    const parts=path.split('/'),kind=parts[5]==='recipient-review'?'recipient':'reconciliation';
    result=await recordSendMoneyReview(c,user.id,parts[4],kind,await body(req));status=201;
   } else if(method==='POST' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/reconciliation-resolution$/.test(path)) {
    const resolution=await resolveFailedPayout(c,user.id,path.split('/')[4],await body(req));
    result=resolution;status=resolution.resolutionStatus==='pending_approval'?201:200;
   } else if(method==='GET' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/events$/.test(path)) {
    await requireActiveAdmin(c,user.id);
    const id=uuid(path.split('/')[4]);
    if(!(await c.query('SELECT request_id FROM send_money_requests WHERE request_id=$1',[id])).rowCount)throw new ApiError(404,'Request not found');
    result={
     reviews:(await c.query('SELECT id,actor_id,previous_status,new_status,note,created_at FROM service_request_events WHERE request_id=$1 ORDER BY id',[id])).rows,
     references:(await c.query('SELECT id,actor_id,payout_reference,created_at FROM send_money_reference_events WHERE request_id=$1 ORDER BY id',[id])).rows,
     recipientReviews:(await c.query("SELECT id,actor_id,status,note,evidence_reference,created_at FROM send_money_review_events WHERE request_id=$1 AND kind='recipient' ORDER BY id",[id])).rows,
     reconciliations:(await c.query("SELECT id,actor_id,status,note,evidence_reference,created_at FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation' ORDER BY id",[id])).rows,
     resolutions:(await c.query("SELECT id,actor_id,status,note,evidence_reference,created_at FROM send_money_review_events WHERE request_id=$1 AND kind='reconciliation_resolution' ORDER BY id",[id])).rows,
     resolutionApprovals:(await c.query(`SELECT a.resolution_event_id::text,a.approver_id,a.note,a.evidence_reference,a.created_at
       FROM send_money_reconciliation_approvals a JOIN send_money_review_events e ON e.id=a.resolution_event_id
       WHERE e.request_id=$1 ORDER BY a.created_at`,[id])).rows
    };
   } else if(method==='POST' && /^\/v1\/admin\/send-money-requests\/[0-9a-f-]{36}\/(?:recipient-verification|payout-success)$/.test(path)) {
    financialPosting();
   } else if(method==='GET' && path==='/v1/admin/add-money-requests') {
    result=(await c.query(`SELECT r.id,r.customer_id,c.name AS customer_name,r.amount_aed,r.payment_method_id,
     r.customer_note,r.status,r.admin_note,r.reviewed_by,r.reviewed_at,r.created_at,
     receipt.id AS receipt_id,receipt.content_type AS receipt_content_type,receipt.verification_status,
     receipt.verified_amount_aed,receipt.payment_reference
     FROM service_requests r JOIN customers c ON c.id=r.customer_id
     LEFT JOIN add_money_receipts receipt ON receipt.request_id=r.id
     WHERE r.request_type='add_money' ORDER BY r.created_at DESC,r.id LIMIT 100`)).rows;
   } else if(method==='GET' && /^\/v1\/admin\/users\/[0-9a-f-]{36}\/wallet$/.test(path)) {
    const id=uuid(path.split('/')[4]);
    if(!(await c.query('SELECT id FROM customers WHERE id=$1',[id])).rowCount)throw new ApiError(404,'Customer not found');
    result=await walletBalance(c,id);
    await audit('admin.wallet.view',id);
   } else if(method==='GET' && /^\/v1\/admin\/add-money-requests\/[0-9a-f-]{36}\/receipt$/.test(path)) {
    const id=uuid(path.split('/')[4]);
    const receipt=(await c.query('SELECT content FROM add_money_receipts WHERE request_id=$1',[id])).rows[0];
    if(!receipt)throw new ApiError(404,'Receipt not found');
    attachment=receipt.content;
    await audit('admin.add_money_receipt.viewed',id);
   } else if(method==='GET' && /^\/v1\/admin\/add-money-requests\/[0-9a-f-]{36}\/receipt-events$/.test(path)) {
    const id=uuid(path.split('/')[4]);
    const receipt=(await c.query('SELECT id FROM add_money_receipts WHERE request_id=$1',[id])).rows[0];
    if(!receipt)throw new ApiError(404,'Receipt not found');
    result=(await c.query('SELECT id,actor_id,verification_status,verified_amount_aed,payment_reference,note,created_at FROM add_money_receipt_events WHERE receipt_id=$1 ORDER BY id',[receipt.id])).rows;
   } else if(method==='PATCH' && /^\/v1\/admin\/add-money-requests\/[0-9a-f-]{36}\/receipt$/.test(path)) {
    const id=uuid(path.split('/')[4]), data=receiptReview(await body(req));
    const receipt=(await c.query('SELECT id,verification_status FROM add_money_receipts WHERE request_id=$1 FOR UPDATE',[id])).rows[0];
    if(!receipt)throw new ApiError(404,'Receipt not found');
    if(receipt.verification_status!==data.expected)throw new ApiError(409,'Receipt changed; refresh before reviewing');
    await c.query(`UPDATE add_money_receipts SET verification_status=$1,verified_amount_aed=$2,payment_reference=$3,
      review_note=$4,reviewed_by=$5,reviewed_at=now() WHERE id=$6`,
      [data.status,data.verifiedAmount,data.reference,data.note,actor,receipt.id]);
    await c.query(`INSERT INTO add_money_receipt_events(receipt_id,actor_id,verification_status,verified_amount_aed,payment_reference,note)
      VALUES($1,$2,$3,$4,$5,$6)`,[receipt.id,actor,data.status,data.verifiedAmount,data.reference,data.note]);
    await audit('admin.add_money_receipt.'+data.status,id);
    result={id:receipt.id,verificationStatus:data.status,postingEnabled:false};
   } else if(method==='GET' && /^\/v1\/admin\/add-money-requests\/[0-9a-f-]{36}\/events$/.test(path)) {
    const id=uuid(path.split('/')[4]);
    const found=await c.query("SELECT id FROM service_requests WHERE id=$1 AND request_type='add_money'",[id]);
    if(!found.rowCount)throw new ApiError(404,'Request not found');
    result=(await c.query('SELECT id,actor_id,previous_status,new_status,note,created_at FROM service_request_events WHERE request_id=$1 ORDER BY id',[id])).rows;
   } else if(method==='PATCH' && /^\/v1\/admin\/add-money-requests\/[0-9a-f-]{36}$/.test(path)) {
    const id=uuid(path.split('/').pop()), b=review(await body(req));
    const row=(await c.query("SELECT status FROM service_requests WHERE id=$1 AND request_type='add_money' FOR UPDATE",[id])).rows[0];
    if(!row)throw new ApiError(404,'Request not found');
    if(row.status!==b.expected)throw new ApiError(409,'Request changed; refresh before reviewing');
    if(row.status!==b.status) {
     await c.query('UPDATE service_requests SET status=$1,admin_note=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$4',[b.status,b.note,actor,id]);
     await c.query('INSERT INTO service_request_events(request_id,actor_id,previous_status,new_status,note) VALUES($1,$2,$3,$4,$5)',[id,actor,row.status,b.status,b.note]);
     await audit('admin.add_money_request.'+b.status,id);
    }
    result={id,status:b.status,postingEnabled:false};
   } else if(method==='GET' && path==='/v1/admin/method-catalog') {
    result=(await c.query(`SELECT id,name,country,currency,logo_url,display_order,catalog_visible
      FROM payment_methods ORDER BY country,display_order,id`)).rows;
   } else if(method==='PATCH' && path==='/v1/admin/method-catalog') {
    const data=validateMethodCatalog(await body(req));
    const updated=await c.query(`UPDATE payment_methods SET name=$2,logo_url=$3,display_order=$4,catalog_visible=$5,updated_at=now()
      WHERE id=$1 RETURNING id,name,country,currency,logo_url,display_order,catalog_visible`,
      [data.id,data.name,data.logo_url,data.display_order,data.catalog_visible]);
    if(!updated.rowCount)throw new ApiError(404,'Payment method not found');
    result=updated.rows[0];
    await auditAdminControl('admin.method_catalog.update',data.id);
   } else if(method==='GET' && path==='/v1/admin/payment-methods') {
    result=(await c.query(`
      SELECT id,name,country,currency,display_order,add_money_request_enabled
      FROM payment_methods
      WHERE country='AE' AND currency='AED'
      ORDER BY display_order,id
    `)).rows;
   } else if(method==='PATCH' && path==='/v1/admin/payment-methods') {
    const data=validateAddMoneyMethod(await body(req));
    const updated=await c.query(`
      UPDATE payment_methods SET add_money_request_enabled=$1,updated_at=now()
      WHERE id=$2 AND country='AE' AND currency='AED'
      RETURNING id,name,add_money_request_enabled
    `,[data.add_money_request_enabled,data.id]);
    if(!updated.rowCount)throw new ApiError(404,'Add Money method not found');
    result=updated.rows[0];
    await auditAdminControl('admin.add_money_method.request_availability',data.id);
   } else if(method==='GET' && path==='/v1/admin/payment-accounts') {
    result=(await c.query(`
      SELECT id,payment_method_id,account_holder,account_number,iban,
             instructions,enabled,archived_at,updated_at
      FROM company_payment_accounts
      ORDER BY created_at DESC
      LIMIT 100
    `)).rows;
   } else if(method==='POST' && path==='/v1/admin/payment-accounts') {
    const b=await body(req);
    if(
      Object.keys(b).some(key=>![
        'payment_method_id','account_holder','account_number','iban','instructions'
      ].includes(key)) ||
      typeof b.payment_method_id!=='string' ||
      typeof b.account_holder!=='string' ||
      (b.account_number!=null && typeof b.account_number!=='string') ||
      (b.iban!=null && typeof b.iban!=='string') ||
      (b.instructions!=null && typeof b.instructions!=='string')
    )throw new ApiError(400,'Invalid account data');
    const data=validateAccount({
      payment_method_id:b.payment_method_id,
      account_holder:b.account_holder,
      account_number:b.account_number,
      iban:b.iban,
      instructions:b.instructions
    });
    const paymentMethod=await c.query(
      "SELECT id FROM payment_methods WHERE id=$1 AND country='AE' AND currency='AED'",
      [data.payment_method_id]
    );
    if(!paymentMethod.rowCount)throw new ApiError(400,'Unknown AED payment method');
    const inserted=await c.query(`
      INSERT INTO company_payment_accounts
        (payment_method_id,account_holder,account_number,iban,instructions,enabled)
      VALUES($1,$2,$3,$4,$5,FALSE)
      RETURNING id,enabled
    `,[data.payment_method_id,data.account_holder,data.account_number,data.iban,data.instructions]);
    result=inserted.rows[0];
    await auditAdminControl('admin.payment_account.create',inserted.rows[0].id);
    status=201;
   } else if(method==='PATCH' && path==='/v1/admin/payment-accounts') {
    const data=validateEnabledToggle(await body(req));
    const id=uuid(data.id);
    const updated=await c.query(`
      UPDATE company_payment_accounts SET enabled=$1,updated_at=now()
      WHERE id=$2 AND archived_at IS NULL
      RETURNING id,enabled
    `,[data.enabled,id]);
    if(!updated.rowCount)throw new ApiError(404,'Account not found');
    result=updated.rows[0];
    await auditAdminControl('admin.payment_account.status',id);
   } else if(method==='DELETE' && /^\/v1\/admin\/payment-accounts\/[0-9a-f-]{36}$/.test(path)) {
    const id=uuid(path.split('/').pop());
    const archived=await c.query(`
      UPDATE company_payment_accounts
      SET archived_at=now(),enabled=false,updated_at=now()
      WHERE id=$1 AND archived_at IS NULL
      RETURNING id
    `,[id]);
    if(!archived.rowCount)throw new ApiError(404,'Account not found');
    result={id,archived:true};
    await auditAdminControl('admin.payment_account.archive',id);
   } else if(method==='GET' && path==='/v1/admin/payout-banks') {
    result=(await c.query(`
      SELECT id,name,country,enabled,archived_at,created_at
      FROM payout_banks
      ORDER BY name,id
      LIMIT 100
    `)).rows;
   } else if(method==='POST' && path==='/v1/admin/payout-banks') {
    const b=await body(req);
    if(Object.keys(b).some(key=>key!=='name'))throw new ApiError(400,'Invalid payout bank data');
    const name=validateBankName(b.name);
    const inserted=await c.query(`
      INSERT INTO payout_banks(name,country,enabled)
      VALUES($1,'BD',FALSE)
      RETURNING id,name,country,enabled,archived_at,created_at
    `,[name]);
    result=inserted.rows[0];
    await auditAdminControl('admin.payout_bank.create',inserted.rows[0].id);
    status=201;
   } else if(method==='PATCH' && path==='/v1/admin/payout-banks') {
    const data=validateEnabledToggle(await body(req));
    const id=uuid(data.id);
    const updated=await c.query(`
      UPDATE payout_banks SET enabled=$1
      WHERE id=$2 AND country='BD' AND archived_at IS NULL
      RETURNING id,name,country,enabled
    `,[data.enabled,id]);
    if(!updated.rowCount)throw new ApiError(404,'Payout bank not found');
    result=updated.rows[0];
    await auditAdminControl('admin.payout_bank.status',id);
   } else if(method==='DELETE' && /^\/v1\/admin\/payout-banks\/[0-9a-f-]{36}$/.test(path)) {
    const id=uuid(path.split('/').pop());
    const archived=await c.query(`
      UPDATE payout_banks SET archived_at=now(),enabled=false
      WHERE id=$1 AND country='BD' AND archived_at IS NULL
      RETURNING id
    `,[id]);
    if(!archived.rowCount)throw new ApiError(404,'Payout bank not found');
    result={id,archived:true};
    await auditAdminControl('admin.payout_bank.archive',id);
   } else if(method==='GET' && path==='/v1/admin/users')
 result=(await c.query('SELECT id,email,name,status,role FROM customers ORDER BY created_at DESC LIMIT 100')).rows;
   else if(method==='GET' && path==='/v1/admin/support') result=(await c.query('SELECT id,customer_id,subject,message,status FROM support_tickets ORDER BY created_at DESC LIMIT 100')).rows;
   else if(method==='GET' && path==='/v1/admin/transactions') result=(await c.query('SELECT id,customer_id,status,created_at FROM transactions ORDER BY created_at DESC LIMIT 100')).rows;
   else if(method==='GET' && path==='/v1/admin/rates') result=(await c.query('SELECT pair,value,updated_at FROM rates')).rows;
   else if(method==='PATCH' && path==='/v1/admin/users') {
    const b=await body(req);const id=uuid(b.id);if(id===actor)throw new ApiError(400,'Cannot suspend your own account');
    if(!['active','suspended'].includes(String(b.status))) throw new ApiError(400,'Invalid status');
    await c.query('UPDATE customers SET status=$1 WHERE id=$2',[b.status,id]);
    if(b.status==='suspended')await c.query('DELETE FROM sessions WHERE customer_id=$1',[id]);await audit('admin.user.status',id);result={ok:true};
   } else if(method==='PATCH' && path==='/v1/admin/support') {
    const b=await body(req);if(!['open','in_progress','closed'].includes(String(b.status)))throw new ApiError(400,'Invalid status');
    const id=uuid(b.id);await c.query('UPDATE support_tickets SET status=$1 WHERE id=$2',[b.status,id]);await audit('admin.support.status',id);result={ok:true};
   } else if(method==='PUT' && path==='/v1/admin/rates') {
    const b=await body(req);const value=text(b.value,1,20);if(!/^\d{1,10}(\.\d{1,6})?$/.test(value)||Number(value)<=0)throw new ApiError(400,'Invalid rate');
    await c.query("INSERT INTO rates(pair,value) VALUES('AED/BDT',$1) ON CONFLICT(pair) DO UPDATE SET value=$1,updated_at=now()",[value]);await audit('admin.rate.configure','AED/BDT');result={ok:true,customerVisible:false};
   } else if (method === 'GET' && path === '/v1/payment-methods') {
  result = (await c.query(
    'SELECT id, name, country, currency, logo_url, display_order, enabled FROM payment_methods WHERE catalog_visible=true ORDER BY display_order, id'
  )).rows.map(({ enabled, logo_url, ...method }) => ({ ...method, logo_url: null, enabled: false }));
} else throw new ApiError(404,'Not found');
  }
  await c.query('COMMIT');
  if(attachment) {
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="receipt"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Strict-Transport-Security':'max-age=31536000'});
   res.end(attachment);
  } else send(res,status,result);
 } catch(e) {
  await c.query('ROLLBACK').catch(()=>{});
  const conflict=typeof e==='object' && e!==null && 'code' in e && e.code==='23505';
  const duplicatePayoutBank=typeof e==='object' && e!==null && 'constraint' in e && e.constraint==='payout_banks_active_name';
  const duplicateReceipt=typeof e==='object' && e!==null && 'constraint' in e && ['add_money_receipts_sha256_key','add_money_verified_reference'].includes(String(e.constraint));
  const status=e instanceof ApiError?e.status:conflict?409:500;
  // Never log passwords, tokens, beneficiary accounts, request bodies or raw SQL errors.
  console.error(JSON.stringify({event:'request.rejected',actor,status}));
  send(res,status,{error:e instanceof ApiError?e.message:duplicatePayoutBank?'Payout bank already exists':duplicateReceipt?'Receipt or payment reference already used':conflict?'An identical request is already pending review':'Request could not be completed'});
 } finally {c.release();}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT ?? 3000),'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{void pool.end();}));
