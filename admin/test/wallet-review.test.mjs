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
const {SendMoneyReview} = await vite.ssrLoadModule('/src/SendMoneyReview.tsx');
const sendReviewProps={recipientEventId:'0',recipientStatus:null,reconciliationEventId:'0',reconciliationStatus:null,
 onRecipient(){},onRecipientReview(){},onReconciliation(){}};

test('wallet view distinguishes unavailable from an actual zero balance', () => {
 const view = balance => renderToStaticMarkup(React.createElement(WalletView,{name:'Customer',wallet:{balance,currency:'AED',postingEnabled:false}}));
 assert.match(view(null), /Balance: Unavailable/);
 assert.match(view('0.00'), /AED 0.00/);
 assert.match(view('15.20'), /AED 15.20/);
 const reserved=renderToStaticMarkup(React.createElement(WalletView,{name:'Customer',wallet:{balance:'15.20',availableBalance:'5.20',heldBalance:'10.00',currency:'AED',postingEnabled:false}}));
 assert.match(reserved,/Available: AED 5.20/);
 assert.match(reserved,/Reserved: AED 10.00/);
});

test('send money review keeps confirmation disabled and prevents release with a reference', () => {
 const view=payoutReference=>renderToStaticMarkup(React.createElement(SendMoneyReview,{
  ...sendReviewProps,status:'pending',holdStatus:'held',payoutReference,busy:false,onReview(){},onReference(){},onHistory(){}
 }));
 const html=view('REF-1');
 assert.match(html,/Unverified payout reference: REF-1/);
 assert.match(html,/disabled="">Reject and release/);
 assert.match(html,/disabled="">Cancel and release/);
 assert.match(html,/not independent recipient verification/);
 assert.match(html,/disabled="">Payout and success unavailable/);
 assert.match(view(null),/Recording a reference prevents release; there is currently no API to reconcile and release it/);
 const disputed=renderToStaticMarkup(React.createElement(SendMoneyReview,{
  ...sendReviewProps,reconciliationEventId:'1',reconciliationStatus:'disputed',
  status:'pending',holdStatus:'held',payoutReference:null,busy:false,onReview(){},onReference(){},onHistory(){}
 }));
 assert.match(disputed,/disabled="">Reject and release/);
 assert.match(disputed,/Latest report: disputed/);
});

test('send money release requires a review note and sends the expected status', async () => {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example/'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));
 let submitted;
 try {
  await React.act(async()=>root.render(React.createElement(SendMoneyReview,{
   ...sendReviewProps,status:'pending',holdStatus:'held',payoutReference:null,busy:false,
   onReview(value){submitted=value;},onReference(){},onHistory(){}
  })));
  const reject=[...document.querySelectorAll('button')].find(item=>item.textContent==='Reject and release');
  assert.equal(reject.disabled,true);
  const input=[...document.querySelectorAll('label')].find(item=>item.textContent.startsWith('Review note')).querySelector('input');
  await React.act(async()=>{
   Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Not proceeding');
   input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  });
  assert.equal(reject.disabled,false);
  await React.act(async()=>reject.click());
  assert.deepEqual(submitted,{status:'rejected',expected_status:'pending',note:'Not proceeding'});
 } finally {
  await React.act(async()=>root.unmount());
  dom.window.close();
  delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
 }
});

test('recipient and reconciliation reports require notes and preserve review versions', async () => {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example/'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));
 let recipient, reconciliation;
 try {
  await React.act(async()=>root.render(React.createElement(SendMoneyReview,{
   ...sendReviewProps,recipientEventId:'15',reconciliationEventId:'20',reconciliationStatus:'unverified',
   status:'pending',holdStatus:'held',payoutReference:null,busy:false,onReview(){},onReference(){},onHistory(){},
   onRecipientReview(value){recipient=value;},onReconciliation(value){reconciliation=value;}
  })));
  const field=label=>[...document.querySelectorAll('label')].find(item=>item.textContent.startsWith(label));
  const button=text=>[...document.querySelectorAll('button')].find(item=>item.textContent===text);
  const setField=async(label,value)=>{
   const input=field(label).querySelector('input');
   await React.act(async()=>{
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
   });
  };
  const select=field('Recipient review result').querySelector('select');
  await React.act(async()=>{select.value='admin_reviewed';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await setField('Recipient review note','Checked records');
  assert.equal(button('Record recipient review').disabled,true);
  await setField('Recipient evidence reference','CASE-1');
  await React.act(async()=>button('Record recipient review').click());
  assert.deepEqual(recipient,{status:'admin_reviewed',expected_event_id:'15',note:'Checked records',evidence_reference:'CASE-1'});
  assert.equal(button('Record reconciliation report').disabled,true);
  await setField('Reconciliation note','Investigate');
  await React.act(async()=>button('Record reconciliation report').click());
  assert.deepEqual(reconciliation,{status:'unverified',expected_event_id:'20',note:'Investigate'});
  assert.equal(button('Payout and success unavailable').disabled,true);
 } finally {
  await React.act(async()=>root.unmount());
  dom.window.close();
  delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
 }
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
