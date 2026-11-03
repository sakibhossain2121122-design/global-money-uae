import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
let activeHashes = 0;
async function derive(value: string, salt: string, length: number): Promise<Buffer> {
  if (activeHashes >= 4) throw new ApiError(503, 'Please try again shortly');
  activeHashes++;
  try { return await scryptAsync(value, salt, length) as Buffer; }
  finally { activeHashes--; }
}
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export function text(value: unknown, min = 1, max = 120): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new ApiError(400, 'Invalid input');
  return value.trim();
}
export function uuid(value: unknown): string {
  const id = text(value, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new ApiError(400, 'Invalid identifier');
  return id;
}
export function email(value: unknown): string {
  const result = text(value, 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, 'Invalid email');
  return result;
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new ApiError(400, 'Password must contain 12–128 characters');
  return value;
}
export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(value, salt, 64) as Buffer).toString('hex');
}
export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  const [salt, digest] = stored.split(':');
  const actual = await derive(value, salt, 64) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const providers = ['bKash', 'Nagad', 'Rocket', 'Upay', 'Bank'];
export function beneficiary(b: Record<string, unknown>) {
  if (!providers.includes(String(b.provider))) throw new ApiError(400, 'Invalid provider');
  const account = text(b.account, 6, 40);
  if (b.provider !== 'Bank' && !/^(01[3-9][0-9]{8}|\+8801[3-9][0-9]{8})$/.test(account)) throw new ApiError(400, 'Invalid mobile wallet number');
  if (b.provider === 'Bank' && !/^[A-Za-z0-9 -]+$/.test(account)) throw new ApiError(400, 'Invalid bank account');
  return {name: text(b.name), provider: String(b.provider), account, bank: b.provider === 'Bank' ? text(b.bank) : null};
}
export function balanced(entries: {currency: string, amount: bigint}[]): boolean {
  if (entries.length < 2 || entries.some(e => e.amount === 0n || !/^[A-Z]{3}$/.test(e.currency))) return false;
  const totals = new Map<string, bigint>();
  for (const e of entries) totals.set(e.currency, (totals.get(e.currency) ?? 0n) + e.amount);
  return [...totals.values()].every(v => v === 0n);
}
export function financialPosting(): never { throw new ApiError(503, 'Service not yet available.'); }
export class Limiter {
  private hits = new Map<string, {count:number, reset:number}>();
  private max: number; private window: number;
  constructor(max = 100, window = 60000) { this.max = max; this.window = window; }
  allow(key: string, now = Date.now()): boolean {
    for (const [k,v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    const hit = this.hits.get(key) ?? {count:0, reset:now + this.window};
    hit.count++; this.hits.set(key, hit); return hit.count <= this.max;
  }
}
