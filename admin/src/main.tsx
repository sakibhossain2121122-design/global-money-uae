import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Row = Record<string, unknown>;
const tabs = ['users','support','transactions','rates'] as const;
type Tab = typeof tabs[number];
function App() {
 const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [tab,setTab]=useState<Tab>('users'),[rows,setRows]=useState<Row[]>([]),[rate,setRate]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[from,setFrom]=useState(''),[to,setTo]=useState('');
 async function api(path:string,method='GET',body?:unknown,bearer=token) {
  const response=await fetch('/v1/'+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'});
  if(!response.ok){if(response.status===401){setToken('');setRows([]);}throw new Error(response.status===403?'Administrator access required.':'Request failed ('+response.status+').');}
  return response.json();
 }
 async function perform(work:()=>Promise<void>) {setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function load(value:Tab=tab){const data=await api('admin/'+value);setRows(Array.isArray(data)?data:[]);setTab(value);}
 async function signIn(e:React.FormEvent){e.preventDefault();await perform(async()=>{const secret=password;setPassword('');const session=await api('auth/login','POST',{email,password:secret},'');const user=await api('me','GET',undefined,session.token);if(user.role!=='admin'){await api('auth/logout','POST',{},session.token);throw new Error('Administrator access required.');}const data=await api('admin/users','GET',undefined,session.token);setToken(session.token);setRows(data);setTab('users');setEmail('');});}
 const visibleRows=useMemo(()=>rows.filter(row=>{const value=String(row.created_at??row.updated_at??'').slice(0,10);return (!from||!value||value>=from)&&(!to||!value||value<=to);}),[rows,from,to]);
 return <main><header><span className="mark">GM</span><div><h1>GLOBAL MONEY UAE</h1><p>Premium staging administration · restricted access</p></div><span className="stage">STAGING</span></header>
 <aside role="status">Safety lock: real payments, wallet posting, identity uploads and payouts are disabled. No balances or rates are fabricated.</aside>
 {error&&<p role="alert" className="error">{error}</p>}
 {!token?<form className="login" onSubmit={e=>void signIn(e)}><h2>Administrator sign in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form>:
 <><nav aria-label="Admin sections">{tabs.map(value=><button key={value} disabled={busy} aria-pressed={tab===value} onClick={()=>void perform(()=>load(value))}>{value==='users'?'Customers':value==='support'?'Support':value==='transactions'?'Transactions':'Rates'}</button>)}<button className="logout" disabled={busy} onClick={()=>void perform(async()=>{await api('auth/logout','POST',{});setToken('');setRows([]);})}>Sign out</button></nav>
 <section><div className="section-head"><div><p className="eyebrow">CONTROL CENTRE</p><h2>{tab==='users'?'Customer management':tab==='support'?'Support tickets':tab==='transactions'?'Transaction library':'AED / BDT rate settings'}</h2></div><button className="secondary" disabled={busy} onClick={()=>void perform(()=>load())}>Refresh</button></div>
 {tab==='rates'&&<form className="rate-form" onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('admin/rates','PUT',{value:rate});setRate('');await load();});}}><label>Manually configured AED/BDT rate<input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} placeholder="Enter an authorized rate" required pattern="[0-9]+(\\.[0-9]{1,6})?"/></label><button disabled={busy}>Save rate</button><p>Rates are shown only when configured by an authorized admin. Automated provider integration is not active.</p></form>}
 {tab==='transactions'&&<div className="filters"><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
 {visibleRows.length===0?<p className="empty">No records returned by the API.</p>:<div className="table-wrap"><table><thead><tr>{Object.keys(visibleRows[0]).map(key=><th key={key}>{key.replaceAll('_',' ')}</th>)}{['users','support'].includes(tab)&&<th>Controls</th>}</tr></thead><tbody>{visibleRows.map((row,index)=><tr key={String(row.id??index)}>{Object.entries(row).map(([key,value])=><td key={key}>{value===null?'—':String(value)}</td>)}{tab==='users'&&<td><button className="small" disabled={busy||row.id===undefined} onClick={()=>void perform(async()=>{await api('admin/users','PATCH',{id:row.id,status:row.status==='suspended'?'active':'suspended'});await load();})}>{row.status==='suspended'?'Reactivate':'Suspend'}</button></td>}{tab==='support'&&<td><select aria-label="Ticket status" value={String(row.status??'open')} disabled={busy} onChange={e=>void perform(async()=>{await api('admin/support','PATCH',{id:row.id,status:e.target.value});await load();})}><option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option></select></td>}</tr>)}</tbody></table></div>}
 <p className="footnote">Read-only transaction data · records are never synthesized here · date filters apply to returned timestamps.</p></section></>}
 <footer>Admin sessions are held in memory only. Closing or reloading the page requires signing in again. Staging API: global-money-uae-staging-api.onrender.com</footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
