'use strict';
const assert=require('node:assert/strict');
const S=require('../sky-shell');
assert.equal(S.radius(300,3),900);
assert.equal(S.radius(1000,1.5),1500);
assert.equal(S.radius(5000,3),15000);
assert.equal(S.radius(50000,3),150000); // No legacy 3 km cap.
assert.equal(S.radius(50000,10),500000);
assert.equal(S.sanitiseScale(0),1.5);
assert.equal(S.sanitiseScale(500),10);
assert.equal(S.sanitiseScale(Number.NaN),3);
assert.throws(()=>S.radius(0,3),RangeError);
console.log('Sky-shell radius tests passed');
