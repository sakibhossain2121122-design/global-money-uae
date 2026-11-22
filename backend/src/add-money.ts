import {ApiError,text,uuid} from './security.ts';
export const reviewStatuses=['pending','under_review','rejected','cancelled'];
export function fields(b:Record<string,unknown>,allowed:string[]) {
 if(Object.keys(b).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported fields');
}
export function amount(value:unknown):string {
 if(typeof value!=='string'|| !/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$/.test(value))throw new ApiError(400,'Invalid AED amount');
 const minor=Math.round(Number(value)*100);
 if(minor<1||minor>100000000)throw new ApiError(400,'Amount must be AED 0.01 to 1,000,000.00');
 return (minor/100).toFixed(2);
}
export function note(value:unknown):string|null {
 if(value===undefined||value===null)return null;
 const result=text(value,0,500);return result||null;
}
export function submission(b:Record<string,unknown>) {
 fields(b,['amount_aed','payment_method_id','note','idempotency_key']);
 const method=text(b.payment_method_id,1,40);
 if(!/^[a-z0-9_]+$/.test(method))throw new ApiError(400,'Invalid payment method');
 return {amount:amount(b.amount_aed),method,note:note(b.note),key:uuid(b.idempotency_key)};
}
export function review(b:Record<string,unknown>) {
 fields(b,['status','expected_status','note']);
 if(typeof b.status!=='string'||typeof b.expected_status!=='string'||!reviewStatuses.includes(b.status)||!reviewStatuses.includes(b.expected_status))throw new ApiError(400,'Invalid review status');
 return {status:String(b.status),expected:String(b.expected_status),note:note(b.note)};
}
