import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Row = Record<string, unknown>;
const tabs = ['users','support','transactions','pricing','payment-methods','payment-accounts','payout-banks','deposit-requests','send-money-requests','audit'] as const;

const labels: Record<string,string> = {
 users:'Customers',
 support:'Support',
 transactions:'Transactions',
 pricing:'Rates & fees',
 'payment-methods':'Payment methods', 'payment-accounts':'UAE accounts', 'payout-banks':'Bangladesh banks', audit:'Audit trail',
 'deposit-requests':'Add Money',
 'send-money-requests':'Send Money'
};
type Tab = typeof tabs[number];
function App() {
 const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [tab,setTab]=useState<Tab>('users'),[rows,setRows]=useState<Row[]>([]),[rate,setRate]=useState(''),[form,setForm]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[from,setFrom]=useState(''),[to,setTo]=useState('');
 async function api(path:string,method='GET',body?:unknown,bearer=token) {
  const response=await fetch('/v1/'+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'});
  if(!response.ok){if(response.status===401){setToken('');setRows([]);}throw new Error(response.status===403?'Administrator access required.':'Request failed ('+response.status+').');}
  return response.json();
 }
 async function perform(work:()=>Promise<void>) {setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function load(value:Tab=tab){const data=await api('admin/'+value);setRows(Array.isArray(data)?data:(value==='pricing'?[...data.rates,...data.fees]:[]));setTab(value);setForm({});}
 async function signIn(e:React.FormEvent){e.preventDefault();await perform(async()=>{const secret=password;setPassword('');const session=await api('auth/login','POST',{email,password:secret},'');const user=await api('me','GET',undefined,session.token);if(user.role!=='admin'){await api('auth/logout','POST',{},session.token);throw new Error('Administrator access required.');}const data=await api('admin/users','GET',undefined,session.token);setToken(session.token);setRows(data);setTab('users');setEmail('');});}

 const requestTab = tab==='deposit-requests' ||
                    tab==='send-money-requests';

 async function reviewRequest(
   row:Row,
   status:string,
   reference?:string
 ) {
   await perform(async()=>{
     await api('admin/'+tab,'PATCH',{
       id:row.id,
       status,expectedStatus:row.status,
       ...(reference?{transactionReference:reference}:{})
     });
     await load();
   });
 }

 async function editReference(row:Row,reference:string) {
   await perform(async()=>{
     const endpoint=tab==='deposit-requests'
       ? 'admin/deposit-reference'
       : 'admin/send-money-reference';

     await api(endpoint,'PATCH',{
       id:row.id,
       transactionReference:reference
     });
     await load();
   });
 }

 function askReference(row:Row,edit=false) {
   const value=window.prompt(
     'Enter test TRX ID (TEST- prefix required)',
     String(row.transaction_reference??'TEST-')
   );

   if(value===null)return;

   const reference=value.trim().toUpperCase();

   if(!/^TEST-[A-Z0-9-]{3,60}$/.test(reference)){
     setError('Valid test TRX ID required');
     return;
   }

   if(edit)void editReference(row,reference);
   else void reviewRequest(row,'successful',reference);
 }

 const visibleRows=useMemo(()=>rows.filter(row=>{if(tab!=='transactions')return true;const value=String(row.created_at??row.updated_at??'').slice(0,10);return (!from||!value||value>=from)&&(!to||!value||value<=to);}),[rows,from,to,tab]);
 return <main><header><span className="mark">GM</span><div><h1>GLOBAL MONEY UAE</h1><p>RECONSTRUCTED 1.5.0 · CONTROL CENTRE</p></div><span className="stage">STAGING</span></header>
 <aside role="status">Safety lock: real payments, wallet posting, identity uploads and payouts are disabled. No balances or rates are fabricated.</aside>
 {error&&<p role="alert" className="error">{error}</p>}
 {!token?<form className="login" onSubmit={e=>void signIn(e)}><h2>Administrator sign in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form>:
 <><nav aria-label="Admin sections">{tabs.map(value=><button key={value} disabled={busy} aria-pressed={tab===value} onClick={()=>void perform(()=>load(value))}>{labels[value]}</button>)}<button className="logout" disabled={busy} onClick={()=>void perform(async()=>{await api('auth/logout','POST',{});setToken('');setRows([]);})}>Sign out</button></nav>
 <section><div className="section-head"><div><p className="eyebrow">CONTROL CENTRE</p><h2>{labels[tab]}</h2></div><button className="secondary" disabled={busy} onClick={()=>void perform(()=>load())}>Refresh</button></div>
 {tab==='pricing'&&<form className="editor" onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('admin/pricing','PUT',{rate,service:form.service??'send_money',fixed_aed:form.fixed_aed??'0',percent:form.percent??'0',enabled:form.enabled==='true'});await load();});}}><h3>Manual staging configuration</h3><label>AED → BDT rate<input value={rate} required inputMode="decimal" onChange={e=>setRate(e.target.value)}/></label><label>Service<select value={form.service??'send_money'} onChange={e=>setForm({...form,service:e.target.value})}><option value="send_money">Send Money</option><option value="add_money">Add Money</option></select></label>{['fixed_aed','percent'].map(k=><label key={k}>{k.replace('_',' ')}<input value={form[k]??'0'} inputMode="decimal" onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label><input type="checkbox" checked={form.enabled==='true'} onChange={e=>setForm({...form,enabled:String(e.target.checked)})}/>Publish configured staging fee</label><button disabled={busy}>Save rate & fee</button><p>Manual staging quote only. No market rate is invented. No payment executes.</p></form>}
 {['payment-methods','payment-accounts','payout-banks'].includes(tab)&&<form className="editor" onSubmit={e=>{e.preventDefault();void perform(async()=>{
  const payload:Record<string,unknown>={...form};
  if(tab==='payment-methods'){payload.display_order=Number(form.display_order);payload.staging_enabled=form.staging_enabled==='true';}
  else payload.enabled=form.enabled==='true';
  await api('admin/'+tab,form.id?'PATCH':'POST',payload);await load();
 });}}><h3>{form.id?'Edit selected record':tab==='payment-methods'?'Select a method below':'New staging record'}</h3>
 {(tab==='payment-methods'?['id','name','display_order']:tab==='payment-accounts'?['payment_method_id','label','test_reference']:['name','code']).map(k=><label key={k}>{k.replaceAll('_',' ')}<input required value={form[k]??''} disabled={k==='id'||(tab==='payment-methods'&&!form.id)} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
 <label><input type="checkbox" checked={form[tab==='payment-methods'?'staging_enabled':'enabled']==='true'} onChange={e=>setForm({...form,[tab==='payment-methods'?'staging_enabled':'enabled']:String(e.target.checked)})}/>Enable for staging catalogue / synthetic requests</label>
 <button disabled={busy||(tab==='payment-methods'&&!form.id)}>Save staging configuration</button><p>Neutral labels only. UAE references must start TEST-. Never enter real banking credentials. These controls cannot enable real payments.</p></form>}
 {tab==='transactions'&&<div className="filters"><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
 {visibleRows.length===0?<p className="empty">No records returned by the API.</p>:<div className="table-wrap"><table><thead><tr>{Object.keys(visibleRows[0]).map(key=><th key={key}>{key.replaceAll('_',' ')}</th>)}{(['users','support','payment-methods','payment-accounts','payout-banks'].includes(tab)||requestTab)&&<th className="actions">Controls</th>}</tr></thead><tbody>{visibleRows.map((row,index)=><tr key={String(row.id??index)}>{Object.entries(row).map(([key,value])=><td key={key}>{value===null?'—':key==='status'&&value==='successful'?'Successful (Staging)':String(value)}</td>)}{tab==='users'&&<td><button className="small" disabled={busy||row.id===undefined} onClick={()=>void perform(async()=>{await api('admin/users','PATCH',{id:row.id,status:row.status==='suspended'?'active':'suspended'});await load();})}>{row.status==='suspended'?'Reactivate':'Suspend'}</button></td>}{['payment-methods','payment-accounts','payout-banks'].includes(tab)&&<td><button disabled={busy} onClick={()=>setForm(Object.fromEntries(Object.entries(row).filter(([k])=>['id','name','display_order','staging_enabled','payment_method_id','label','test_reference','enabled','code'].includes(k)).map(([k,v])=>[k,String(v)])))}>Edit</button></td>}{tab==='support'&&<td><button disabled={busy} onClick={()=>{const message=window.prompt('Reply to this customer. Do not include credentials.');if(message)void perform(async()=>{await api('admin/support/'+row.id+'/replies','POST',{message});await load();});}}>Reply</button><select aria-label="Ticket status" value={String(row.status??'open')} disabled={busy} onChange={e=>void perform(async()=>{await api('admin/support','PATCH',{id:row.id,status:e.target.value});await load();})}><option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option></select></td>}
 {requestTab&&<td className="actions">
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   {['pending','under_review'].includes(String(row.status))&&<>
     <button disabled={busy}
       onClick={()=>askReference(row)}>
       Successful (Staging)
     </button>
     <button disabled={busy}
       onClick={()=>{
         if(window.confirm('Reject this test request?'))
           void reviewRequest(row,'rejected');
       }}>
       Reject
     </button>
   </>}
   {row.status==='successful'&&
     <button disabled={busy}
       onClick={()=>askReference(row,true)}>
       Edit TRX ID
     </button>
   }
   </div>
 </td>}</tr>)}</tbody></table></div>}
 <p className="footnote">Read-only transaction data · records are never synthesized here · date filters apply to returned timestamps.</p></section></>}
 <footer>Admin sessions are held in memory only. Closing or reloading the page requires signing in again. Staging API: global-money-uae-staging-api.onrender.com</footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
