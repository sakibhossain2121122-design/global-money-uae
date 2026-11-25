import type { PoolClient } from 'pg';
import { ApiError, text, uuid } from './security.ts';

type User = {id:string; role:string};
type Context = {c:PoolClient; path:string; method:string|undefined; user:User; body:()=>Promise<Record<string,unknown>>; audit:(action:string,target?:string|null)=>Promise<void>};
const bool = (v:unknown) => {if(typeof v!=='boolean')throw new ApiError(400,'Boolean required');return v;};
const decimal = (v:unknown,max:number) => {const s=String(v??'');if(!/^\d{1,8}(\.\d{1,6})?$/.test(s)||Number(s)>max)throw new ApiError(400,'Invalid numeric configuration');return s;};
function fields(b:Record<string,unknown>,allowed:string[]) {if(Object.keys(b).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported fields');}
export async function premium15(ctx:Context):Promise<{data:unknown;status?:number}|null> {
 const {c,path,method,user,body,audit}=ctx;
 if(path.startsWith('/v1/admin/')&&user.role!=='admin')throw new ApiError(403,'Forbidden');
 const query=async(sql:string,values:unknown[]=[]) => (await c.query(sql,values)).rows;
 if(method==='GET'&&path==='/v1/overview') {
  const rates=await query("SELECT pair,value,updated_at FROM rates WHERE pair='AED/BDT'");
  const fees=await query('SELECT service,fixed_aed,percent,enabled FROM service_fees ORDER BY service');
  return {data:{release:'reconstructed-1.5.0',staging:true,balance:null,currency:'AED',postingEnabled:false,payoutEnabled:false,documentsAccepted:false,rate:rates[0]??null,rateSource:'admin_manual_staging',fees,syntheticRequestsEnabled:process.env.SYNTHETIC_REQUESTS_ENABLED==='true'}};
 }
 if(method==='GET'&&path==='/v1/staging-methods')return {data:await query('SELECT id,name,country,currency,staging_enabled FROM payment_methods ORDER BY display_order,id')};
 if(method==='GET'&&path==='/v1/payout-banks')return {data:await query('SELECT id,name,code FROM payout_banks WHERE enabled=true ORDER BY name')};
 if(path==='/v1/admin/payment-methods') {
  if(method==='GET')return {data:await query('SELECT id,name,display_order,staging_enabled FROM payment_methods ORDER BY display_order,id')};
  if(method==='PATCH') {
   const b=await body();fields(b,['id','name','display_order','staging_enabled']);const id=text(b.id,1,80);
   if(!Number.isInteger(b.display_order)||Number(b.display_order)<0||Number(b.display_order)>10000)throw new ApiError(400,'Invalid display order');
   const rows=await query('UPDATE payment_methods SET name=$1,display_order=$2,staging_enabled=$3,updated_at=now() WHERE id=$4 RETURNING id',[text(b.name,1,100),b.display_order,bool(b.staging_enabled),id]);
   if(!rows.length)throw new ApiError(404,'Method not found');await audit('admin.staging_method.update',id);return {data:{ok:true,postingEnabled:false}};
  }
 }
 if(path==='/v1/admin/payment-accounts'||path==='/v1/admin/payout-banks') {
  const accounts=path.endsWith('payment-accounts');const table=accounts?'staging_payment_accounts':'payout_banks';
  if(method==='GET')return {data:await query('SELECT * FROM '+table+' ORDER BY updated_at DESC LIMIT 100')};
  if(method==='POST'||method==='PATCH') {
   const b=await body();fields(b,accounts?['id','payment_method_id','label','test_reference','enabled']:['id','name','code','enabled']);
   const values:unknown[]=accounts?[text(b.payment_method_id,1,80),text(b.label,1,100),text(b.test_reference,1,65),bool(b.enabled),user.id]:[text(b.name,1,100),text(b.code,2,30),bool(b.enabled),user.id];
   if(accounts&&!/^TEST-[A-Z0-9-]{3,60}$/.test(String(values[2])))throw new ApiError(400,'TEST reference required; real account details are prohibited');
   if(!accounts&&!/^[A-Z0-9_]{2,30}$/.test(String(values[1])))throw new ApiError(400,'Invalid bank code');
   const cols=accounts?['payment_method_id','label','test_reference','enabled','updated_by']:['name','code','enabled','updated_by'];
   let rows;
   if(method==='POST')rows=await query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,values);
   else {values.push(uuid(b.id));rows=await query(`UPDATE ${table} SET ${cols.map((col,i)=>col+'=$'+(i+1)).join(',')},updated_at=now() WHERE id=$${values.length} RETURNING id`,values);}
   if(!rows.length)throw new ApiError(404,'Record not found');await audit('admin.'+table+'.'+(method==='POST'?'create':'update'),rows[0].id);return {data:{id:rows[0].id,staging:true},status:method==='POST'?201:200};
  }
 }
 if(path==='/v1/admin/pricing') {
  if(method==='GET')return {data:{rates:await query('SELECT pair,value,updated_at FROM rates'),fees:await query('SELECT service,fixed_aed,percent,enabled FROM service_fees ORDER BY service')}};
  if(method==='PUT') {
   const b=await body();fields(b,['rate','service','fixed_aed','percent','enabled']);
   if(!['add_money','send_money'].includes(String(b.service)))throw new ApiError(400,'Invalid service');
   const rate=decimal(b.rate,100000);if(Number(rate)<=0)throw new ApiError(400,'Positive rate required');
   await c.query("INSERT INTO rates(pair,value) VALUES('AED/BDT',$1) ON CONFLICT(pair) DO UPDATE SET value=$1,updated_at=now()",[rate]);
   await c.query(`INSERT INTO service_fees(service,fixed_aed,percent,enabled,updated_by) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(service) DO UPDATE SET fixed_aed=$2,percent=$3,enabled=$4,updated_by=$5,updated_at=now()`,[b.service,decimal(b.fixed_aed,100000),decimal(b.percent,100),bool(b.enabled),user.id]);
   await audit('admin.staging_pricing.update',String(b.service));return {data:{ok:true,source:'admin_manual_staging'}};
  }
 }
 if(method==='GET'&&path==='/v1/admin/audit')return {data:await query('SELECT id,actor_id,action,target,created_at FROM audit_logs ORDER BY id DESC LIMIT 100')};
 if(/^\/v1\/(admin\/)?support\/[0-9a-f-]{36}\/replies$/.test(path)) {
  const id=uuid(path.split('/').at(-2));const rows=await query('SELECT customer_id FROM support_tickets WHERE id=$1',[id]);
  if(!rows.length||(user.role!=='admin'&&rows[0].customer_id!==user.id))throw new ApiError(404,'Ticket not found');
  if(method==='GET')return {data:await query('SELECT r.id,r.message,r.created_at,c.role FROM support_replies r JOIN customers c ON c.id=r.actor_id WHERE r.ticket_id=$1 ORDER BY r.created_at,r.id',[id])};
  if(method==='POST') {const b=await body();fields(b,['message']);await c.query('INSERT INTO support_replies(ticket_id,actor_id,message) VALUES($1,$2,$3)',[id,user.id,text(b.message,1,4000)]);await audit('support.reply',id);return {data:{ok:true},status:201};}
 }
 return null;
}
