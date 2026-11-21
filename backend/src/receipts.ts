import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { amount, fields, note } from './add-money.ts';
import { ApiError, text } from './security.ts';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const types = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type ReceiptType = typeof types[number];

export async function validateReceipt(content: Buffer, contentType: string): Promise<{ contentType: ReceiptType; sha256: string }> {
  if (content.length > MAX_RECEIPT_BYTES) throw new ApiError(413, 'Receipt too large');
  if (!types.includes(contentType as ReceiptType)) throw new ApiError(415, 'Receipt must be JPEG, PNG or PDF');
  const png = content.length >= 20 && content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    content.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  const jpeg = content.length >= 4 && content.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) &&
    content.subarray(-2).equals(Buffer.from('ffd9', 'hex'));
  const pdf = content.length >= 12 && content.subarray(0, 5).equals(Buffer.from('%PDF-')) &&
    /%%EOF\s*$/.test(content.subarray(-1024).toString('latin1'));
  if (!(contentType === 'image/png' && png || contentType === 'image/jpeg' && jpeg ||
        contentType === 'application/pdf' && pdf)) throw new ApiError(400, 'Invalid receipt content');
  try {
    if (contentType === 'application/pdf') {
      const document = await PDFDocument.load(content, {throwOnInvalidObject:true, updateMetadata:false});
      if (document.getPageCount() < 1) throw new Error('Empty PDF');
    } else {
      const image = sharp(content, {failOn:'error', limitInputPixels:16_000_000, sequentialRead:true});
      const metadata = await image.metadata();
      if (metadata.format !== (contentType === 'image/png' ? 'png' : 'jpeg')) throw new Error('Wrong image type');
      await image.raw().toBuffer();
    }
  } catch {
    throw new ApiError(400, 'Invalid receipt content');
  }
  return { contentType: contentType as ReceiptType, sha256: createHash('sha256').update(content).digest('hex') };
}

export async function readReceipt(req: IncomingMessage): Promise<{ content: Buffer; contentType: ReceiptType; sha256: string }> {
  const declaredLength = req.headers['content-length'];
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RECEIPT_BYTES)) {
    throw new ApiError(413, 'Receipt too large');
  }
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? '';
  if (!types.includes(contentType as ReceiptType)) throw new ApiError(415, 'Receipt must be JPEG, PNG or PDF');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_RECEIPT_BYTES) {
      req.resume();
      throw new ApiError(413, 'Receipt too large');
    }
    chunks.push(bytes);
  }
  const content = Buffer.concat(chunks, size);
  return { content, ...await validateReceipt(content, contentType) };
}

export function receiptReview(input: Record<string, unknown>) {
  fields(input, ['status', 'expected_status', 'verified_amount_aed', 'payment_reference', 'note']);
  const statuses = ['pending', 'under_review', 'rejected', 'verified'];
  if (typeof input.status !== 'string' || typeof input.expected_status !== 'string' ||
      !statuses.includes(input.status) || !statuses.includes(input.expected_status)) {
    throw new ApiError(400, 'Invalid receipt review status');
  }
  if (input.status !== 'verified' && (input.verified_amount_aed != null || input.payment_reference != null)) {
    throw new ApiError(400, 'Verification details require verified status');
  }
  return {
    status: input.status,
    expected: input.expected_status,
    verifiedAmount: input.status === 'verified' ? amount(input.verified_amount_aed) : null,
    reference: input.status === 'verified' ? text(input.payment_reference, 1, 120) : null,
    note: note(input.note)
  };
}
