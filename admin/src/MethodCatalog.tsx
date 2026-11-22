import React from 'react';

type Method = {id:string; name:string; logo_url:string|null; display_order:number; catalog_visible:boolean};

export function MethodCatalog({method, busy, onSave}: {
 method:Method; busy:boolean; onSave:(method:Method)=>void;
}) {
 return <form onSubmit={event=>{
  event.preventDefault();
  const data=new FormData(event.currentTarget);
  onSave({id:method.id,name:String(data.get('name')),logo_url:String(data.get('logo_url')) || null,
   display_order:Number(data.get('display_order')),catalog_visible:data.has('catalog_visible')});
 }}>
  <label>Name<input name="name" required maxLength={120} defaultValue={method.name}/></label>
  <label>Logo URL (HTTPS, no credentials or query)<input name="logo_url" type="url" maxLength={2048} defaultValue={method.logo_url ?? ''}/></label>
  <label>Display order<input name="display_order" type="number" min={0} max={10000} required defaultValue={method.display_order}/></label>
  <label>Visible to customers<input name="catalog_visible" type="checkbox" defaultChecked={method.catalog_visible}/></label>
  <button disabled={busy}>Save metadata</button>
 </form>;
}
