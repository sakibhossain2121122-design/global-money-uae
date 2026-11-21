import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {MAX_RECEIPT_BYTES, receiptReview, validateReceipt} from './receipts.ts';

test('receipt type, decoding and framing are checked and size is limited', async () => {
 const image = {create:{width:1,height:1,channels:3 as const,background:'#ffffff'}};
 const png = await sharp(image).png().toBuffer(), jpeg = await sharp(image).jpeg().toBuffer();
 const document = await PDFDocument.create(); document.addPage();
 const pdf = Buffer.from(await document.save());
 const startxref = pdf.lastIndexOf(Buffer.from('startxref'));
 const padding = Buffer.alloc(MAX_RECEIPT_BYTES-pdf.length, 0x20);
 padding[0]=0x25; padding[padding.length-1]=0x0a;
 const maxPdf=Buffer.concat([pdf.subarray(0,startxref),padding,pdf.subarray(startxref)]);
 for (const [data, type] of [[png,'image/png'],[jpeg,'image/jpeg'],[pdf,'application/pdf']] as const) {
  assert.equal((await validateReceipt(data,type)).sha256.length,64);
  await assert.rejects(()=>validateReceipt(data,'image/gif'));
 }
 assert.equal(maxPdf.length,MAX_RECEIPT_BYTES);
 assert.equal((await validateReceipt(maxPdf,'application/pdf')).contentType,'application/pdf');
 await assert.rejects(()=>validateReceipt(png,'image/jpeg'), /Invalid receipt/);
 await assert.rejects(()=>validateReceipt(Buffer.from('%PDF-1.4\ninvalid\n%%EOF'),'application/pdf'), /Invalid receipt/);
 await assert.rejects(()=>validateReceipt(Buffer.alloc(MAX_RECEIPT_BYTES+1),'image/png'), /too large/);
 await assert.rejects(()=>validateReceipt(Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9','hex'),'image/jpeg'), /Invalid receipt/);
});

test('verified receipt review requires amount, reference and known status', () => {
 assert.deepEqual(receiptReview({status:'verified',expected_status:'pending',verified_amount_aed:'12.3',payment_reference:' REF ',note:'ok'}),
  {status:'verified',expected:'pending',verifiedAmount:'12.30',reference:'REF',note:'ok'});
 assert.throws(()=>receiptReview({status:'verified',expected_status:'pending',verified_amount_aed:'12.30'}));
 assert.throws(()=>receiptReview({status:'verified',expected_status:'pending',verified_amount_aed:'0',payment_reference:'a'}));
 assert.throws(()=>receiptReview({status:'rejected',expected_status:'pending',payment_reference:'a'}));
 assert.throws(()=>receiptReview({status:'paid',expected_status:'pending'}));
});
