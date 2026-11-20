import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reservationPlan} from './ledger-plan.ts';
test('future reservations conserve value and release reverses the journal',()=>{
 const b={availableWallet:'available',heldWallet:'held',amountMinor:5n,availableMinor:10n,heldMinor:5n};
 const hold=reservationPlan({...b,operation:'hold'}),release=reservationPlan({...b,operation:'release'});
 assert.equal(hold.reduce((n,e)=>n+e.amountMinor,0n),0n);
 assert.deepEqual(release.map(e=>e.amountMinor),hold.map(e=>-e.amountMinor));
 for(const invalid of [{amountMinor:0n},{amountMinor:-1n},{availableMinor:4n},{heldWallet:'available'}])assert.throws(()=>reservationPlan({...b,...invalid,operation:'hold'}));
 assert.throws(()=>reservationPlan({...b,heldMinor:4n,operation:'release'}));
});
