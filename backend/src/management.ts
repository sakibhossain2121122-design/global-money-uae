import type {PoolClient} from 'pg';
import {ApiError,text} from './security.ts';
import {fields,amount} from './add-money.ts';
export async function wallet(c:PoolClient,actor:string) {
 const w=(await c.query("SELECT id FROM wallets WHERE customer_id=$1 AND currency='AED' AND kind='customer'",[actor])).rows[0];
 if(!w)return {balance:null,available:null,held:null,currency:'AED',postingEnabled:false,availableForReservations:false};
 const totals=(await c.query(`SELECT
 (SELECT coalesce(sum(amount_minor),0) FROM ledger_entries WHERE wallet_id=$1)::text AS funded,
 (SELECT coalesce(sum(available_delta_minor),0) FROM reservation_journals WHERE customer_id=$2)::text AS available_delta,
 (SELECT coalesce(sum(held_delta_minor),0) FROM reservation_journals WHERE customer_id=$2)::text AS held`,[w.id,actor])).rows[0];
 const money=(n:bigint)=>{const absolute=n<0n?-n:n;return `${n<0n?'-':''}${absolute/100n}.${(absolute%100n).toString().padStart(2,'0')}`;};
 const funded=BigInt(totals.funded),held=BigInt(totals.held),available=funded+BigInt(totals.available_delta);
 return {balance:money(funded),available:money(available),held:money(held),currency:'AED',postingEnabled:false,availableForReservations:true};
}
export async function management(c:PoolClient,path:string,method:string,actor:string,body:()=>Promise<Record<string,unknown>>,audit:(action:string,target?:string|null)=>Promise<void>) {
 if(path==='/v1/request-options'&&method==='GET')return {data:{fees:(await c.query('SELECT provider,flat_aed FROM fee_rules WHERE enabled ORDER BY provider')).rows,countries:(await c.query('SELECT code,name,enabled FROM service_countries ORDER BY code')).rows,executionEnabled:false}};
 if(path==='/v1/wallet'&&method==='GET')return {data:await wallet(c,actor)};
 if(path==='/v1/request-history'&&method==='GET')return {data:(await c.query(`SELECT id,request_type,amount_aed,fee_aed,recipient_snapshot,status,
 CASE status WHEN 'under_review' THEN 'processing' ELSE status END AS display_status,
 false AS settlement_verified,created_at,updated_at FROM service_requests WHERE customer_id=$1 ORDER BY created_at DESC,id LIMIT 100`,[actor])).rows};
 if(path==='/v1/admin/reservation-journals'&&method==='GET')return {data:(await c.query('SELECT * FROM reservation_journals ORDER BY created_at DESC LIMIT 100')).rows};
 const type=path.match(/^\/v1\/admin\/(payment-methods|fees|countries)$/)?.[1];
 if(!type)return null;
 const table=type==='payment-methods'?'payment_methods':type==='fees'?'fee_rules':'service_countries';
 if(method==='GET')return {data:(await c.query(`SELECT * FROM ${table} ORDER BY ${type==='fees'?'provider':type==='countries'?'code':'display_order,id'} LIMIT 100`)).rows};
 if(!['POST','PATCH'].includes(method))return null;
 const b=await body();let id:string;
 if(type==='countries') {
  fields(b,['code','name','enabled']);id=text(b.code,2,2);if(!/^[A-Z]{2}$/.test(id)||typeof b.enabled!=='boolean')throw new ApiError(400,'Invalid country');
  await c.query('INSERT INTO service_countries(code,name,enabled) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET name=$2,enabled=$3,updated_at=now()',[id,text(b.name),b.enabled]);
 } else if(type==='fees') {
  fields(b,['provider','flat_aed','enabled']);id=text(b.provider);if(!['bKash','Nagad','Rocket','Upay','Bank'].includes(id)||typeof b.enabled!=='boolean')throw new ApiError(400,'Invalid fee');
  const fee=b.flat_aed==='0'||b.flat_aed==='0.00'?'0.00':amount(b.flat_aed);if(Number(fee)>10000)throw new ApiError(400,'Fee exceeds limit');
  await c.query('INSERT INTO fee_rules(provider,flat_aed,enabled) VALUES($1,$2,$3) ON CONFLICT(provider) DO UPDATE SET flat_aed=$2,enabled=$3,updated_at=now()',[id,fee,b.enabled]);
 } else {
  fields(b,['id','name','country','currency','display_order','enabled','request_enabled','logo_url']);id=text(b.id,2,40);
  if(!/^[a-z0-9_]+$/.test(id)||b.currency!=='AED'||typeof b.enabled!=='boolean'||!Number.isInteger(b.display_order)||Number(b.display_order)<0||Number(b.display_order)>10000)throw new ApiError(400,'Invalid method');
  if(b.request_enabled!==undefined&&typeof b.request_enabled!=='boolean')throw new ApiError(400,'Invalid request setting');
  const country=text(b.country,2,2);if(!/^[A-Z]{2}$/.test(country))throw new ApiError(400,'Invalid country');
  const suppliedLogo = b.logo_url === undefined ? undefined : (b.logo_url === '' ? null : text(b.logo_url, 9, 500));
  if (suppliedLogo) {
   let url: URL;
   try { url = new URL(suppliedLogo); } catch { throw new ApiError(400,'Invalid logo URL'); }
   if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError(400,'Logo must use an HTTPS URL');
  }
  await c.query('INSERT INTO payment_methods(id,name,country,currency,display_order,enabled,request_enabled,logo_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,country=$3,currency=$4,display_order=$5,enabled=$6,request_enabled=$7,logo_url=CASE WHEN $9 THEN $8 ELSE payment_methods.logo_url END,updated_at=now()',[id,text(b.name),country,b.currency,b.display_order,b.enabled,b.request_enabled??true,suppliedLogo??null,suppliedLogo!==undefined]);
 }
 await audit('admin.'+type+'.configure',id);return {data:{id,executionEnabled:false}};
}
