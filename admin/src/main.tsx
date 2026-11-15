import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Row = Record<string, unknown>;
type Tab = 'users' | 'support' | 'transactions' | 'rates' | 'add-money' |
  'add-money-requests' | 'payment-accounts' | 'payout-banks';

const headings: Record<Tab, string> = {
 users:'Users',
 support:'Support',
 transactions:'Transactions',
 rates:'Rates',
 'add-money':'Add Money',
 'add-money-requests':'Add Money Requests',
 'payment-accounts':'UAE Payment Accounts',
 'payout-banks':'Bangladesh Payout Banks'
};

function display(value: unknown): string {
 return value === null || value === undefined || value === '' ? '—' : String(value);
}

function mask(value: unknown): string {
 if (typeof value !== 'string' || value.length === 0) return '—';
 return `•••• ${value.slice(-4)}`;
}

function App() {
 const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [tab,setTab]=useState<Tab>('users'),[rows,setRows]=useState<Row[]>([]),[rate,setRate]=useState('');
 const [methods,setMethods]=useState<Row[]>([]);
 const [account,setAccount]=useState({payment_method_id:'',account_holder:'',account_number:'',iban:'',instructions:''});
 const [bankName,setBankName]=useState('');
 const [events,setEvents]=useState<Row[]>([]),[eventRequest,setEventRequest]=useState('');
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);

 async function api<T=unknown>(path:string,method='GET',body?:unknown,bearer=token):Promise<T> {
  const r=await fetch('/v1/'+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'});
  if(!r.ok){
   if(r.status===401){setToken('');setRows([]);setMethods([]);}
   throw new Error(r.status===403?'Administrator access required.':r.status===409?'A conflicting record already exists or the request changed. Refresh and try again.':'Request failed ('+r.status+').');
  }
  return await r.json() as T;
 }
 async function perform(work:()=>Promise<void>) {setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 function endpoint(value:Tab):string {
  if(value==='add-money') return 'payment-methods';
  if(value==='payment-accounts') return 'payment-accounts';
  if(value==='payout-banks') return 'payout-banks';
  return value;
 }
 async function load(value:Tab=tab) {
  const data=await api<Row[]>('admin/'+endpoint(value));
  setRows(data);
  setTab(value);
  if(value==='payment-accounts') {
   const available=await api<Row[]>('admin/payment-methods');
   setMethods(available);
   if(!account.payment_method_id && available.length) setAccount({...account,payment_method_id:String(available[0].id)});
  }
 }
 function changeTab(value:Tab) {void perform(async()=>{setEvents([]);setEventRequest('');await load(value);});}
 async function refresh() {await load();setEvents([]);setEventRequest('');}

 return <main><header><span className="mark">GM</span><div><h1>GLOBAL MONEY UAE</h1><p>Administration • Restricted access</p></div></header>
 <aside>Real payments, wallet credits, transfers and identity-document uploads are disabled. Service not yet available.</aside>
 {error && <p role="alert" className="error">{error}</p>}
 {!token ? <form onSubmit={e=>{e.preventDefault();void perform(async()=>{
  const secret=password;setPassword('');
  const session=await api<{token:string}>('auth/login','POST',{email,password:secret});
  const user=await api<{role:string}>('me','GET',undefined,session.token);
  if(user.role!=='admin'){await api('auth/logout','POST',{},session.token);throw new Error('Administrator access required.');}
  const data=await api<Row[]>('admin/users','GET',undefined,session.token);
  setToken(session.token);setRows(data);setEmail('');setTab('users');
 });}}><h2>Sign in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form> : <>
 <nav>{(['users','support','transactions','rates','add-money','add-money-requests','payment-accounts','payout-banks'] as Tab[]).map(value=><button key={value} disabled={busy} aria-pressed={tab===value} onClick={()=>changeTab(value)}>{headings[value]}</button>)}<button disabled={busy} onClick={()=>void perform(async()=>{await api('auth/logout','POST',{});setToken('');setRows([]);setMethods([]);})}>Logout</button></nav>
 <section><h2>{headings[tab]}</h2>
 {tab==='add-money'&&<><p>Controls which AED payment methods customers may select for a review-only Add Money request. This does not enable payment collection or wallet credit.</p><button disabled={busy} onClick={()=>void perform(refresh)}>Refresh methods</button></>}
 {tab==='add-money-requests'&&<><p>Request review only. No payment verification, wallet credit or balance adjustment. Never treat a note as proof of payment.</p><button disabled={busy} onClick={()=>void perform(refresh)}>Refresh requests</button></>}
 {tab==='payment-accounts'&&<><p>UAE payment account directory. Administrative status does not activate payment processing.</p><form onSubmit={e=>{e.preventDefault();if(!account.account_number.trim()&&!account.iban.trim()){setError('Enter an account number or an IBAN.');return;}void perform(async()=>{
  await api('admin/payment-accounts','POST',account);
  setAccount({...account,account_holder:'',account_number:'',iban:'',instructions:''});
  await load();
 });}}><h3>Add payment account</h3><label>Payment method<select required value={account.payment_method_id} onChange={e=>setAccount({...account,payment_method_id:e.target.value})}><option value="" disabled>Select AED method</option>{methods.map(method=><option key={String(method.id)} value={String(method.id)}>{display(method.name)}</option>)}</select></label><label>Account holder<input required maxLength={150} value={account.account_holder} onChange={e=>setAccount({...account,account_holder:e.target.value})}/></label><label>Account number<input autoComplete="off" maxLength={50} value={account.account_number} onChange={e=>setAccount({...account,account_number:e.target.value})}/></label><label>IBAN<input autoComplete="off" maxLength={34} value={account.iban} onChange={e=>setAccount({...account,iban:e.target.value.toUpperCase()})}/></label><label>Instructions<input maxLength={500} value={account.instructions} onChange={e=>setAccount({...account,instructions:e.target.value})}/></label><button disabled={busy||methods.length===0}>Add account (disabled by default)</button></form></>}
 {tab==='payout-banks'&&<><p>Bangladesh payout bank directory only. Bank entries do not initiate or authorize transfers.</p><form onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('admin/payout-banks','POST',{name:bankName});setBankName('');await load();});}}><h3>Add Bangladesh bank</h3><label>Bank name<input required maxLength={120} value={bankName} onChange={e=>setBankName(e.target.value)}/></label><button disabled={busy}>Add bank (disabled by default)</button></form></>}
 {tab==='rates'&&<form onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('admin/rates','PUT',{value:rate});setRate('');await load();});}}><p>Internal AED/BDT configuration only. Customer rates remain unavailable.</p><label>Rate<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" value={rate} required onChange={e=>setRate(e.target.value)}/></label><button disabled={busy}>Save configuration</button></form>}
 {rows.length===0?<p>No records.</p>:<div className="table"><table><thead><tr>{Object.keys(rows[0]).map(key=><th key={key}>{key}</th>)}{['users','support','add-money','add-money-requests','payment-accounts','payout-banks'].includes(tab)&&<th>Action</th>}</tr></thead><tbody>{rows.map((row,i)=>{
  const id=String(row.id??i),archived=row.archived_at!==null&&row.archived_at!==undefined;
  return <tr key={id}>{Object.keys(rows[0]).map(key=><td key={key} data-label={key}>{tab==='payment-accounts'&&(key==='account_number'||key==='iban')?mask(row[key]):display(row[key])}</td>)}
  {tab==='add-money'&&<td data-label="Request availability"><button disabled={busy} onClick={()=>void perform(async()=>{await api('admin/payment-methods','PATCH',{id:row.id,add_money_request_enabled:!row.add_money_request_enabled});await load();})}>{row.add_money_request_enabled?'Disable requests':'Allow requests'}</button></td>}
  {tab==='add-money-requests'&&<td data-label="Review"><label>Review note<input maxLength={500} value={reviewNotes[id]??''} onChange={e=>setReviewNotes({...reviewNotes,[id]:e.target.value})}/></label><select disabled={busy} aria-label={'Request status '+id} value={String(row.status)} onChange={e=>{const status=e.target.value;void perform(async()=>{await api('admin/add-money-requests/'+id,'PATCH',{status,expected_status:row.status,note:reviewNotes[id]??''});setEvents([]);setEventRequest('');await load();});}}>{['pending','under_review','rejected','cancelled'].map(value=><option key={value}>{value}</option>)}</select><button disabled={busy} onClick={()=>void perform(async()=>{setEvents(await api<Row[]>('admin/add-money-requests/'+id+'/events'));setEventRequest(id);})}>View audit events</button></td>}
  {tab==='users'&&<td data-label="Action"><button disabled={busy} onClick={()=>void perform(async()=>{await api('admin/users','PATCH',{id:row.id,status:row.status==='active'?'suspended':'active'});await load();})}>{row.status==='active'?'Suspend':'Activate'}</button></td>}
  {tab==='support'&&<td data-label="Action"><select disabled={busy} aria-label={'Ticket status '+id} value={String(row.status)} onChange={e=>{const status=e.target.value;void perform(async()=>{await api('admin/support','PATCH',{id,status});await load();});}}>{['open','in_progress','closed'].map(status=><option key={status}>{status}</option>)}</select></td>}
  {['payment-accounts','payout-banks'].includes(tab)&&<td data-label="Action">{archived?<span>Archived</span>:<><button disabled={busy} onClick={()=>void perform(async()=>{const path=tab==='payment-accounts'?'payment-accounts':'payout-banks';await api('admin/'+path,'PATCH',{id,enabled:!row.enabled});await load();})}>{row.enabled?'Disable':'Enable record'}</button><button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{if(!window.confirm('Archive this record?'))return;const path=tab==='payment-accounts'?'payment-accounts':'payout-banks';await api('admin/'+path+'/'+id,'DELETE');await load();})}>Archive</button></>}</td>}
  </tr>;
 })}</tbody></table></div>}
 {tab==='add-money-requests'&&eventRequest&&<div aria-live="polite"><h3>Audit events • {eventRequest}</h3>{events.map(event=><p key={String(event.id)}>{display(event.created_at)} • {display(event.previous_status)} → {display(event.new_status)} • {display(event.actor_id)} {event.note?'• '+String(event.note):null}</p>)}</div>}
 <p>Most recent 100 records. Transactions are read only.</p></section></>}
 <footer>Tokens stay in memory. Closing or reloading this page requires signing in again.</footer></main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
