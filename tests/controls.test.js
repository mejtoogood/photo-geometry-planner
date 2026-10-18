'use strict';
const assert=require('node:assert/strict');
const c=require('../controls');
assert.equal(c.apertures[0],0.7);
assert.equal(c.apertures.at(-1),64);
assert.equal(new Set(c.apertures).size,c.apertures.length);
assert.ok(c.apertures.every((v,i)=>i===0||v>c.apertures[i-1]));
assert.equal(c.apertures[c.apertureIndex(5.6)],5.6);
assert.equal(c.apertures[c.apertureIndex(8.1)],8);
assert.equal(c.apertures[c.apertureIndex(2.75)],2.8);
assert.equal(c.apertures[c.apertureIndex(29)],29);
assert.equal(c.focalFromSlider(0),8);
assert.equal(c.focalFromSlider(1000),1200);
assert.equal(c.focusFromSlider(0),0.2);
assert.equal(c.focusFromSlider(1000),10000);
for(const focal of [14,20,24,35,50,85,105,200,300,600,1200]) {
  const roundTrip=c.focalFromSlider(c.focalToSlider(focal));
  assert.ok(Math.abs(roundTrip-focal)<=4,`${focal} focal -> ${roundTrip}`);
}
for(const focus of [0.25,0.5,1,1.6,3,10,100,1000,10000]){
  const roundTrip=c.focusFromSlider(c.focusToSlider(focus));
  assert.ok(Math.abs(Math.log(roundTrip/focus))<0.007,`${focus} m -> ${roundTrip}`);
}
assert.ok(c.focalToSlider(50)<c.focalToSlider(105));
assert.ok(c.focusToSlider(1.5)<c.focusToSlider(10));
console.log('Lens controls tests passed');
