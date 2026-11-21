import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';

const vite = await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
after(()=>vite.close());
const {WalletView, ReceiptReview} = await vite.ssrLoadModule('/src/WalletReview.tsx');
const {ReceiptPreview} = await vite.ssrLoadModule('/src/ReceiptPreview.tsx');

test('wallet view distinguishes unavailable from an actual zero balance', () => {
 const view = balance => renderToStaticMarkup(React.createElement(WalletView,{name:'Customer',wallet:{balance,currency:'AED',postingEnabled:false}}));
 assert.match(view(null), /Balance: Unavailable/);
 assert.match(view('0.00'), /AED 0.00/);
 assert.match(view('15.20'), /AED 15.20/);
});

test('receipt review displays recorded status but never enables credit', () => {
 const html=renderToStaticMarkup(React.createElement(ReceiptReview,{status:'verified',busy:false,onReview(){},onView(){},onHistory(){}}));
 assert.match(html, /Receipt status: verified/);
 assert.match(html, /does not authorize credit/);
 assert.match(html, /disabled="">Credit unavailable/);
 assert.match(html, /Receipt audit history/);
});

test('receipt previews use an image or a non-interactive PDF canvas, never an embedded document', () => {
 const view=type=>renderToStaticMarkup(React.createElement(ReceiptPreview,{url:'blob:receipt',type}));
 assert.match(view('image/png'), /<img[^>]+alt="Receipt preview"/);
 assert.match(view('application/pdf'), /canvas[^>]+aria-label="PDF receipt page"/);
 assert.doesNotMatch(view('application/pdf'), /<iframe/);
});

test('recording a verified review requires amount and reference without enabling credit', async () => {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example/'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));
 let submitted;
 try {
  await React.act(async()=>root.render(React.createElement(ReceiptReview,{
   status:'pending',busy:false,onReview(value){submitted=value;},onView(){},onHistory(){}
  })));
  const select=document.querySelector('select');
  await React.act(async()=>{select.value='verified';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='Record review');
  assert.equal(button.disabled,true);
  const setField=async(label,value)=>{
   const input=[...document.querySelectorAll('label')].find(item=>item.textContent.startsWith(label)).querySelector('input');
   await React.act(async()=>{
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
   });
  };
  await setField('Verified amount','12.34');
  await setField('Payment reference','REF-1');
  await setField('Receipt review note','Checked externally');
  assert.equal(button.disabled,false);
  await React.act(async()=>button.click());
  assert.deepEqual(submitted,{status:'verified',expected_status:'pending',verified_amount_aed:'12.34',payment_reference:'REF-1',note:'Checked externally'});
  assert.equal([...document.querySelectorAll('button')].find(item=>item.textContent==='Credit unavailable').disabled,true);
 } finally {
  await React.act(async()=>root.unmount());
  dom.window.close();
  delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
 }
});
