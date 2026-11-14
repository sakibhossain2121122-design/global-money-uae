import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Row = Record<string,string>;
function App() {
 const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [tab,setTab]=useState('users'),[rows,setRows]=useState<Row[]>([]),[rate,setRate]=useState('');
 const [events,setEvents]=useState<Row[]>([]),[eventRequest,setEventRequest]=useState('');
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function api(path:string,method='GET',body?:unknown,bearer=token) {
  const r=await fetch('/v1/'+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store'});
  if(!r.ok){if(r.status===401){setToken('');setRows([]);}throw new Error(r.status===403?'Administrator access required.':r.status===409?'Request changed or a matching active request exists. Refresh requests before reviewing again.':'Request failed ('+r.status+').');}
  return r.json();
 }
 async function perform(work:()=>Promise<void>) {setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function load(value=tab){const data=await api('admin/'+value);setRows(data);setTab(value);}
 return <main><header><span className="mark">GM</span><div><h1>GLOBAL MONEY UAE</h1><p>Administration • Restricted access</p></div></header>
 <aside>Financial services and identity-document uploads are disabled. Service not yet available.</aside>
 {error && <p role="alert" className="error">{error}</p>}
 {!token ? <form onSubmit={e=>{e.preventDefault();void perform(async()=>{
  const secret=password;setPassword('');const session=await api('auth/login','POST',{email,password:secret});
  const user=await api('me','GET',undefined,session.token);
  if(user.role!=='admin'){await api('auth/logout','POST',{},session.token);throw new Error('Administrator access required.');}
  const data=await api('admin/users','GET',undefined,session.token);setToken(session.token);setRows(data);setEmail('');setTab('users');
 });}}><h2>Sign in</h2><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Sign in</button></form> : <>
 <nav>{['users','support','transactions','rates','add-money-requests'].map(value=><button key={value} disabled={busy} aria-pressed={tab===value} onClick={()=>void perform(()=>load(value))}>{value==='add-money-requests'?'Add Money Requests':value}</button>)}<button disabled={busy} onClick={()=>void perform(async()=>{await api('auth/logout','POST',{});setToken('');setRows([]);})}>Logout</button></nav>
 <section><h2>{tab==='add-money-requests'?'Add Money Requests':tab}</h2>{tab==='add-money-requests'&&<><p>Request review only. No payment verification, wallet credit or balance adjustment. Never treat a note as proof of payment.</p><button disabled={busy} onClick={()=>void perform(async()=>{await load();setEvents([]);setEventRequest('');})}>Refresh requests</button></>}{tab==='rates'&&<form onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('admin/rates','PUT',{value:rate});setRate('');await load();});}}><p>Internal AED/BDT configuration only. Customer rates remain unavailable.</p><label>Rate<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" value={rate} required onChange={e=>setRate(e.target.value)}/></label><button disabled={busy}>Save configuration</button></form>}
 {rows.length===0?<p>No records.</p>:<div className="table"><table><thead><tr>{Object.keys(rows[0]).map(key=><th key={key}>{key}</th>)}{['users','support','add-money-requests'].includes(tab)&&<th>Action</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id??i}>{Object.keys(rows[0]).map(key=><td key={key} data-label={key}>{String(row[key]??'—')}</td>)}{tab==='add-money-requests'&&<td data-label="Review"><label>Review note<input maxLength={500} value={reviewNotes[row.id]??''} onChange={e=>setReviewNotes({...reviewNotes,[row.id]:e.target.value})}/></label><select disabled={busy} aria-label={'Request status '+row.id} value={row.status} onChange={e=>{const status=e.target.value;void perform(async()=>{await api('admin/add-money-requests/'+row.id,'PATCH',{status,expected_status:row.status,note:reviewNotes[row.id]??''});setEvents([]);setEventRequest('');await load();});}}>{['pending','under_review','rejected','cancelled'].map(value=><option key={value}>{value}</option>)}</select><button disabled={busy} onClick={()=>void perform(async()=>{setEvents(await api('admin/add-money-requests/'+row.id+'/events'));setEventRequest(row.id);})}>View audit events</button></td>}{tab==='users'&&<td><button disabled={busy} onClick={()=>void perform(async()=>{await api('admin/users','PATCH',{id:row.id,status:row.status==='active'?'suspended':'active'});await load();})}>{row.status==='active'?'Suspend':'Activate'}</button></td>}{tab==='support'&&<td><select disabled={busy} aria-label="Ticket status" value={row.status} onChange={e=>{const status=e.target.value;void perform(async()=>{await api('admin/support','PATCH',{id:row.id,status});await load();});}}>{['open','in_progress','closed'].map(status=><option key={status}>{status}</option>)}</select></td>}</tr>)}</tbody></table></div>}
 {tab==='add-money-requests'&&eventRequest&&<div aria-live="polite"><h3>Audit events • {eventRequest}</h3>{events.map(event=><p key={event.id}>{event.created_at} • {event.previous_status??'new'} → {event.new_status} • {event.actor_id} {event.note&&'• '+event.note}</p>)}</div>}
 <p>Most recent 100 records. Transactions are read only.</p></section></>}
 <footer>Tokens stay in memory. Closing or reloading this page requires signing in again.</footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
