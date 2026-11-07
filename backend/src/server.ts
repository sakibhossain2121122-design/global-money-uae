import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pg from 'pg';
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
  let result: unknown; let status=200;
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
   else if(method==='GET' && path==='/v1/wallet') result={balance:null,currency:'AED',postingEnabled:false};
   else if(method==='GET' && path==='/v1/rates') result={pair:'AED/BDT',value:null,available:false};
   else if(method==='GET' && path==='/v1/kyc') result={status:'unavailable',documentsAccepted:false};
   else if(method==='GET' && path==='/v1/transactions') result=(await c.query('SELECT id,status,created_at FROM transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='GET' && path==='/v1/beneficiaries') result=(await c.query('SELECT id,name,provider,account,bank FROM beneficiaries WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='POST' && path==='/v1/beneficiaries') {const b=beneficiary(await body(req));result=(await c.query('INSERT INTO beneficiaries(customer_id,name,provider,account,bank) VALUES($1,$2,$3,$4,$5) RETURNING id',[actor,b.name,b.provider,b.account,b.bank])).rows[0];await audit('beneficiary.create',(result as {id:string}).id);status=201;}
   else if(method==='DELETE' && /^\/v1\/beneficiaries\/[0-9a-f-]{36}$/.test(path)) {await c.query('DELETE FROM beneficiaries WHERE id=$1 AND customer_id=$2',[uuid(path.split('/').pop()),actor]);await audit('beneficiary.delete');result={ok:true};}
   else if(method==='GET' && path==='/v1/support') result=(await c.query('SELECT id,subject,status,created_at FROM support_tickets WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[actor])).rows;
   else if(method==='POST' && path==='/v1/support') {const b=await body(req);result=(await c.query('INSERT INTO support_tickets(customer_id,subject,message) VALUES($1,$2,$3) RETURNING id',[actor,text(b.subject),text(b.message,1,2000)])).rows[0];await audit('support.create');status=201;}
   else if(method==='GET' && path==='/v1/admin/users') result=(await c.query('SELECT id,email,name,status,role FROM customers ORDER BY created_at DESC LIMIT 100')).rows;
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
    'SELECT id, name, country, currency, logo_url, display_order, enabled FROM payment_methods ORDER BY display_order, id'
  )).rows.map(({ enabled, ...method }) => ({ ...method, enabled: false }));
} else throw new ApiError(404,'Not found');
  }
  await c.query('COMMIT');send(res,status,result);
 } catch(e) {
  await c.query('ROLLBACK').catch(()=>{});
  const status=e instanceof ApiError?e.status:500;
  // Never log passwords, tokens, beneficiary accounts, request bodies or raw SQL errors.
  console.error(JSON.stringify({event:'request.rejected',actor,status}));
  send(res,status,{error:e instanceof ApiError?e.message:'Request could not be completed'});
 } finally {c.release();}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT ?? 3000),'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{void pool.end();}));
